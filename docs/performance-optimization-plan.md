# MarkStart 性能优化方案

> 状态：方案评审中　|　基线：master @6664970（v1.245）　|　日期：2026-08-21

## 1. 背景与目标

MarkStart 是 MV3 新标签页扩展，核心体验指标是**从打开新标签页到可交互的耗时**，以及日常使用中的滚动流畅度与空闲资源占用。本方案基于对 `src/` 全量源码的静态分析（约 10,400 行 TS），识别出以下性能问题并给出分阶段优化路径。

目标：

1. 缩短新标签页首屏可交互时间；
2. 消除常驻定时器与无效调度带来的空闲开销；
3. 降低单次交互（切换目录、调整壁纸）的 CPU 峰值；
4. 不改变任何用户可见行为（以现有 MV3 页面行为为兼容基线）。

## 2. 度量方法（先量化，再动手）

动手前先建立基线，避免无依据优化：

| 指标 | 测量方式 |
| --- | --- |
| 首屏可交互时间 | DevTools Performance 面板录制新标签页打开过程，取首次绘制到主线程空闲的时间窗 |
| 空闲开销 | 打开页面静置 1 分钟，观察 Performance Monitor 的 CPU 占用与定时器触发 |
| 单次交互峰值 | 录制"上传壁纸""切换固定目录"操作段的长任务（Long Task）分布 |
| 内存 | 任务管理器对比扩展页与其他新标签页的内存占用 |

每完成一个阶段复测一次对应指标，输入未变化时不重复全量测试。

## 3. 问题清单与优化项

### P0-1 虚拟滚动机制已失效（死代码）

**证据**：`src/features/bookmarks/page.ts:429`

```ts
function renderVisibleBookmarks() {
  if (!getActiveBookmarksList()) return;
}
```

函数体为空，但围绕它保留了完整的调度机器：scroll 监听 + `throttle(16ms)` + `requestAnimationFrame`（`page.ts:436-441`）、`ResizeObserver` + `debounce(100ms)`（`page.ts:473`）、以及配套的 cleanup/rebind 逻辑。每次滚动和窗口 resize 都在白跑调度，书签列表实际是全量渲染。

**方案**（二选一）：

- 书签目录通常几十条 → 删除整套虚拟滚动机制（YAGNI），保留 `displayBookmarks` 的 DocumentFragment 全量渲染即可；
- 若确有上千书签的大目录场景 → 恢复真正的虚拟化实现（只渲染可视区 ± buffer 的卡片）。

**验收**：滚动书签列表无功能回归；Performance 录制中滚动期间无空转的 rAF/throttle 调用。

### P0-2 书签排序轮询改为事件驱动

**证据**：`src/features/bookmarks/order-sync.ts:41` —— `setInterval` 每 30 秒调用 `chrome.bookmarks.getChildren`，并用 `JSON.stringify` 对比缓存决定是否重渲染。页面存活期间持续产生 IPC 与序列化开销，且排序变化最多延迟 30 秒才反映。

**方案**：改用 Chrome 事件监听：`chrome.bookmarks.onChanged` / `onMoved` / `onChildrenReordered`（必要时加 `onCreated` / `onRemoved`）。事件回调里执行现有的 `refreshBookmarkOrder` 对比逻辑后按需重渲染。

**收益**：空闲时零开销；外部改动即时生效（体验同步提升）。

**验收**：在另一个窗口增删改书签，当前目录实时更新；静置时 Performance Monitor 无周期性活动。

### P0-3 欢迎语分钟级定时器收敛

**证据**：`src/features/onboarding/welcome.ts:277` —— `setInterval(updateWelcomeMessage, 60_000)` 常驻运行，而欢迎语内容仅依赖当前时间段。

**方案**：改为对齐下一个分钟边界的单次 `setTimeout`，触发后重排下一次；或仅在 `visibilitychange` 回到可见时刷新。

**验收**：跨时段打开新标签页欢迎语正确；静置时无每分钟固定唤醒。

