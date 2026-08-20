# 打包脚本模块

面包屑：`scripts` ← 项目根。

## 职责

将 Vite 已生成的扩展目录压缩为发布 ZIP。

## 入口与运行

- `package-extension.ts` 由 `npm run package` 调用；该命令先执行 `npm run build`。

## 关键依赖与配置

- 使用 `archiver`，读取根 `manifest.json` 的版本号并写入 `release/MarkStart-<version>.zip`。
- ZIP 输入是 `dist/`；脚本不负责构建 TypeScript。

## 测试与质量

- `tests/package-extension.test.ts` 在隔离临时项目执行完整 package 命令并审计 ZIP 条目。

## 常见问题

- 不要直接在测试中复用项目 `dist/` 或覆盖项目 `release/`；使用临时目录。

## 相关文件清单

- `package-extension.ts`
- `../package.json`、`../manifest.json`、`../tests/package-extension.test.ts`

## 变更记录

- 2026-08-20：Node 打包脚本已迁移为 TypeScript。
