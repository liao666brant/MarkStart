import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectUrl = new URL('../', import.meta.url)

test('expands the resolved bookmarks-bar root children when the sidebar tree is initialized', async () => {
  // Given: the sidebar tree implementation.
  const pageSource = await readFile(new URL('src/features/bookmarks/page.ts', projectUrl), 'utf8')

  // When: the bookmarks-bar root is rendered.
  // Then: its child list is initially visible instead of waiting for a click.
  assert.match(pageSource, /const isInitiallyExpanded = bookmark\.id === expandedFolderId;/)
  assert.match(pageSource, /sublist\.style\.display = isInitiallyExpanded \? 'block' : 'none';/)
  assert.match(pageSource, /const bookmarksBarId = await getBookmarksBarId\(chrome\.bookmarks\);/)
  assert.match(
    pageSource,
    /displayBookmarkCategories\(bookmarkTreeNodes\[0\]\?\.children \?\? \[\], 0, null, bookmarksBarId\);/,
  )
})
