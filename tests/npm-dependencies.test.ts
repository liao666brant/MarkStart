import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test('builds npm runtime dependencies into the extension page bundle', (context) => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'markstart-npm-dependencies-'))
  context.after(() => rmSync(outputDirectory, { recursive: true, force: true }))
  execFileSync(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--outDir', outputDirectory],
    { cwd: projectRoot, stdio: 'pipe' },
  )

  const packageJson = readFileSync(resolve(projectRoot, 'package.json'), 'utf8')
  const packageData: unknown = JSON.parse(packageJson)
  assert.ok(isRecord(packageData))
  assert.equal(packageData['name'], 'markstart')
  assert.ok('dependencies' in packageData)
  const dependencies = packageData['dependencies']
  assert.ok(typeof dependencies === 'object' && dependencies !== null)

  assert.ok('qrcode' in dependencies)
  assert.ok('radashi' in dependencies)
  assert.ok('sortablejs' in dependencies)
  assert.ok('swiper' in dependencies)

  const indexHtml = readFileSync(resolve(outputDirectory, 'src/index.html'), 'utf8')
  const bundlePath = /<script type="module" crossorigin src="\/(assets\/[^\"]+\.js)">/.exec(indexHtml)?.[1]
  assert.ok(bundlePath)
  assert.equal(existsSync(resolve(outputDirectory, bundlePath)), true)
  assert.doesNotMatch(indexHtml, /(?:lodash|Sortable|qrcode)\.min\.js/)
  const bundle = readFileSync(resolve(outputDirectory, bundlePath), 'utf8')
  assert.match(bundle, /QRCode/)
  assert.match(bundle, /debounce/)
  assert.match(bundle, /throttle/)
  assert.match(bundle, /sortable/)
  assert.match(bundle, /swiper-slide/)
})
