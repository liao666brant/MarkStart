# 欢迎与提示模块

面包屑：`src/features/onboarding` ← `src/features` ← 项目根。

## 职责

显示欢迎语和版本功能提示，并在页面加载期间绑定相关交互。

## 入口与对外接口

- `src/main.ts` 先加载 `welcome.ts`，随后加载 `feature-tips.ts`。
- `feature-tips.ts` 导出 `featureTips` 单例，存在模块求值期副作用。

## 关键依赖与配置

- 使用 Chrome i18n、存储和页面 DOM；依赖加载顺序与页面节点存在。
- 性能契约：`adjustTextColor` 缓存命中即返回（每分钟刷新不再重复解码壁纸采样）；非 `url(...)` 背景跳过 Image 加载；`showWelcomeMessage` 走模块级缓存 + `storage.onChanged` 同步；文本 MutationObserver 以 `lastAppliedMessage` 比对而非硬编码中文；欢迎语刷新是对齐分钟边界的单次 `setTimeout` 链，页面隐藏时跳过、`visibilitychange` 可见时立即重排；提示状态的展示触发用 `setTimeout(0)`（rAF 在后台标签页不触发会卡死队列），提示样式元素单例复用，提示消息文本用 `createElement`/`textContent`（仅静态图标常量走 `innerHTML`）。
- 自定义欢迎语：`welcome.ts` 从 `chrome.storage.sync` 读 `customWelcomeMessage`（去空白后空串表示使用默认分段问候），非空时替换默认问候，支持 `{name}` 占位符（替换为用户名）；默认问候按小时选 `morningGreeting`/`afternoonGreeting`/`eveningGreeting`（i18n），用户名取 `localStorage.userName`、缺省 `Sowhale`；`storage.onChanged` 变化时立即经 `updateWelcomeMessage` 应用，以维持 `lastAppliedMessage` 比对。设置侧入口是 `settings/index.ts` 布局 tab 的输入框（输入 300ms 防抖落盘）。

## 测试与质量

- 当前由页面入口与构建测试覆盖接线；修改交互后须在扩展新标签页检查欢迎语和提示展示。

## 常见问题

- 不要把单例创建延后或提前到不同入口，避免改变 `DOMContentLoaded` 注册顺序。

## 相关文件清单

- `welcome.ts`、`feature-tips.ts`
- `../../main.ts`、`../../../tests/single-page-entry.test.ts`
