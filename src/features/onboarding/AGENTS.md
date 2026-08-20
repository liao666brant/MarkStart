# 欢迎与提示模块

面包屑：`src/features/onboarding` ← `src/features` ← 项目根。

## 职责

显示欢迎语和版本功能提示，并在页面加载期间绑定相关交互。

## 入口与对外接口

- `src/main.ts` 先加载 `welcome.ts`，随后加载 `feature-tips.ts`。
- `feature-tips.ts` 导出 `featureTips` 单例，存在模块求值期副作用。

## 关键依赖与配置

- 使用 Chrome i18n、存储和页面 DOM；依赖加载顺序与页面节点存在。

## 测试与质量

- 当前由页面入口与构建测试覆盖接线；修改交互后须在扩展新标签页检查欢迎语和提示展示。

## 常见问题

- 不要把单例创建延后或提前到不同入口，避免改变 `DOMContentLoaded` 注册顺序。

## 相关文件清单

- `welcome.ts`、`feature-tips.ts`
- `../../main.ts`、`../../../tests/task4-typescript-entry.test.ts`

## 变更记录

- 2026-08-20：从根级页面脚本迁入 onboarding 功能目录。
