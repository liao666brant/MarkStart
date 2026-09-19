# 书签页面模块

面包屑：`src/features/bookmarks` ← `src/features` ← 项目根。

## 职责

管理书签树、目录切换、拖拽排序、默认目录和手势导航；`page.ts` 是遗留页面控制器，含 DOM 与 Chrome Bookmarks API 的副作用。

## 入口与对外接口

- 页面入口由 [`../../main.ts`](../../main.ts) 的 `import './features/bookmarks/page'` 触发。
- `root.ts` 导出 `getBookmarksBarId`；`order-sync.ts` 导出 `refreshBookmarkOrder` 与事件驱动的 `startBookmarkChangeSync`（监听 bookmarks 变更事件触发同步，无轮询）。
- `page-parsers.ts` 导出页面所用的存储/消息边界解析器和相关类型。
- `folder-swiper.ts` 用 Swiper 管理固定目录垂直整屏滑动，并导出当前书签列表查询。
- `card-colors.ts` 是书签卡颜色缓存的内存层：首次访问一次性载入 `bookmark-colors-*` localStorage 键，写操作延迟批量落盘；卡片渲染路径不得再逐卡同步读写 localStorage。文件夹卡用恒定默认色（无 favicon 可采样）；书签卡取色前把 favicon 降采样到 64×64。
- `card-update.ts` 提供 `updateBookmarkCard(bookmarkId, newTitle, newUrl, handlers)`：编辑书签成功后只更新单张卡片的 href/`data-url`/标题与 favicon，取色委托给调用方传入的 `handlers`；URL 未变时只改标题，跳过 favicon 重取与取色。
- `root.ts` 的 `getBookmarksBarId` 结果按会话缓存；`order-sync.ts` 用逐字段浅比较判断变化，`startBookmarkChangeSync` 接受可选 `quietPeriodMs`（page.ts 传 100）合流书签事件风暴。

## 关键依赖与数据

- Chrome `bookmarks`、`storage`、`history`、`tabs` API；`sortablejs`、`radashi` 和 `swiper`。
- `default-folders.ts` 只读写 `chrome.storage.local.defaultFolders`；不要改回 `storage.sync`。
- `page.ts` 依赖真实页面 DOM、`window` 全局契约及模块加载顺序，避免在未做页面验收时移动其初始化逻辑。
- 启动性能契约：固定目录 slide 只渲染激活页，其余在首次滑入时由 `onPinnedSlideChange` 惰性渲染；书签/文件夹右键菜单均为首次右键时惰性创建；`ensureScrollIndicator` 按容器保存一份滚动指示器绑定（`scrollIndicatorBindings`），新建绑定时清理已离场容器的监听与观察器，滑回已渲染的固定目录复用原绑定并重算显隐；不要退回“容器里有指示器就提前返回”，否则该目录的显隐不再更新；惰性渲染的 promise 带 catch 上报，避免未处理拒绝。
- 事件契约：书签卡的 click/contextmenu 走 document 级委托（`setupBookmarkCardDelegation`），卡片元素必须携带 `data-id`/`data-url`（card-update 编辑后同步刷新）；侧边栏树只构建首层，子层级在首次展开时从 `bookmarkTreeNodes` 懒构建（`buildSubfolderItems`）并按需绑定嵌套 Sortable；`displayBookmarks` 在子项 id/URL/标题序列与 DOM 一致时跳过重建，外部改名依赖该比对刷新视图。
- 目录滑动契约：`pinnedFolderSlides` 只保存固定目录；点击未固定目录时 `selectFolderSlide` 追加一个临时 slide（`temporaryFolderSlide`）并 `rebuild`，标签同步重建（临时标签带 `data-temporary="true"`，role=button + Enter/Space 激活）；`onPinnedSlideChange` 在 slide 的 `data-parent-id` 与其 id 不一致时重新拉取，覆盖“固定目录 slide 被未固定目录内容替换后滑回”的刷新。
- 侧边栏文件夹计数：优先用已缓存的整棵树在内存统计（`findFolderNodeInTree`/`countHttpBookmarksInTree`），树未加载时才回退到逐层 IPC。
- 滚轮切换：`initWheelSwitching` 读取 `chrome.storage.sync.enableWheelSwitching`（缺省 `false`）后调用 `swiper.setMousewheelEnabled`，Swiper 仅在多于一张 slide 时真正生效；设置面板改动派发 `wheelSwitchingChanged`（`detail.enabled`），page.ts 只注册一次 document 监听（`wheelSwitchingInitialized`）。
- 旧版 `localStorage.defaultBookmarkId`：写入路径与默认书签星标指示器均已移除，不要恢复；存量值仍决定 `updateBookmarkCards` 的启动目录并让侧边栏选中该目录。
- 删除契约：`deleteBookmark` 先等 `chrome.bookmarks.remove` 回调再动界面，失败只弹 `deleteBookmarkError` 并保留卡片；成功后淡出并在 300ms 后移除，只失效受影响父目录的 `bookmarksCache` 与 `bookmarkOrderCache`。
- favicon 统一走 `shared/favicon.ts` 的 `createFaviconUrl`（`size=64`），`page.ts` 建卡与 `card-update.ts` 编辑刷新都不得内联拼接 `_favicon` URL。
- 二维码生成用动态 `import('qrcode')`（点击生成时才加载），不要改回静态导入；快捷链接模块的 `qr-modal.ts` 同此约束。

## 测试与质量

- 纯逻辑测试：`tests/bookmark-root.test.ts`、`bookmark-order-sync.test.ts`、`bookmark-page-parsers.test.ts`、`bookmark-cache.test.ts`、`default-folders.test.ts`。
- 页面契约测试：`tests/bookmark-pinned-wheel.test.ts`、`bookmark-transient-swiper.test.ts`、`bookmark-tree-default-expanded.test.ts` 直接匹配 `page.ts` 源码片段，锁定惰性渲染刷新、临时 slide 与默认展开逻辑；改动对应代码须同步复核这些断言。
- 修改纯 helper 优先补 Node 测试；修改 `page.ts` 的 DOM/Chrome 行为须执行扩展页手工验收。

## 常见问题

- `page.ts` 是大控制器；拆分前先锁定现有 DOM 事件与全局函数的顺序。
- `BookmarkTreeNode` 的 ID 是字符串，默认目录数据缺失或过期时必须安全降级。

## 相关文件清单

- `page.ts`、`page-parsers.ts`、`root.ts`、`order-sync.ts`
- `card-colors.ts`、`card-update.ts`、`default-folders.ts`、`gesture-navigation.ts`、`folder-swiper.ts`、`bookmark-cache.ts`、`qr-modal.ts`
- `../../main.ts`、`../../../tests/bookmark-*.test.ts`、`../../../tests/default-folders.test.ts`
