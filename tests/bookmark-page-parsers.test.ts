import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBooleanProperty,
  getDefaultFolders,
  getNumberProperty,
  getOpenMultipleTabsResponse,
  isBookmarkColors,
  isUnknownRecord,
} from '../src/features/bookmarks/page-parsers'

test('parses only plain records and finite numeric properties', () => {
  assert.equal(isUnknownRecord({ height: 42 }), true)
  assert.equal(isUnknownRecord(null), false)
  assert.equal(isUnknownRecord([]), false)
  assert.equal(getNumberProperty({ height: 42 }, 'height'), 42)
  assert.equal(getNumberProperty({ height: Number.NaN }, 'height'), undefined)
  assert.equal(getNumberProperty({ height: Infinity }, 'height'), undefined)
  assert.equal(getNumberProperty({ height: '42' }, 'height'), undefined)
})

test('parses only boolean properties', () => {
  assert.equal(getBooleanProperty({ enabled: true }, 'enabled'), true)
  assert.equal(getBooleanProperty({ enabled: false }, 'enabled'), false)
  assert.equal(getBooleanProperty({ enabled: 0 }, 'enabled'), undefined)
  assert.equal(getBooleanProperty({}, 'enabled'), undefined)
})

test('parses open-multiple-tabs responses without leaking invalid fields', () => {
  assert.deepEqual(getOpenMultipleTabsResponse({ success: true, error: 'denied' }), {
    success: true,
    error: 'denied',
  })
  assert.deepEqual(getOpenMultipleTabsResponse({ success: false, error: 1 }), { success: false })
  assert.equal(getOpenMultipleTabsResponse({ success: 'true' }), null)
})

test('validates bookmark colors and filters invalid default folders', () => {
  assert.equal(isBookmarkColors({ primary: [1, Number.NaN], secondary: [Infinity] }), true)
  assert.equal(isBookmarkColors({ primary: [1, '2'], secondary: [] }), false)

  const validFolder = { id: 'folder-1', folderId: 'legacy-folder', name: 'Pinned', order: 0, extra: true }
  assert.deepEqual(getDefaultFolders({ items: [validFolder, { id: 'broken', name: 'Broken' }] }), [validFolder])
  assert.deepEqual(getDefaultFolders({ items: 'not-an-array' }), [])
})
