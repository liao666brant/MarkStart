import assert from 'node:assert/strict'
import test from 'node:test'
import { rankHistoryItems } from '../src/features/quick-links/history'

const now = Date.UTC(2026, 7, 20)

test('prefers a homepage while retaining the domain latest visit and count', () => {
  const ranked = rankHistoryItems([
    { url: 'https://example.com/', title: 'Home', lastVisitTime: now - 60_000 },
    { url: 'https://example.com/docs', title: 'Docs', lastVisitTime: now },
  ], now)

  assert.deepEqual(ranked, [{
    domain: 'example.com',
    url: 'https://example.com/',
    title: 'Home',
    lastVisitTime: now,
    visitCount: 2,
  }])
})

test('uses the latest subpage when a domain has no homepage', () => {
  const ranked = rankHistoryItems([
    { url: 'https://example.com/first', title: 'First', lastVisitTime: now - 60_000 },
    { url: 'https://example.com/latest', title: 'Latest', lastVisitTime: now },
  ], now)

  assert.equal(ranked[0]?.url, 'https://example.com/latest')
})

test('preserves the existing frequency-weighted ranking', () => {
  const week = 7 * 24 * 60 * 60 * 1000
  const ranked = rankHistoryItems([
    { url: 'https://old.example/one', title: 'Old', lastVisitTime: now - week },
    { url: 'https://old.example/two', title: 'Old', lastVisitTime: now - week },
    { url: 'https://old.example/three', title: 'Old', lastVisitTime: now - week },
    { url: 'https://recent.example/', title: 'Recent', lastVisitTime: now },
  ], now)

  assert.deepEqual(ranked.map((item) => item.domain), ['old.example', 'recent.example'])
})

test('ignores history entries without a URL or visit time', () => {
  const ranked = rankHistoryItems([
    { title: 'Missing URL', lastVisitTime: now },
    { url: '', title: 'Empty URL', lastVisitTime: now },
    { url: 'not-a-url', title: 'Malformed URL', lastVisitTime: now },
    { url: 'https://example.com/', title: 'Missing time' },
    { url: 'https://valid.example/', title: 'Valid', lastVisitTime: now },
  ], now)

  assert.deepEqual(ranked.map((item) => item.domain), ['valid.example'])
})
