# 页面共享模块

面包屑：`src/shared` ← `src` ← 项目根。

## 职责

提供跨功能模块使用的全局类型、图标、favicon URL 构造、国际化和共享数据类型。

## 入口与对外接口

- `localization.ts` 由 `src/main.ts` 首先加载并注册本地化能力。
- `icons.ts` 导出图标映射 `ICONS`、`IconName` 类型与 `getIconHtml`/`replaceIconsWithSvg` helper；`global.d.ts` 扩展页面全局类型；`types.ts` 存放共享 TypeScript 类型。
- `favicon.ts` 导出 `createFaviconUrl(pageUrl)`，统一 MV3 `_favicon/` URL 构造；快捷链接、书签与搜索建议均复用它。

## 关键依赖与配置

- 国际化消息来自项目根 `_locales/`（含 `zh_CN` 在内 9 种语言，manifest `default_locale` 为 `en`；构建时整体复制进 `dist/`）与 Chrome i18n。
- 图标映射是 UI 运行时契约，新增图标时同步使用端并保持 `IconName` 约束。
- `createFaviconUrl` 固定 `size=64`、不传 `cache` 参数：MV3 `_favicon/` 端点只认 `pageUrl` 与 `size`，`cache` 在 Chromium 中不存在；显示端为 24px（DPR≤2），Chrome 优先选"缩小而非放大"的源位图，故需 ≤48px 源。

## 测试与质量

- `tests/icons.test.ts` 覆盖图标入口和 SVG 输出。
- 修改全局声明必须运行 `npm run typecheck`。

## 常见问题

- `global.d.ts` 只有类型作用，不能替代实际全局函数的初始化。
- `localization.ts` 的加载顺序早于使用 `getLocalizedMessage` 的页面模块。
- 通用 UI 图标（`ICONS` 键）是 `icons.ts` 中的内联 SVG，不再对应 `images/` 文件；搜索引擎 logo、占位图等专用图像仍走 `images/*.svg`。
- `src/_locales/` 下的残缺 `zh_CN` 文件不在构建路径上，运行时消息以项目根 `_locales/` 为准。

## 相关文件清单

- `global.d.ts`、`icons.ts`、`favicon.ts`、`localization.ts`、`types.ts`
- `../main.ts`、`../../_locales/`
