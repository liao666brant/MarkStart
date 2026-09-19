# 快捷链接模块

面包屑：`src/features/quick-links` ← `src/features` ← 项目根。

## 职责

根据固定快捷方式、黑名单和浏览历史渲染常用站点，并提供编辑、删除、复制、二维码和右键菜单。

## 入口与对外接口

- [`index.ts`](index.ts) 是副作用页面入口，由 `src/main.ts` 加载；由原单文件控制器拆分为数据（`storage.ts`/`history.ts`/`shortcuts.ts`/`site-name.ts`）、视图（`view.ts`）与菜单/对话框（`menu.ts`/`dialogs.ts`/`qr-modal.ts`/`feedback.ts`）职责，自身只做编排。
- `history.ts` 导出 `rankHistoryItems`；`shortcuts.ts` 导出 `buildQuickLinks`。
- `storage.ts` 导出 `QuickLink`、存储解析器和缓存工厂；`site-name.ts` 导出 `getSiteName`。

## 关键依赖与数据

- 读取 Chrome `history` 与 `storage.sync`；缓存键为 `localStorage.quickLinksCache`。
- `fixedShortcuts` 是完整 `QuickLink[]`，`blacklist` 为域名字符串数组；外部存储值先经 `storage.ts` 窄化。
- `menu.ts`、`dialogs.ts`、`qr-modal.ts` 直接依赖页面 DOM 和 Chrome i18n，不应在 Node 环境直接导入。
- 性能契约：`DOMContentLoaded` 中 `quickLinksCache.load()` 必须先于 `generateQuickLinks()`；冷启动路径生成后必须 `quickLinksCache.set()`（否则 5 分钟 TTL 缓存永远无效）；编辑/删除/加入黑名单等数据变更走 `regenerateQuickLinks()`，内部先 `quickLinksCache.invalidate()`（内存与 `localStorage` 同时清空）再重建，避免旧快照覆盖刚保存的状态；黑名单种子域名以 localStorage 标志键 `blacklistSeededV2` 只写入一次（V2 起用 `chrome.runtime.id` 屏蔽扩展自身，快捷链接按 hostname 比对）；qrcode 为动态 `import()` 按需加载。
- favicon URL 统一走 `shared/favicon.ts` 的 `createFaviconUrl`（`size=64`）；`buildQuickLinks` 对固定项按当前模板重生成 favicon（派生数据，不读 storage 里持久化的旧 URL）；占位符数量用 `Math.max(0, 10 - shortcuts.length)` 计算，避免负数。

## 测试与质量

- 纯逻辑测试：`tests/quick-links-history.test.ts`、`quick-links-shortcuts.test.ts`、`quick-links-storage.test.ts`、`quick-links-site-name.test.ts`。
- UI/Chrome 行为变更需在真实扩展页验证右键菜单、编辑/删除、QR 200×200 canvas 和新窗口打开。

## 常见问题

- `index.ts` 的 `DOMContentLoaded` 内部初始化顺序是运行时契约。
- 固定链接与历史 URL 在构建阶段会使用 `new URL`；不要绕开已存在的历史项过滤。

## 相关文件清单

- `index.ts`、`storage.ts`、`history.ts`、`shortcuts.ts`、`site-name.ts`
- `view.ts`、`menu.ts`、`dialogs.ts`、`feedback.ts`、`qr-modal.ts`
- `../../../tests/quick-links-*.test.ts`
