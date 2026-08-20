import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('builds the MV3 service worker from TypeScript when producing the extension', (context) => {
  // Given: the checked-in extension sources and a clean production build invocation.
  const outputDirectory = mkdtempSync(join(tmpdir(), 'tabmark-mv3-build-'))
  context.after(() => rmSync(outputDirectory, { recursive: true, force: true }))
  execFileSync(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--outDir', outputDirectory],
    {
      cwd: projectRoot,
      stdio: 'pipe',
    },
  )

  // When: the manifest and source/output worker paths are inspected.
  const manifestData: unknown = JSON.parse(
    readFileSync(resolve(outputDirectory, 'manifest.json'), 'utf8'),
  )
  assert.ok(typeof manifestData === 'object' && manifestData !== null)
  assert.ok('background' in manifestData)
  const background = manifestData.background
  assert.ok(typeof background === 'object' && background !== null)
  assert.ok('service_worker' in background)
  const workerPath = background.service_worker
  const workerSource = readFileSync(resolve(projectRoot, 'src/background.ts'), 'utf8')
  const workerOutput = readFileSync(resolve(outputDirectory, 'src/background.js'), 'utf8')

  // Then: Chrome receives JavaScript emitted from the TypeScript worker entry only.
  assert.equal(workerPath, 'src/background.js')
  assert.equal(existsSync(resolve(projectRoot, 'src/background.ts')), true)
  assert.equal(existsSync(resolve(projectRoot, 'src/background.js')), false)
  assert.equal(existsSync(resolve(outputDirectory, 'src/background.js')), true)
  assert.equal(existsSync(resolve(outputDirectory, 'src/background.ts')), false)
  assert.notEqual(workerOutput, workerSource)
})
