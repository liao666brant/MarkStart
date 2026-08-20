import assert from 'node:assert/strict'
import test from 'node:test'
import { getSiteName } from '../src/features/quick-links/site-name'

test('cleans English and Chinese site suffixes', () => {
  assert.equal(getSiteName('Example - Documentation', 'https://example.com'), 'Example')
  assert.equal(getSiteName('测试官网', 'https://example.cn'), '测试')
})

test('truncates long English titles by visual width', () => {
  assert.equal(getSiteName('abcdefghijklmnopq', 'https://example.com'), 'abcdefghijklmnop')
})

test('derives a readable name from a URL when the title is absent', () => {
  assert.equal(getSiteName('', 'https://www.foo-bar.com/path'), 'foo bar')
  assert.equal(getSiteName('', 'not a URL'), 'Unknown Site')
})

test('derives a readable name from a URL when the title is whitespace only', () => {
  assert.equal(getSiteName('   ', 'https://www.example.com/path'), 'example')
})
