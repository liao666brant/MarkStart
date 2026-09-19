# 测试模块

面包屑：`tests` ← 项目根。

## 职责

使用 Node 内置测试框架和 `tsx --test` 覆盖纯逻辑、入口契约、MV3 构建及发布包内容。

## 入口与运行

- 运行全部测试：`npm test`。
- 运行单个文件：`npm test -- tests/<name>.test.ts`。
- 类型检查：`npm run typecheck`（`tsc --noEmit`），覆盖 `src/`、`tests/`、`scripts/` 与 `vite.config.mts`。
- 需要真实 Vite 构建或 ZIP 的测试会创建临时目录；不要依赖已有 `dist/`。

## 测试与质量

- 入口/构建/发布契约：`single-page-entry.test.ts` 断言唯一 TS 入口与 `main.ts` 的有序副作用导入；`mv3-build.test.ts` 验证 MV3 worker 产物；`npm-dependencies.test.ts` 在生产构建里确认 QRCode、radashi（改断言 `isPending`，函数名会被压缩）、throttle、sortable、swiper 已进 bundle，并校验 `startup-wallpaper.js` 以外部脚本引入；`package-extension.test.ts` 在隔离副本中执行真实 `npm run package` 并校验 ZIP 只含可执行产物。
- 书签：`bookmark-root.test.ts`、`bookmark-page-parsers.test.ts`、`bookmark-cache.test.ts`、`default-folders.test.ts` 覆盖纯逻辑；`bookmark-order-sync.test.ts` 覆盖排序刷新与事件合流（quietPeriodMs 前导+收尾）；`bookmark-pinned-wheel.test.ts`、`bookmark-transient-swiper.test.ts`、`bookmark-tree-default-expanded.test.ts` 直接匹配 `page.ts` 源码片段，锁定页面契约。
- 快捷链接：`quick-links-history.test.ts`、`quick-links-site-name.test.ts`、`quick-links-shortcuts.test.ts`、`quick-links-storage.test.ts` 覆盖排序、命名、链接构建与缓存持久化/失效。
- 壁纸：`wallpaper-preview.test.ts` 覆盖预览记录解析与来源筛选；`wallpaper-startup.test.ts` 在 vm 中执行 `src/startup-wallpaper.ts` 校验首帧脚本；`wallpaper-storage-keys.test.ts` 覆盖 idb 键与 data URL 解码。
- 共享：`icons.test.ts` 覆盖图标渲染与 Material 回退。

## 常见问题

- 不要用源码路径断言替代功能测试；仅在入口/构建契约确实依赖该路径时保留。
- 测试不得写入仓库的 `dist/` 或 `release/`。

## 相关文件清单

- `single-page-entry.test.ts`、`mv3-build.test.ts`、`npm-dependencies.test.ts`、`package-extension.test.ts`
- `bookmark-*.test.ts`、`default-folders.test.ts`、`quick-links-*.test.ts`、`wallpaper-*.test.ts`、`icons.test.ts`
- `../src/index.html`、`../src/main.ts`、`../src/startup-wallpaper.ts`、`../package.json`
