import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const projectUrl = new URL('../', import.meta.url)

test('task 4 modules use TypeScript entries while preserving icon output', async () => {
  // Given: the three UI foundation modules are expected to be TypeScript-owned.
  const modulePaths = [
    'shared/icons',
    'features/onboarding/feature-tips',
    'features/bookmarks/gesture-navigation',
  ] as const

  // When: their runtime entrypoints and the page imports are inspected.
  await Promise.all(modulePaths.map((path) => access(new URL(`src/${path}.ts`, projectUrl))))
  const [indexHtml, main, script, iconsModule] = await Promise.all([
    readFile(new URL('src/index.html', projectUrl), 'utf8'),
    readFile(new URL('src/main.ts', projectUrl), 'utf8'),
    readFile(new URL('src/features/bookmarks/page.ts', projectUrl), 'utf8'),
    import('../src/shared/icons'),
  ])

  // Then: runtime references resolve to TypeScript and icon rendering stays observable.
  assert.doesNotMatch(
    `${indexHtml}\n${main}\n${script}`,
    /(?:icons|feature-tips|gesture-navigation)\.js/,
  )
  assert.match(main, /import '\.\/shared\/icons'/)
  assert.match(main, /import '\.\/features\/onboarding\/feature-tips'/)
  assert.match(script, /from '\.\/gesture-navigation'/)
  assert.match(iconsModule.getIconHtml('settings'), /^<span class="icon-svg"><svg/)
  assert.equal(
    iconsModule.getIconHtml('missing-icon'),
    '<span class="material-icons">missing-icon</span>',
  )
})
