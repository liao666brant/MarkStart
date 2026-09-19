# 设置模块

面包屑：`src/features/settings` ← `src/features` ← 项目根。

## 职责

负责设置侧栏、外观与布局选项、链接打开方式、快捷链接和手势配置的页面交互。

## 入口与对外接口

- `src/main.ts` 通过目录入口加载 `index.ts`。
- 该模块以页面副作用为主，未发现稳定的独立业务 API。

## 关键依赖与数据

- 依赖 Chrome storage、页面设置侧栏 DOM 以及其他功能模块暴露的全局行为。
- 偏好项：布局 tab 的显示开关（搜索框/欢迎语/页脚/快捷访问链接）、自定义欢迎语输入框 `#custom-welcome-message`（`customWelcomeMessage` 键）、书签宽度/高度/容器尺寸与页面间距滑块、快捷链接与打开方式、搜索建议与滚轮切换；同步配置在 `init()` 内一次批量 `chrome.storage.sync.get` 读取，首启缺失项的默认值合并为单次 `chrome.storage.sync.set` 写入。
- 性能与生命周期契约：构造函数只做 init 调度，全部 DOM 查询在 `init()`（空闲回调 `requestIdleCallback`，超时 2000ms）内执行，不要把查询挪回构造函数；`init()` 幂等，空闲回调与提前打开侧栏两条路径只生效一次；滑块 input 处理经 `coalesceInputFrame` 按帧合流，宽度预览只读一次 `getComputedStyle` 并复用 `offsetWidth`；防抖统一用 radashi `debounce`（resize 250ms 且仅侧栏打开时计算预览，自定义欢迎语 300ms 落盘），不要再自建 debounce；`.bookmarks-list` 引用缓存带 `isConnected` 自检（folder-swiper rebuild 会替换节点）；wheel-switching 标签只走通用 tab 绑定，勿再单独绑定 click。
- 壁纸网格与上传入口 `#upload-wallpaper` 在设置侧栏 DOM 内，但由壁纸模块懒构建与接管；本模块只提供侧栏与 tab 容器。

## 测试与质量

- `tests/single-page-entry.test.ts` 锁定 `src/main.ts` 的副作用导入顺序（含 `features/settings`）。
- 修改设置值、侧栏或布局后，在扩展页逐项确认保存和重新打开后的状态。

## 常见问题

- `index.ts` 是目录入口命名，不代表无副作用；保持 `main.ts` 的导入顺序。
- `markstart:open-settings` 事件与设置图标点击都会打开侧栏；空闲初始化完成前打开时 `openSettingsSidebar` 会同步补 `init()`，避免点击静默失效。

## 相关文件清单

- `index.ts`
- `../../main.ts`、`../../index.html`
- `../../../tests/single-page-entry.test.ts`
