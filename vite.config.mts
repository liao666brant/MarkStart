import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: '_locales/**/*', dest: '.' },
        { src: 'images/**/*', dest: '.' },
        { src: 'src/background.js', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(projectRoot, 'src/index.html'),
    },
  },
})
