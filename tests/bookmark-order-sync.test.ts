import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshBookmarkOrder, startBookmarkChangeSync } from '../src/features/bookmarks/order-sync'

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

test('syncs the active folder when a bookmark change event fires', () => {
  const synced: string[] = []
  const listeners: Array<() => void> = []
  const source = {
    addListener: (callback: () => void) => {
      listeners.push(callback)
    },
  }

  startBookmarkChangeSync(
    [source],
    () => 'bookmarks-bar',
    (parentId) => {
      synced.push(parentId)
    },
    (error) => {
      throw error
    },
  )

  assert.equal(listeners.length, 1)
  listeners[0]?.()
  assert.deepEqual(synced, ['bookmarks-bar'])
})

test('skips syncing without an active folder and reports sync errors', () => {
  const errors: unknown[] = []
  const listeners: Array<() => void> = []
  const source = {
    addListener: (callback: () => void) => {
      listeners.push(callback)
    },
  }
  let activeParentId: string | undefined

  startBookmarkChangeSync(
    [source],
    () => activeParentId,
    () => {
      throw new Error('sync failed')
    },
    (error) => errors.push(error),
  )

  listeners[0]?.()
  assert.deepEqual(errors, [])

  activeParentId = 'bookmarks-bar'
  listeners[0]?.()
  assert.deepEqual(errors, [new Error('sync failed')])
})

test('coalesces event storms into a leading and a trailing sync', async () => {
  const synced: string[] = []
  const listeners: Array<() => void> = []
  const source = {
    addListener: (callback: () => void) => {
      listeners.push(callback)
    },
  }

  startBookmarkChangeSync(
    [source],
    () => 'bookmarks-bar',
    (parentId) => {
      synced.push(parentId)
    },
    () => undefined,
    { quietPeriodMs: 40 },
  )

  assert.equal(listeners.length, 1)
  listeners[0]?.()
  listeners[0]?.()
  listeners[0]?.()
  assert.deepEqual(synced, ['bookmarks-bar'])

  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.deepEqual(synced, ['bookmarks-bar', 'bookmarks-bar'])
})
