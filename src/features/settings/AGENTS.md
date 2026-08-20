# 设置模块

面包屑：`src/features/settings` ← `src/features` ← 项目根。

## 职责

负责设置侧栏、外观与布局选项、链接打开方式、快捷链接和手势配置的页面交互。

## 入口与对外接口

- `src/main.ts` 通过目录入口加载 `index.ts`。
- 该模块以页面副作用为主，未发现稳定的独立业务 API。

## 关键依赖与数据

- 依赖 Chrome storage、页面设置侧栏 DOM 以及其他功能模块暴露的全局行为。

## 测试与质量

- `tests/settings-typescript-entry.test.ts` 保护入口接线。
- 修改设置值、侧栏或布局后，在扩展页逐项确认保存和重新打开后的状态。

## 常见问题

- `index.ts` 是目录入口命名，不代表无副作用；保持 `main.ts` 的导入顺序。

## 相关文件清单

- `index.ts`
- `../../main.ts`、`../../index.html`
- `../../../tests/settings-typescript-entry.test.ts`

## 变更记录

- 2026-08-20：设置入口收紧为目录 `index.ts`。
