# 壁纸模块

面包屑：`src/features/wallpaper` ← `src/features` ← 项目根。

## 职责

管理预设、Bing、上传和纯色壁纸，并处理背景持久化与欢迎区颜色协调。

## 入口与对外接口

- `src/main.ts` 通过目录入口加载 `index.ts`。
- `index.ts` 导出 `WallpaperManager`，并在 `DOMContentLoaded` 创建实例。

## 关键依赖与数据

- 页面 DOM、localStorage、图片加载、Chrome i18n；欢迎模块需要先于壁纸模块加载。
- 上传壁纸的二进制以 Blob 存入 IndexedDB（`blob-store.ts`，库名 `markstart-wallpapers`）；localStorage 仅保留 `idb:<id>` 引用（键约定见 `storage-keys.ts`）与轻量元数据 `userWallpapers: [{storageKey, title, timestamp}]`。旧版 dataURL 数据在启动时自动迁移，迁移失败回退原读取逻辑；保持已有兼容键不变。

## 测试与质量

- `tests/wallpaper-storage-keys.test.ts` 覆盖存储键约定与 dataURL 解码；变更后需在扩展页验证预设选择、上传校验、持久化和重新加载。

## 常见问题

- 背景切换是异步图片加载流程；验收应等待页面背景真正应用而非只检查点击事件。
- 恢复已保存壁纸失败（Blob 缺失等）时会清除失效引用并回退默认背景，不要移除该自愈逻辑。

## 相关文件清单

- `index.ts`
- `blob-store.ts`、`storage-keys.ts`、`background.ts`
- `../onboarding/welcome.ts`、`../../main.ts`、`../../index.html`

## 变更记录

- 2026-08-20：壁纸入口收紧为目录 `index.ts`。
- 2026-08-21：上传/当前壁纸二进制迁入 IndexedDB Blob，localStorage 改存引用；旧 dataURL 启动时自动迁移；压缩质量降为 0.8。
