import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeDataUrl } from '../src/features/wallpaper/blob-store'
import { blobIdFromStorageKey, isIdbStorageKey, toStorageKey } from '../src/features/wallpaper/storage-keys'

test('builds and recognizes idb storage keys', () => {
  const key = toStorageKey('upload-123')

  assert.equal(key, 'idb:upload-123')
  assert.equal(isIdbStorageKey(key), true)
  assert.equal(isIdbStorageKey('https://example.com/wallpaper.jpg'), false)
  assert.equal(isIdbStorageKey(''), false)
})

test('round-trips blob ids through storage keys', () => {
  assert.equal(blobIdFromStorageKey(toStorageKey('wallpaper-42')), 'wallpaper-42')
  // 非 idb 引用（预设/在线 URL）按原样返回，调用方据此直接用作显示地址
  assert.equal(blobIdFromStorageKey('https://example.com/a.jpg'), 'https://example.com/a.jpg')
})

test('decodes legacy data URLs into blobs', async () => {
  // 1x1 蓝色 PNG
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  const blob = await decodeDataUrl(tiny)

  assert.ok(blob instanceof Blob)
  assert.ok(blob.size > 0)
})

test('rejects malformed data URLs', async () => {
  await assert.rejects(decodeDataUrl('not-a-data-url'))
})
