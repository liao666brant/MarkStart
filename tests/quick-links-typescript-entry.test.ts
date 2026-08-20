import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const projectUrl = new URL('../', import.meta.url)

test('quick links runtime uses the TypeScript page entry', async () => {
  // Given: quick links is required to be owned by a TypeScript module.
  const quickLinksUrl = new URL('src/features/quick-links/index.ts', projectUrl)

  // When: the source entry and page manifest are inspected.
  await access(quickLinksUrl)
  const [indexHtml, main] = await Promise.all([
    readFile(new URL('src/index.html', projectUrl), 'utf8'),
    readFile(new URL('src/main.ts', projectUrl), 'utf8'),
  ])

  // Then: Vite consumes the TypeScript entry and no legacy entry remains.
  assert.match(indexHtml, /src="main\.ts"/)
  assert.match(main, /import '\.\/features\/quick-links'/)
  assert.doesNotMatch(`${indexHtml}\n${main}`, /quick-links\.js/)
})
