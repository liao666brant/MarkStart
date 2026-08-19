import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)

test('packages the built extension into a non-empty ZIP archive', async () => {
  const { stdout } = await run(process.execPath, ['scripts/package-extension.mjs'])

  assert.match(stdout, /Created .+\.zip/)
  assert.ok((await stat('release/TabMark-Bookmark-New-Tab-1.245.zip')).size > 0)
})
