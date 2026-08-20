# 壁纸模块

面包屑：`src/features/wallpaper` ← `src/features` ← 项目根。

## 职责

管理预设、Bing、上传和纯色壁纸，并处理背景持久化与欢迎区颜色协调。

## 入口与对外接口

- `src/main.ts` 通过目录入口加载 `index.ts`。
- `index.ts` 导出 `WallpaperManager`，并在 `DOMContentLoaded` 创建实例。

## 关键依赖与数据

- 页面 DOM、localStorage、图片加载、Chrome i18n；欢迎模块需要先于壁纸模块加载。
- 上传与预设壁纸的存储键和展示逻辑在 `index.ts` 内；保持已有兼容键不变。

## 测试与质量

- 当前由入口/构建测试覆盖；变更后需在扩展页验证预设选择、上传校验、持久化和重新加载。

## 常见问题

- 背景切换是异步图片加载流程；验收应等待页面背景真正应用而非只检查点击事件。

## 相关文件清单

- `index.ts`
- `../onboarding/welcome.ts`、`../../main.ts`、`../../index.html`

## 变更记录

- 2026-08-20：壁纸入口收紧为目录 `index.ts`。
