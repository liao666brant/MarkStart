import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshBookmarkOrder } from '../src/features/bookmarks/order-sync'

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

test('keeps newly returned bookmarks when refreshing a cached folder', () => {
  let cached = { bookmarks: [{ id: 'existing' }] }
  const rendered: Array<readonly { id: string }[]> = []
  const cache: Parameters<typeof refreshBookmarkOrder>[1] = {
    get: () => cached,
    set: (_parentId, bookmarks) => {
      cached = { bookmarks: [...bookmarks] }
    },
  }
  const bookmarksApi: Parameters<typeof refreshBookmarkOrder>[0] = {
    getChildren: (_parentId, callback) => callback([{ id: 'existing' }, { id: 'created-elsewhere' }]),
  }

  refreshBookmarkOrder(bookmarksApi, cache, 'bookmarks-bar', (bookmarks) => {
    rendered.push(bookmarks)
  })

  assert.deepEqual(cached.bookmarks, [{ id: 'existing' }, { id: 'created-elsewhere' }])
  assert.deepEqual(rendered, [[{ id: 'existing' }, { id: 'created-elsewhere' }]])
})

test('refreshes an expired cache from Chrome children', () => {
  let getChildrenCalls = 0
  const rendered: Array<readonly { id: string }[]> = []
  const cache: Parameters<typeof refreshBookmarkOrder>[1] = {
    get: () => null,
    set: () => undefined,
  }
  const bookmarksApi: Parameters<typeof refreshBookmarkOrder>[0] = {
    getChildren: (_parentId, callback) => {
      getChildrenCalls += 1
      callback([{ id: 'created-after-cache-expiry' }])
    },
  }

  refreshBookmarkOrder(bookmarksApi, cache, 'bookmarks-bar', (bookmarks) => {
    rendered.push(bookmarks)
  })

  assert.equal(getChildrenCalls, 1)
  assert.deepEqual(rendered, [[{ id: 'created-after-cache-expiry' }]])
})

test('refreshes bookmark metadata when the order does not change', () => {
  const rendered: Array<readonly { id: string; title: string; url: string }[]> = []
  const cache: Parameters<typeof refreshBookmarkOrder<{ id: string; title: string; url: string }>>[1] = {
    get: () => ({ bookmarks: [{ id: 'bookmark', title: 'Old title', url: 'https://old.example' }] }),
    set: () => undefined,
  }
  const bookmarksApi: Parameters<typeof refreshBookmarkOrder<{ id: string; title: string; url: string }>>[0] = {
    getChildren: (_parentId, callback) => callback([{ id: 'bookmark', title: 'New title', url: 'https://new.example' }]),
  }

  refreshBookmarkOrder(bookmarksApi, cache, 'bookmarks-bar', (bookmarks) => {
    rendered.push(bookmarks)
  })

  assert.deepEqual(rendered, [[{ id: 'bookmark', title: 'New title', url: 'https://new.example' }]])
})
