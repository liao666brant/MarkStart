# 页面共享模块

面包屑：`src/shared` ← `src` ← 项目根。

## 职责

提供跨功能模块使用的全局类型、图标、国际化和共享数据类型。

## 入口与对外接口

- `localization.ts` 由 `src/main.ts` 首先加载并注册本地化能力。
- `icons.ts` 导出图标映射与 HTML/SVG helper；`global.d.ts` 扩展页面全局类型；`types.ts` 存放共享 TypeScript 类型。

## 关键依赖与配置

- 国际化消息来自 `src/_locales/zh_CN/messages.json` 和 Chrome i18n。
- 图标映射是 UI 运行时契约，新增图标时同步使用端并保持 `IconName` 约束。

## 测试与质量

- `tests/task4-typescript-entry.test.ts` 覆盖图标入口和 SVG 输出。
- 修改全局声明必须运行 `npm run typecheck`。

## 常见问题

- `global.d.ts` 只有类型作用，不能替代实际全局函数的初始化。
- `localization.ts` 的加载顺序早于使用 `getLocalizedMessage` 的页面模块。

## 相关文件清单

- `global.d.ts`、`icons.ts`、`localization.ts`、`types.ts`
- `../main.ts`、`../_locales/zh_CN/messages.json`

## 变更记录

- 2026-08-20：跨模块文件从根级迁入 `shared`。
