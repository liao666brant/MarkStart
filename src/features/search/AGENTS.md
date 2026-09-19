# 搜索模块

面包屑：`src/features/search` ← `src/features` ← 项目根。

## 职责

维护内置与自定义搜索引擎、下拉选择、搜索标签和跨引擎临时搜索。

## 入口与对外接口

- `src/main.ts` 以副作用导入加载 `dropdown.ts`（在 `settings` 之后、`quick-links` 之前，顺序属页面初始化契约，由 `tests/single-page-entry.test.ts` 锁定）；书签页面 `features/bookmarks/page.ts` 调用 `interactions.ts` 初始化搜索输入、建议和跨引擎搜索。
- 对外导出包括 `SearchEngineManager`、`updateSearchEngineIcon`、`setSearchEngineIcon`、`createSearchEngineDropdown`、`initializeSearchEngineDialog`、`getSearchUrl` 与 `createTemporarySearchTabs`。

## 关键依赖与数据

- Chrome `storage`、`tabs` API，页面搜索 DOM 与本地化函数。
- 自定义搜索引擎使用 localStorage；URL 模板以 `%s` 作为查询占位，`getSearchUrl` 按引擎名或别名解析、找不到时回退默认引擎。
- 性能契约：搜索框只绑一个 focus/blur 处理器（`.focused` 切换 + 建议查询合一），不要重复绑定；建议设置（`showHistorySuggestions` 等）走模块级缓存 + `storage.onChanged` 失效；输入链路用递增 `suggestionQueryId` 丢弃过期查询，新增异步查询必须接入；`getRecentHistory` 有 60 秒 TTL 内存缓存；`createDropdownUI` 复用容器，iconContainer/document 监听只绑一次；跨引擎临时搜索的标签点击只走 `interactions.ts` 的容器级委托（标签在创建时已按序恢复），不要给单个标签再加点击处理器，否则一次点击会开两个标签；引擎开关/增删后下拉与标签栏整栏重建（`scheduleEngineUiRefresh` 以 300ms 防抖合并），标签顺序由 `createTemporarySearchTabs` 读取 `localStorage.orderedSearchEngines` 在创建处应用。
- 搜索建议的文本、URL、favicon 一律用 `textContent`/属性赋值构造，禁止把网页或书签标题拼进 `innerHTML`；图标 URL 统一走 `shared/favicon.ts` 的 `createFaviconUrl`（`size=64`；`cache` 参数在 MV3 `_favicon/` 端点无效，不要加回）。
- 用户行为表 `userSearchBehavior`（`storage.local`）走内存缓存 + 1 秒防抖落盘 + `storage.onChanged` 失效 + `pagehide` 兜底刷新，相关性热路径不再逐键读 storage。

## 测试与质量

- 页面搜索和引擎选择缺独立单测；变更后至少验证搜索输入、引擎切换和 Cmd/Ctrl+Enter 多标签行为。

## 常见问题

- `dropdown.ts` 管理引擎选择，`interactions.ts` 管理页面搜索交互；CSS 类名 `search-engine-dropdown` 不是文件路径，不要随文件重命名而改动。

## 相关文件清单

- `dropdown.ts`
- `interactions.ts`
- `../bookmarks/page.ts`、`../../main.ts`、`../../index.html`