### P1-1 壁纸存储从 localStorage dataURL 迁移到 IndexedDB Blob

**证据**：`src/features/wallpaper/index.ts`

- 上传压缩后 `canvas.toDataURL('image/jpeg', 1)`（质量 1.0，`:461`）整串 base64 写入 `localStorage['originalWallpaper']`（`:419`）；
- 用户壁纸列表整体 `JSON.stringify` 后存 `localStorage['userWallpapers']`（`:534`, `:541`）；
- 每次启动同步读回（`:267-269`）。

**问题**：localStorage 读写同步阻塞主线程；base64 使体积膨胀约 33%，多张壁纸易逼近 ~5MB 配额；质量 1.0 的 JPEG 无必要地放大了数据量。

**方案**：

1. 图片二进制以 **Blob 存入 IndexedDB**（object store 按 id 索引），localStorage 只保留当前选中项的 key 引用与轻量元数据；
2. 加载时异步读取 Blob → `URL.createObjectURL` 设置背景，用毕 `revokeObjectURL`；
3. 压缩质量降到 0.8（代码中其他路径已在用 0.7~0.8，保持一致）；
4. **旧数据迁移**：首次启动检测到旧 localStorage 键时，解码 dataURL 转 Blob 写入 IndexedDB 后清除旧键。

**验收**：上传/切换/重置壁纸行为不变；重启后壁纸恢复；含旧数据的 profile 升级后正常显示；主线程无大字符串同步读写。

### P1-2 取色算法降采样

**证据**：`src/features/bookmarks/page.ts` 的 `getColors()` —— 将原图完整绘制到 canvas 后逐像素扫描，每个像素生成 `"r,g,b"` 字符串键写入 Record，最后对全部条目排序。一张 4K 壁纸约 800 万像素，意味着数百万次字符串分配加一次超大排序，而其结果仅用于欢迎语文字颜色。

**方案**：先把图片绘制到 **64×64 离屏 canvas** 再取色。视觉结果几乎无差别，CPU 开销下降三个数量级。可选进一步简化：直接跳过 alpha 为 0 的像素后用 `Map<number>` 以 `(r<<16)|(g<<8)|b` 整数为键，避免字符串分配。

**验收**：同一组壁纸上调整后的文字颜色与现实现一致（抽样对比）；该步骤耗时从百毫秒级降至毫秒级。

### P2-1 合并分散的 chrome.storage.sync.get

**证据**：仅 `page.ts` 启动路径就有 7~8 次独立 `storage.sync.get`（`:147`, `:621`, `:630`, `:639`, `:647`, `:654`, `:670`, `:1130`），每次一次 IPC 往返；`settings/index.ts` 中存在大量成对 get→set。

**方案**：启动时一次批量 `get`（keys 数组或带默认值的对象），各初始化函数从共享结果对象取值；settings 内部同键的读写收敛为"读一次、写各自键"。不引入新的抽象层，用一个模块内局部函数分发即可。

**验收**：设置各项行为不变；启动 trace 中 storage IPC 往返次数明显减少。

### P2-2 非关键模块延迟初始化

**证据**：`src/main.ts` 以副作用导入同步初始化全部模块，其中设置侧栏、feature-tips、二维码弹窗、快捷链接菜单均非首屏必需。

**方案**：首屏只保留壁纸、书签、搜索框的初始化；其余模块的 DOM 绑定推迟到 `requestIdleCallback` 或首次交互时执行。注意：

- `main.ts` 的副作用导入顺序是页面初始化契约（见根 AGENTS.md），调整前先核对入口测试；
- wallpaper 模块依赖 WelcomeManager 先加载（`wallpaper/index.ts:37` 有显式检查），welcome 必须保持在 wallpaper 之前。

**验收**：全部功能可用且提示、二维码、设置面板正常弹出；首屏可交互时间缩短。

### P3-1 面包屑 MutationObserver 用途复核

