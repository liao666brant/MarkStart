# 壁纸模块

面包屑：`src/features/wallpaper` ← `src/features` ← 项目根。

## 职责

管理预设、Bing、上传和纯色壁纸，并处理背景持久化与欢迎区颜色协调。

## 入口与对外接口

- `src/main.ts` 通过目录入口加载 `index.ts`。
- `index.ts` 导出 `WallpaperManager`，并在 `DOMContentLoaded` 创建实例。

## 关键依赖与数据

- 页面 DOM、localStorage、图片加载、Chrome i18n；欢迎模块需要先于壁纸模块加载。
- 上传壁纸的二进制以 Blob 存入 IndexedDB（`blob-store.ts`，库名 `markstart-wallpapers`）；localStorage 仅保留 `idb:<id>` 引用（键约定见 `storage-keys.ts`）与轻量元数据 `userWallpapers: [{storageKey, title, timestamp}]`。旧版 dataURL 数据在启动时自动迁移，迁移失败回退原读取逻辑；保持已有兼容键不变。
- 首帧预览（`preview.ts`）：在线地址与 `idb:` 上传壁纸在设置成功后生成约 160px 宽的低清 WebP，存 `localStorage['wallpaperPreview'] = {source, dataUrl}`；启动时 `source` 与 `originalWallpaper` 一致才先铺底，真实壁纸加载完成后覆盖同一批样式属性。本地预设图不在预览范围内——`startup-wallpaper.js` 已在首帧直接绘制这类来源；引用不一致、来源不支持或数据损坏时启动路径会删除该键自愈。生成预览不阻塞壁纸切换：上传壁纸直接读 IndexedDB 的 Blob，在线地址取回带 8 秒 AbortController 超时并用 `createImageBitmap` 按目标宽度直接解码（不先加载整幅原图），写回前校验 `originalWallpaper` 仍是该来源。
- 启动性能契约：`bootstrap` 中壁纸恢复（`initializeWallpaper`）与用户壁纸清单加载并行且先于一切网格构建；预设与 Bing 网格在设置侧栏首次打开时才构建（触发源：`#settings-link` capture 点击 + `markstart:open-settings` 事件，均为一次性）。不要把网格构建挪回启动路径。
- Bing 请求治理：元数据按日缓存（localStorage 带日期戳），失败后 30 分钟退避，fetch 带 8 秒 AbortController 超时；缩略图用 `urlbase` 拼 `_800x480.jpg` 低清版，点击设壁纸才取 UHD 原图。
- 背景只在 body 一层绘制（inline background + 深色模式 CSS 变量），main 不再持有 background 规则；不要恢复双层绘制。
- `blob-store.ts` 复用单个 IndexedDB 连接（模块级 Promise 单例，`onclose`/`onerror`/`onversionchange` 自动失效重建）。

## 测试与质量

- `tests/wallpaper-storage-keys.test.ts` 覆盖存储键约定与 dataURL 解码；`tests/wallpaper-preview.test.ts` 覆盖首帧预览的准入与解析。变更后需在扩展页验证预设选择、上传校验、持久化和重新加载。

## 常见问题

- 背景切换是异步图片加载流程；验收应等待页面背景真正应用而非只检查点击事件。
- 恢复已保存壁纸失败时只在 `idb:` 引用的 Blob 确实缺失（`getWallpaperBlob` 返回 null）时清除该引用自愈；在线地址加载失败（离线等）保留引用、只用 `applyFallbackBackground` 回退默认背景（不写 `useDefaultBackground`），下次启动重试。不要改成任意失败都清引用。

## 相关文件清单

- `index.ts`
- `blob-store.ts`、`storage-keys.ts`、`preview.ts`、`background.ts`
- `../onboarding/welcome.ts`、`../../main.ts`、`../../startup-wallpaper.ts`、`../../index.html`

## 变更记录

- 2026-09-19：新增首帧预览——在线与上传壁纸生成低清预览并在启动时先铺底，本地预设仍由 `startup-wallpaper.js` 首帧绘制。
- 2026-09-19：预览生成加固——上传来源直接读 IndexedDB Blob、在线原图取回带 8 秒超时，改用 `createImageBitmap` 按目标宽度解码（不再先加载整幅原图），写回前校验壁纸来源未被切换。
- 2026-08-23：性能整改——壁纸恢复先行并行、网格懒构建、Bing 按日缓存/退避/低清缩略图、单层背景绘制、上传去 base64 中转、IDB 连接复用、删除约 180 行死代码。
- 2026-08-20：壁纸入口收紧为目录 `index.ts`。
- 2026-08-21：上传/当前壁纸二进制迁入 IndexedDB Blob，localStorage 改存引用；旧 dataURL 启动时自动迁移；压缩质量降为 0.8。
