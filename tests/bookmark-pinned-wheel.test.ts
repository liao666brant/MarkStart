import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectUrl = new URL('../', import.meta.url)

test('restores a pinned slide after an unpinned folder replaces its content', async () => {
  const pageSource = await readFile(new URL('src/features/bookmarks/page.ts', projectUrl), 'utf8')

  assert.match(
    pageSource,
    /listForSlide && listForSlide\.dataset\["parentId"\] !== folderId/,
    'a pinned slide must refresh when its rendered folder differs from its slide ID',
  )
})
