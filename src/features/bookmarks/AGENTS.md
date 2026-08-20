# 书签页面模块

面包屑：`src/features/bookmarks` ← `src/features` ← 项目根。

## 职责

管理书签树、目录切换、拖拽排序、默认目录和手势导航；`page.ts` 是遗留页面控制器，含 DOM 与 Chrome Bookmarks API 的副作用。

## 入口与对外接口

- 页面入口由 [`../../main.ts`](../../main.ts) 的 `import './features/bookmarks/page'` 触发。
- `root.ts` 导出 `getBookmarksBarId`；`order-sync.ts` 导出 `refreshBookmarkOrder`。
- `page-parsers.ts` 导出页面所用的存储/消息边界解析器和相关类型。

## 关键依赖与数据

- Chrome `bookmarks`、`storage`、`history`、`tabs` API；`sortablejs` 和 `radashi`。
- `default-folders.ts` 只读写 `chrome.storage.local.defaultFolders`；不要改回 `storage.sync`。
- `page.ts` 依赖真实页面 DOM、`window` 全局契约及模块加载顺序，避免在未做页面验收时移动其初始化逻辑。

## 测试与质量

- 相关测试：`tests/bookmark-root.test.ts`、`bookmark-order-sync.test.ts`、`bookmark-page-parsers.test.ts`、`default-folders.test.ts`。
- 修改纯 helper 优先补 Node 测试；修改 `page.ts` 的 DOM/Chrome 行为须执行扩展页手工验收。

## 常见问题

- `page.ts` 是大控制器；拆分前先锁定现有 DOM 事件与全局函数的顺序。
- `BookmarkTreeNode` 的 ID 是字符串，默认目录数据缺失或过期时必须安全降级。

## 相关文件清单

- `page.ts`、`page-parsers.ts`、`root.ts`、`order-sync.ts`
- `default-folders.ts`、`gesture-navigation.ts`
- `../../main.ts`、`../../../tests/bookmark-*.test.ts`

## 变更记录

- 2026-08-20：从根级 TypeScript 文件迁入功能目录并建立模块索引。
