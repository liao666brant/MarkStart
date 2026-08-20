# 搜索模块

面包屑：`src/features/search` ← `src/features` ← 项目根。

## 职责

维护内置与自定义搜索引擎、下拉选择、搜索标签和跨引擎临时搜索。

## 入口与对外接口

- `src/main.ts` 加载 `dropdown.ts`；书签页面调用 `interactions.ts` 初始化搜索输入、建议和跨引擎搜索。
- 对外导出包括 `SearchEngineManager`、`createSearchEngineDropdown`、`initializeSearchEngineDialog`、`createTemporarySearchTabs` 与图标 helper。

## 关键依赖与数据

- Chrome `storage`、`tabs` API，页面搜索 DOM 与本地化函数。
- 自定义搜索引擎使用 localStorage；URL 模板以 `%s` 作为查询占位。

## 测试与质量

- 页面搜索和引擎选择缺独立单测；变更后至少验证搜索输入、引擎切换和 Cmd/Ctrl+Enter 多标签行为。

## 常见问题

- `dropdown.ts` 管理引擎选择，`interactions.ts` 管理页面搜索交互；CSS 类名 `search-engine-dropdown` 不是文件路径，不要随文件重命名而改动。

## 相关文件清单

- `dropdown.ts`
- `interactions.ts`
- `../bookmarks/page.ts`、`../../main.ts`、`../../index.html`

## 变更记录

- 2026-08-20：入口文件名收紧为 `dropdown.ts`。
