import assert from 'node:assert/strict'
import test from 'node:test'

import { createBookmarkCache } from '../src/features/bookmarks/bookmark-cache'

test('keeps entries through the five-minute boundary and expires them afterwards', () => {
  let now = 0
  const cache = createBookmarkCache<{ readonly id: string }>(() => now)
  const bookmarks = [{ id: 'bookmark' }]

  cache.set('folder', bookmarks)
  now = 300_000
  assert.deepEqual(cache.get('folder')?.bookmarks, bookmarks)

  now = 300_001
  assert.equal(cache.get('folder'), null)
})

test('evicts the oldest entries before exceeding the cache limit', () => {
  let now = 0
  const cache = createBookmarkCache<{ readonly id: string }>(() => now)

  for (let index = 0; index <= 100; index += 1) {
    cache.set(`folder-${index}`, [{ id: `bookmark-${index}` }])
    now += 1
  }

  assert.equal(cache.get('folder-19'), null)
  assert.deepEqual(cache.get('folder-20')?.bookmarks, [{ id: 'bookmark-20' }])
  assert.deepEqual(cache.get('folder-100')?.bookmarks, [{ id: 'bookmark-100' }])
})

test('deletes one folder or clears every folder', () => {
  const cache = createBookmarkCache<{ readonly id: string }>(() => 0)
  cache.set('first', [{ id: 'first-bookmark' }])
  cache.set('second', [{ id: 'second-bookmark' }])

  assert.equal(cache.delete('first'), true)
  assert.equal(cache.get('first'), null)
  assert.deepEqual(cache.get('second')?.bookmarks, [{ id: 'second-bookmark' }])

  cache.clear()
  assert.equal(cache.get('second'), null)
})
