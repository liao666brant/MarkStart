# 快捷链接模块

面包屑：`src/features/quick-links` ← `src/features` ← 项目根。

## 职责

根据固定快捷方式、黑名单和浏览历史渲染常用站点，并提供编辑、删除、复制、二维码和右键菜单。

## 入口与对外接口

- [`index.ts`](index.ts) 是副作用页面入口，由 `src/main.ts` 加载。
- `history.ts` 导出 `rankHistoryItems`；`shortcuts.ts` 导出 `buildQuickLinks`。
- `storage.ts` 导出 `QuickLink`、存储解析器和缓存工厂；`site-name.ts` 导出 `getSiteName`。

## 关键依赖与数据

- 读取 Chrome `history` 与 `storage.sync`；缓存键为 `localStorage.quickLinksCache`。
- `fixedShortcuts` 是完整 `QuickLink[]`，`blacklist` 为域名字符串数组；外部存储值先经 `storage.ts` 窄化。
- `menu.ts`、`dialogs.ts`、`qr-modal.ts` 直接依赖页面 DOM 和 Chrome i18n，不应在 Node 环境直接导入。

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

## 变更记录

- 2026-08-20：由单文件控制器拆分为数据、视图、菜单和对话框职责。
