import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('bundles runtime libraries from npm instead of vendored minified files', async () => {
  const [packageJson, indexHtml, viteConfig, script, gestureNavigation] = await Promise.all([
    readProjectFile('package.json'),
    readProjectFile('src/index.html'),
    readProjectFile('vite.config.mts'),
    readProjectFile('src/script.js'),
    readProjectFile('src/gesture-navigation.js'),
  ])
  const dependencies = JSON.parse(packageJson).dependencies

  assert.deepEqual(
    ['qrcode', 'radashi', 'sortablejs'].map((name) => typeof dependencies[name]),
    ['string', 'string', 'string'],
  )
  assert.equal(dependencies.qrcodejs2, undefined)
  assert.equal(dependencies.lodash, undefined)
  assert.equal(dependencies.tailwindcss, undefined)
  assert.equal(dependencies['@heroicons/react'], undefined)
  assert.equal(dependencies['@heroicons/vue'], undefined)
  assert.match(script, /from 'radashi'/)
  assert.match(gestureNavigation, /from 'radashi'/)
  assert.doesNotMatch(`${script}\n${gestureNavigation}`, /\b_\.(?:debounce|throttle)/)
  assert.doesNotMatch(indexHtml, /(?:lodash|Sortable|qrcode)\.min\.js/)
  assert.doesNotMatch(await readProjectFile('src/styles.css'), /@tailwind\s/)
  assert.doesNotMatch(viteConfig, /src\/\*\*\/\*/)
})
