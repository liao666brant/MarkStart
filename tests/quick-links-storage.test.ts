import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createQuickLinksCache,
  parseQuickLinks,
  parseStringArray,
} from '../src/features/quick-links/storage'

const link = {
  name: 'Example',
  url: 'https://example.com',
  favicon: 'favicon.png',
  fixed: true,
}

test('keeps only complete quick links and string blacklist entries', () => {
  assert.deepEqual(parseQuickLinks([link, null, { ...link, fixed: 'true' }]), [link])
  assert.deepEqual(parseStringArray(['example.com', 1, null]), ['example.com'])
})

test('persists and expires a quick-links cache using its supplied clock', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  }
  let now = 1_000
  const cache = createQuickLinksCache(storage, () => now)

  cache.set([link])
  assert.equal(cache.isValid(), true)
  now += 5 * 60 * 1_000
  assert.equal(cache.isValid(), false)
})

test('clears malformed persisted cache data', () => {
  const entries = new Map<string, string>([['quickLinksCache', '{']])
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  }

  const cache = createQuickLinksCache(storage, () => 1_000)
  cache.load()
  assert.equal(cache.data, null)
  assert.equal(entries.has('quickLinksCache'), false)
})

test('persists written entries so the next page load reuses them', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  }

  createQuickLinksCache(storage, () => 1_000).set([link])

  const nextPage = createQuickLinksCache(storage, () => 2_000)
  nextPage.load()
  assert.deepEqual(nextPage.data, [link])
  assert.equal(nextPage.isValid(), true)
})

test('invalidate drops both the cached data and the persisted entry', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  }

  const cache = createQuickLinksCache(storage, () => 1_000)
  cache.set([link])
  cache.invalidate()

  assert.equal(cache.data, null)
  assert.equal(cache.isValid(), false)
  assert.equal(entries.has('quickLinksCache'), false)
})
