import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const projectRoot = dirname(fileURLToPath(import.meta.url))

// vite 8 的 oxc 压缩器只提供布尔级 dropConsole（会连 error/warn 一起删，
// 而 chrome://extensions 的错误收集依赖 console.error）。
// 这里在源码阶段把 log/debug/info 调用点改名为本地 noop，
// 压缩期再连同实参一起被摇掉；实现见 dropVerboseConsole。
// 注意：调用点必须保持 console.log( 直接调用形式（正则按此匹配）；
// 调试 watch 构建产物时设 MS_KEEP_CONSOLE=1 可保留日志。
function dropVerboseConsole(): Plugin {
  if (process.env['MS_KEEP_CONSOLE'] === '1') {
    return { name: 'drop-verbose-console' }
  }
  const methodPattern = /\bconsole\.(log|debug|info)\(/g
  return {
    name: 'drop-verbose-console',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.(?:ts|mts|js|mjs)$/.test(id)) return null
      if (!methodPattern.test(code)) return null
      methodPattern.lastIndex = 0
      return {
        code: `${code.replace(methodPattern, 'markstartConsoleNoop(')}\nfunction markstartConsoleNoop(..._args: unknown[]): void {}\n`,
        map: null,
      }
    },
  }
}

export default defineConfig({
  plugins: [
    dropVerboseConsole(),
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: '_locales/**/*', dest: '.' },
        { src: 'images/**/*', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        page: resolve(projectRoot, 'src/index.html'),
        background: resolve(projectRoot, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'src/background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
