import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshBookmarkOrder } from '../src/bookmark-order-sync'

test('refreshes changed bookmark order through the supplied renderer', () => {
  const rendered: { id: string; children: readonly { id: string }[] }[] = []
  const cache: Parameters<typeof refreshBookmarkOrder>[1] = {
    get: () => ({ bookmarks: [{ id: 'old' }] }),
    set: () => undefined,
  }
  const bookmarksApi: Parameters<typeof refreshBookmarkOrder>[0] = {
    getChildren: (_parentId, callback) => callback([{ id: 'current' }]),
  }

  refreshBookmarkOrder(bookmarksApi, cache, 'bookmarks-bar', (bookmarks) => {
    rendered.push({ id: 'bookmarks-bar', children: bookmarks })
  })

  assert.deepEqual(rendered, [{ id: 'bookmarks-bar', children: [{ id: 'current' }] }])
})
