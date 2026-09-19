# 年度进度模块

面包屑：`src/features/progress` ← `src/features` ← 项目根。

## 职责

在新标签页底部渲染年度进度展示。

## 入口与对外接口

- `src/main.ts` 最后加载目录入口 `index.ts`。
- 未发现面向其他模块的公开 API。

## 关键依赖与数据

- 依赖 `#year-progress` 页面节点与当前日期。
- DOM 用 `createElement`/`textContent` 构建（12 段进度条、`${currentYear} ${chrome.i18n.getMessage('yearProgress')}` 文案与百分比），不要回退为 innerHTML 拼接（消除 i18n 注入面）。

## 测试与质量

- 由页面入口/构建链路覆盖；修改计算或 DOM 后在新标签页验证文字和进度段渲染。

## 常见问题

- 保持在 `main.ts` 的末尾加载，避免影响此前页面初始化顺序。

## 相关文件清单

- `index.ts`
- `../../main.ts`、`../../index.html`
