import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectUrl = new URL('../', import.meta.url)

test('loads the page through one ordered TypeScript entry', async () => {
  // Given: the extension page and its TypeScript bootstrap source.
  const indexHtml = await readFile(new URL('src/index.html', projectUrl), 'utf8')
  const moduleSources = [...indexHtml.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(
    (match) => match[1],
  )

  // When: the page module entries are resolved.
  // Then: exactly one bootstrap owns the preserved initialization order.
  assert.deepEqual(moduleSources, ['main.ts'])

  const mainSource = await readFile(new URL('src/main.ts', projectUrl), 'utf8')
  const orderedImports = [...mainSource.matchAll(/^import '\.\/([^']+)'$/gm)].map(
    (match) => match[1],
  )
  assert.deepEqual(orderedImports, [
    'localization',
    'welcome',
    'script',
    'wallpaper',
    'icons',
    'feature-tips',
    'settings',
    'search-engine-dropdown',
    'quick-links',
    'progress',
  ])
})
