---
name: verify-mv3-extension
description: 在真实 Chromium 中验证 MarkStart MV3 扩展的 dist/ 构建产物。启动带扩展的独立测试实例（用 ms-playwright Chromium 绕过 Chrome 151+ 禁用 --load-extension 的限制），通过 CDP + agent-browser 打开扩展页，验证壁纸（IndexedDB 迁移/上传/恢复）、书签事件驱动同步、设置面板等核心路径。Use when the user runs /verify-mv3-extension or asks to 验证扩展 / 测试 dist / 扩展冒烟测试 / 加载未打包扩展。
---

# MV3 扩展真实浏览器验证

对 `dist/` 构建产物做端到端验证：在独立 Chromium 实例中加载未打包扩展，通过 CDP 驱动页面并检查核心路径。

## 0. 前置

先跑完静态验证，全绿再进入浏览器环节：

```bash
npm run typecheck
npm test
npm run build
```

## 1. 启动带扩展的测试实例

以 **background 任务**运行跨平台启动器（Node 脚本，Windows 与 WSL 通用；前台命令的子进程会被任务包装器的 Job Object 连带终止，这是实测踩过的坑）：

```bash
node .agents/skills/verify-mv3-extension/scripts/launch-test-chrome.mjs
```

可选参数：`node launch-test-chrome.mjs [dist目录] [端口]`。

脚本行为：
- 自动定位 ms-playwright 的完整版 Chromium（排除 headless shell），取版本号最新的一个；
- WSL 下运行时会枚举 `/mnt/<盘符>/Users/*/AppData/Local/ms-playwright` 发现 Windows 侧浏览器并经 interop 调用，`--user-data-dir`、`--load-extension` 参数自动转换为 Windows 路径，CDP 探测在 `127.0.0.1` 之外还会尝试 WSL 默认网关（Windows 宿主 IP）；
- 全新临时 profile + `--load-extension` + `--remote-debugging-port=9223` → 轮询等待端口就绪 → 保持存活（杀掉该后台任务即关闭浏览器）。

## 2. 获取扩展 ID 并打开扩展页

未打包扩展的 ID 由绝对路径派生，同一 `dist/` 路径在任何 profile 下 ID 相同。从用户主 profile 的 Secure Preferences 解析：

```powershell
$json = Get-Content "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Secure Preferences" -Raw | ConvertFrom-Json
$json.extensions.settings.PSObject.Properties |
  Where-Object { $_.Value.path -like '*<项目名>*dist*' } | ForEach-Object { $_.Name }
```

然后用 agent-browser 连接并打开（`--pin-tab` 固定会话，避免后续命令漂移到其他标签页）：

```bash
agent-browser --cdp 9223 --pin-tab open "chrome-extension://<EXT_ID>/src/index.html"
```

## 3. 验证清单

以下均通过 `agent-browser --cdp 9223 eval "<js>"` 执行；多步逻辑用 IIFE：`(async()=>{...; return JSON.stringify({...})})()`。

**基础状态**

```js
JSON.stringify({
  welcome: document.getElementById('welcome-message')?.textContent,
  bookmarkCards: document.querySelectorAll('.bookmark-card').length,
  loadingRemoved: !document.documentElement.classList.contains('loading-wallpaper'),
})
```

**壁纸 IndexedDB 迁移**：种子旧版数据后 `reload`，检查 localStorage 值变为 `idb:` 前缀、`indexedDB.databases()` 出现 `markstart-wallpapers`、`document.body.classList.contains('has-wallpaper')` 为 true：

```js
localStorage.removeItem('useDefaultBackground'); // 关键：否则壁纸分支被跳过（旧版逻辑如此）
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
localStorage.setItem('originalWallpaper', tiny);
localStorage.setItem('userWallpapers', JSON.stringify([{ url: tiny, title: '自定义壁纸', timestamp: 123 }]));
```

**上传路径**：canvas 生成图片 → DataTransfer 模拟文件选择 → 触发 `#upload-wallpaper` 的 change 事件；之后检查 `originalWallpaper` 为 `idb:upload-*`、`userWallpapers` 元数据为 `storageKey` 结构、`.wallpaper-option` 数量 = 预设数 + 1。

**Blob 清理**：替换壁纸后用 `getAllKeys()` 检查：仍被 `userWallpapers` 引用的 Blob 必须保留且其 Object URL 缩略图可读取；只有已从用户列表移除的引用，对应键才应被清理。

**书签事件驱动同步**：在页面上下文创建/改名书签，800ms 内 UI 应更新（轮询实现要等 30 秒）：

```js
(async () => {
  const pid = document.querySelector('.bookmarks-list')?.dataset['parentId'] || '1';
  await chrome.bookmarks.create({ parentId: pid, title: 'CDP测试书签', url: 'https://example.com/cdp' });
  await new Promise(r => setTimeout(r, 800));
  return document.querySelectorAll('.card-title').length;
})()
```

**设置侧栏**：点击 `.settings-icon a` 后侧栏获得 `open` 类、滑块元素存在。

**控制台**：`agent-browser --cdp 9223 console` 检查无意外报错（首次加载的搜索 fallback 日志属正常）。

## 4. 实测踩坑（照做可省半小时）

- **rAF 不执行**：窗口被遮挡/最小化时 `visibilityState === 'hidden'`，依赖 requestAnimationFrame 的渲染（如壁纸上屏）不会发生。先执行一次 `agent-browser --cdp 9223 screenshot out.png` 强制渲染，再断言 DOM 状态。
- **alert() 阻塞**：点重置按钮等触发 `alert` 的元素会让该页 JS 与后续 eval 全部挂起（CDP 连接超时）。避免触发；确需验证时改为新开标签页读持久化状态——状态写入发生在弹窗之前。
- **console 缓冲混杂**：agent-browser 守护进程的 console 缓冲可能混入其他实例/页面的日志（看堆栈里的 URL 即可识别）。断言前先 `console --clear` 再 `reload`。
- **bsk/browser-skill 不可用于本项目**：其沙箱禁止访问自身以外的扩展页面与所有 `chrome://` 页面（borrow 也没用），只能走本技能的独立实例方案。
- **eval 语法**：CLI 参数里写多行逻辑用单行 IIFE；`const` 直接裸写在表达式上下文会报 `Unexpected reserved word`。

## 5. 收尾

1. 杀掉保活后台任务（或直接结束 `--user-data-dir` 含测试 profile 的 chrome 进程树）；
2. 测试对 localStorage/IndexedDB 的写入都在临时 profile 内，不影响真实数据；
3. 若验证发现问题：修复 → `npm run build` → `reload` 扩展页（未打包扩展会自动感知文件变化）→ 复测。
