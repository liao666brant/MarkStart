# 测试模块

面包屑：`tests` ← 项目根。

## 职责

使用 Node 内置测试框架和 `tsx --test` 覆盖纯逻辑、入口契约、MV3 构建及发布包内容。

## 入口与运行

- 运行全部测试：`npm test`。
- 运行单个文件：`npm test -- tests/<name>.test.ts`。
- 需要真实 Vite 构建或 ZIP 的测试会创建临时目录；不要依赖已有 `dist/`。

## 测试与质量

- `mv3-build.test.ts` 验证 MV3 worker 产物。
- `package-extension.test.ts` 在隔离副本中执行真实 `npm run package`。
- `quick-links-*.test.ts` 覆盖拆分出的纯函数；入口测试维护单页面与模块加载契约。
- `bookmark-order-sync.test.ts` 同时覆盖事件合流（quietPeriodMs）的行为契约。

## 常见问题

- 不要用源码路径断言替代功能测试；仅在入口/构建契约确实依赖该路径时保留。
- 测试不得写入仓库的 `dist/` 或 `release/`。

## 相关文件清单

- `mv3-build.test.ts`、`package-extension.test.ts`、`single-page-entry.test.ts`
- `quick-links-*.test.ts`、`bookmark-*.test.ts`、`npm-dependencies.test.ts`

## 变更记录

- 2026-08-23：`bookmark-order-sync.test.ts` 新增书签事件合流（quietPeriodMs 前导+收尾同步）覆盖。
- 2026-08-20：测试路径随功能目录重组，并新增快捷链接和书签解析器边界覆盖。