**证据**：`page.ts:2743` 存在对 `.folder-name` 元素的 MutationObserver（debounce 200ms），而 `updateFolderName` 本身会写该元素的 `innerHTML`——存在自触发回路的隐患。

**方案**：确认其存在原因；若只是为响应面包屑更新做后续处理，改为直接函数调用，删除观察器。

**验收**：切换目录后面包屑与联动行为不变。

### P3-2 列表重建粒度（暂缓）

`displayBookmarks`（`page.ts:1355`）每次全量重建并重绑 sortable。P0-2 改事件驱动后触发频率低，暂不动；将来需要局部更新（如单个书签改名）时再引入按 id 复用节点的最小 diff，现在不做提前抽象（YAGNI）。

## 4. 实施顺序

| 阶段 | 内容 | 主要文件 | 预期效果 |
| --- | --- | --- | --- |
| 1 | P0-1 清理失效虚拟滚动 | bookmarks/page.ts | 消除滚动/resize 空转调度 |
| 2 | P0-2 + P0-3 定时器事件化 | order-sync.ts, welcome.ts | 空闲零轮询开销 |
| 3 | P1-2 取色降采样 | bookmarks/page.ts | 单次 CPU 峰值降三个数量级 |
| 4 | P1-1 壁纸迁 IndexedDB | wallpaper/index.ts | 启动不再被同步大字符串阻塞 |
| 5 | P2-1 + P2-2 批量配置读取、延迟非关键模块 | page.ts, main.ts 等 | 缩短首屏可交互时间 |
| 6 | P3-1 观察器复核 | bookmarks/page.ts | 消除潜在反馈回路 |

每个阶段独立提交，便于按需回滚与对照测量。

## 5. 风险与兼容性

- **P1-1 动持久化格式**：必须包含旧数据迁移路径，并在真实 profile 上验证升级场景；迁移失败时回退到旧读取逻辑。
- **P2-2 动初始化顺序**：`main.ts` 导入顺序是契约，涉及模块移动需同步核对入口测试与相关 AGENTS.md。
- **编码规范约束**：全程严格 TypeScript（不用 `any`/断言/非空断言），IndexedDB 与 Chrome API 边界以 `unknown` 接收并窄化。
- **行为基线**：所有改动以现有页面行为为兼容基线，纯内部重构也需复核受影响交互。

## 6. 验证清单

每阶段完成后：

1. `npm run typecheck` 通过；
2. 受影响的 Node 测试通过（`npm test`）；
3. `npm run build` 后在真实扩展页验证：
   - 阶段 1/2/6：书签浏览、目录切换、外部修改书签的同步、欢迎语时段展示；
   - 阶段 3：多张壁纸下欢迎语文字颜色正确；
   - 阶段 4：上传/预设/Bing 壁纸切换、重启恢复、旧数据迁移、重置；
   - 阶段 5：设置面板全部开关与滑块、搜索建议、快捷链接菜单。
4. 用第 2 节的方法复测对应指标，与基线对比记录。

## 7. 附录：运行时性能分析环境记录

计划使用 agent-browser（Playwright 系 CLI，支持 `trace start/stop`、`profiler start/stop`、`vitals`）对真实扩展页做运行时剖析。2026-08-21 尝试结果：

- `agent-browser --extension <dist> open` 可正常启动 Chrome 152 并注入自动化扩展，但进程参数中未出现 `--load-extension`，扩展未实际安装（`chrome://extensions` 列表为空），无法直接导航到 `chrome-extension://<id>/src/index.html`；
- 结论：当前工具链无法自动加载未打包扩展，运行时剖析需采用替代路径：
  1. 手动 `google-chrome --load-extension=$PWD/dist --auto-open-devtools-for-tabs` 打开扩展页后，用 `agent-browser --cdp <port>` 连接已有实例执行 trace/profiler；
  2. 或在浏览器手动加载 dist 后开启远程调试端口再接入。
- 该限制不影响本方案的静态分析结论；第 2 节的基线测量在第 1 阶段动手前补做。
