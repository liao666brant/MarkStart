import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const projectRoot = resolve(import.meta.dirname, '..')

test('packages the built extension into a non-empty ZIP archive', async (context) => {
  // Given: an isolated project with the real package command and dependencies.
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'tabmark-package-test-'))
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  await Promise.all([
    cp(resolve(projectRoot, 'package.json'), resolve(fixtureRoot, 'package.json')),
    cp(resolve(projectRoot, 'manifest.json'), resolve(fixtureRoot, 'manifest.json')),
    cp(resolve(projectRoot, 'vite.config.mts'), resolve(fixtureRoot, 'vite.config.mts')),
    cp(resolve(projectRoot, '_locales'), resolve(fixtureRoot, '_locales'), { recursive: true }),
    cp(resolve(projectRoot, 'images'), resolve(fixtureRoot, 'images'), { recursive: true }),
    cp(resolve(projectRoot, 'scripts'), resolve(fixtureRoot, 'scripts'), { recursive: true }),
    cp(resolve(projectRoot, 'src'), resolve(fixtureRoot, 'src'), { recursive: true }),
    symlink(resolve(projectRoot, 'node_modules'), resolve(fixtureRoot, 'node_modules'), 'dir'),
  ])
  const manifestText = await readFile(resolve(fixtureRoot, 'manifest.json'), 'utf8')
  const versionMatch = /"version"\s*:\s*"([^"]+)"/.exec(manifestText)
  assert.ok(versionMatch?.[1])
  const archivePath = resolve(
    fixtureRoot,
    'release',
    `TabMark-Bookmark-New-Tab-${versionMatch[1]}.zip`,
  )

  // When: npm runs the declared build-and-package workflow inside the isolated project.
  const { stdout } = await run('npm', ['run', 'package'], { cwd: fixtureRoot })
  const { stdout: archiveEntriesText } = await run('unzip', ['-Z1', archivePath])
  const archiveEntries = archiveEntriesText.split('\n')

  // Then: it reports and writes only the executable extension artifacts.
  assert.match(stdout, /Created .+\.zip/)
  assert.ok((await stat(archivePath)).size > 0)
  assert.ok(archiveEntries.includes('manifest.json'))
  assert.ok(archiveEntries.includes('src/background.js'))
  assert.equal(archiveEntries.some((entry) => /\.tsx?$/.test(entry)), false)
})
