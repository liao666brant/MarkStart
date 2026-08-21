#!/usr/bin/env node
// 跨平台启动器：定位 Playwright Chromium，加载 dist 扩展并开放 CDP 调试端口。
// 用法：以 agent 后台任务运行（保持存活；终止该任务即关闭浏览器）。
//   node launch-test-chrome.mjs [dist目录] [端口]
// Windows 直接运行；在 WSL 中运行时会自动发现 Windows 侧的 Chromium 并调用
// （需要 WSL interop），同时把用户数据目录等参数转换为 Windows 路径。
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWindows = platform() === 'win32';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..', '..');

const extensionPath = path.resolve(process.argv[2] ?? path.join(repoRoot, 'dist'));
const port = Number(process.argv[3] ?? process.env.MV3_TEST_CDP_PORT ?? 9223);

// Chrome 151+ 稳定版已禁用 --load-extension，必须使用 Playwright 的完整版 Chromium。
// 注意排除 headless shell（目录名为 chromium_headless_shell-*）。
function findChromiumCandidates() {
  const roots = [];
  if (isWindows) {
    if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
    roots.push(path.join(homedir(), '.cache', 'ms-playwright'));
  } else {
    roots.push(path.join(homedir(), '.cache', 'ms-playwright'));
    // WSL：枚举 /mnt/<盘符>/Users/*/AppData/Local/ms-playwright 下的 Windows 安装
    for (const drive of ['c', 'd', 'e', 'f']) {
      const usersRoot = path.join('/mnt', drive, 'Users');
      if (!existsSync(usersRoot)) continue;
      for (const user of readdirSync(usersRoot)) {
        if (['Public', 'Default', 'Default User', 'All Users'].includes(user)) continue;
        roots.push(path.join(usersRoot, user, 'AppData', 'Local', 'ms-playwright'));
      }
    }
  }

  const exeName = isWindows ? 'chrome.exe' : 'chrome';
  const platformDirs = isWindows
    ? ['chrome-win64', 'chrome-win', 'chrome-win32']
    : ['chrome-linux64', 'chrome-linux'];

  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('chromium-')) continue;
      for (const sub of platformDirs) {
        const candidate = path.join(root, entry, sub, exeName);
        if (existsSync(candidate)) found.push(candidate);
      }
    }
  }
  return found;
}

// /mnt/c/a/b -> C:\a\b（仅用于传给 Windows 进程的参数）
function toWindowsPath(p) {
  const match = p.match(/^\/mnt\/([a-zA-Z])[/\\](.*)$/);
  if (!match) return p;
  return `${match[1].toUpperCase()}:\\${match[2].replaceAll('/', '\\')}`;
}

// 从 Chromium 安装路径推断其所属环境的临时目录（WSL 调用 Windows 浏览器时，
// 用户数据目录必须是 Windows 文件系统上的路径，否则 chrome.exe 无法解析）。
function defaultProfileDirFor(exePath) {
  if (isWindows) return path.join(tmpdir(), 'mv3-extension-test-profile');
  if (exePath.startsWith('/mnt/')) {
    const marker = exePath.toLowerCase().indexOf('/ms-playwright/');
    const appdataLocal = exePath.slice(0, marker >= 0 ? marker : exePath.length);
    return path.join(appdataLocal, 'Temp', 'mv3-extension-test-profile');
  }
  return path.join(tmpdir(), 'mv3-extension-test-profile');
}

// WSL2 访问 Windows 侧服务通常不能走 127.0.0.1，需用默认网关（Windows 宿主）地址。
function cdpHosts() {
  if (isWindows) return ['127.0.0.1'];
  const hosts = ['127.0.0.1'];
  try {
    const routes = readFileSync('/proc/net/route', 'utf8').split('\n').slice(1);
    for (const line of routes) {
      const cols = line.trim().split(/\s+/);
      if (cols[1] === '00000000' && cols[2] && cols[2] !== '00000000') {
        const hex = cols[2];
        const ip = [6, 4, 2, 0].map(i => Number.parseInt(hex.slice(i, i + 2), 16)).join('.');
        if (!hosts.includes(ip)) hosts.push(ip);
      }
    }
  } catch {
    // 无法读取路由表时只尝试 127.0.0.1
  }
  return hosts;
}

const candidates = findChromiumCandidates();
if (candidates.length === 0) {
  console.error('未找到 Playwright Chromium（ms-playwright/chromium-*/…/chrome）。');
  console.error('可安装：npx playwright install chromium');
  process.exit(1);
}
const chromiumPath = candidates
  .map(candidate => {
    // 从路径中的 chromium-<版本号> 提取数字，按数值比较取最新
    const match = candidate.match(/chromium-(\d+)/);
    return { candidate, version: match ? Number(match[1]) : 0 };
  })
  .sort((a, b) => b.version - a.version)[0].candidate;

rmSync(defaultProfileDirFor(chromiumPath), { recursive: true, force: true });
const userDataDir = toWindowsPath(defaultProfileDirFor(chromiumPath));
const loadExtensionArg = toWindowsPath(extensionPath);

console.log('Chromium:', chromiumPath);
console.log('Extension:', extensionPath);
console.log('Profile:', userDataDir);

const child = spawn(chromiumPath, [
  `--user-data-dir=${userDataDir}`,
  `--load-extension=${loadExtensionArg}`,
  `--remote-debugging-port=${port}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1400,900',
  'about:blank',
], { stdio: 'ignore' });

child.on('error', (error) => {
  console.error('启动浏览器失败:', error.message);
  process.exit(1);
});

async function cdpReady(host) {
  try {
    const response = await fetch(`http://${host}:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

const deadline = Date.now() + 20_000;
let readyHost = null;
while (Date.now() < deadline && !readyHost) {
  for (const host of cdpHosts()) {
    if (await cdpReady(host)) {
      readyHost = host;
      break;
    }
  }
  if (!readyHost) await new Promise(resolve => setTimeout(resolve, 500));
}

if (!readyHost) {
  console.error(`CDP 端口 ${port} 未就绪`);
  process.exit(1);
}

console.log(`CDP ready: http://${readyHost}:${port}`);
console.log('--- keeping alive (kill this task to stop the browser) ---');
setInterval(() => {}, 60_000);
