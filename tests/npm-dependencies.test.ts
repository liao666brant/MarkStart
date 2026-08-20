import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readProjectFile = (path: string): Promise<string> =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('bundles runtime libraries from npm instead of vendored minified files', async () => {
  // Given: the package manifest and the extension's dependency entry points.
  const [packageJson, indexHtml, viteConfig, script, gestureNavigation] = await Promise.all([
    readProjectFile('package.json'),
    readProjectFile('src/index.html'),
    readProjectFile('vite.config.mts'),
    readProjectFile('src/script.ts'),
    readProjectFile('src/gesture-navigation.ts'),
  ])
  const packageData: unknown = JSON.parse(packageJson)
  assert.ok(typeof packageData === 'object' && packageData !== null)
  assert.ok('dependencies' in packageData)
  const dependencies = packageData.dependencies
  assert.ok(typeof dependencies === 'object' && dependencies !== null)

  // When: dependency declarations and source imports are inspected together.
  assert.ok('qrcode' in dependencies)
  assert.ok('radashi' in dependencies)
  assert.ok('sortablejs' in dependencies)
  const dependencyTypes = [
    typeof dependencies.qrcode,
    typeof dependencies.radashi,
    typeof dependencies.sortablejs,
  ]

  // Then: npm owns runtime libraries and no vendored or unused framework hooks remain.
  assert.deepEqual(dependencyTypes, ['string', 'string', 'string'])
  assert.equal('qrcodejs2' in dependencies ? dependencies.qrcodejs2 : undefined, undefined)
  assert.equal('lodash' in dependencies ? dependencies.lodash : undefined, undefined)
  assert.equal('tailwindcss' in dependencies ? dependencies.tailwindcss : undefined, undefined)
  assert.equal(
    '@heroicons/react' in dependencies ? dependencies['@heroicons/react'] : undefined,
    undefined,
  )
  assert.equal(
    '@heroicons/vue' in dependencies ? dependencies['@heroicons/vue'] : undefined,
    undefined,
  )
  assert.match(script, /from 'radashi'/)
  assert.match(gestureNavigation, /from 'radashi'/)
  assert.doesNotMatch(`${script}\n${gestureNavigation}`, /\b_\.(?:debounce|throttle)/)
  assert.doesNotMatch(indexHtml, /(?:lodash|Sortable|qrcode)\.min\.js/)
  assert.doesNotMatch(await readProjectFile('src/styles.css'), /@tailwind\s/)
  assert.doesNotMatch(viteConfig, /src\/\*\*\/\*/)
})
