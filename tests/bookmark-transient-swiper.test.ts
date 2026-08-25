import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectUrl = new URL('../', import.meta.url)

test('adds one temporary slide for a clicked unpinned folder', async () => {
  const pageSource = await readFile(new URL('src/features/bookmarks/page.ts', projectUrl), 'utf8')

  assert.match(pageSource, /let temporaryFolderSlide: FolderSlide \| undefined;/)
  assert.match(pageSource, /selectFolderSlide\(pinnedFolderSlides, \{ id: folderId, name: selectedFolder\.title \}\)/)
  assert.match(pageSource, /folderSwiper\?\.rebuild\(selection\.slides, folderId\);/)
  assert.match(pageSource, /void switchToFolder\(folderId\);/)
  assert.match(pageSource, /tab\.role = 'button';/)
  assert.match(pageSource, /tab\.addEventListener\('keydown'/)
})
