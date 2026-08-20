import assert from 'node:assert/strict'
import test from 'node:test'

import { getBookmarksBarId } from '../src/features/bookmarks/root'

test('uses the first bookmark folder when the legacy ID 1 is absent', async () => {
  const bookmarks: Parameters<typeof getBookmarksBarId>[0] = {
    getTree: async () => [
      {
        id: '0',
        children: [
          { id: '195', title: '书签栏', children: [] },
          { id: '196', title: '其他书签', children: [] },
        ],
      },
    ],
  }

  const bookmarksBarId = await getBookmarksBarId(bookmarks)

  assert.equal(bookmarksBarId, '195')
})
