import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseWallpaperPreview,
  shouldUseStartupPreview,
  toWallpaperPreview,
} from '../src/features/wallpaper/preview'

const tinyPreview = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoIAAgAAUAmJQBOgCHwAP7+4AAAAA=='

test('accepts a well-formed preview record', () => {
  const preview = toWallpaperPreview('idb:upload-1', tinyPreview)

  assert.deepEqual(preview, { source: 'idb:upload-1', dataUrl: tinyPreview })
})

test('rejects preview sources that cannot be a wallpaper reference', () => {
  assert.equal(toWallpaperPreview('', tinyPreview), null)
  // 旧版 dataURL 整串曾写入 originalWallpaper，这类超长来源不进预览
  assert.equal(toWallpaperPreview(`data:image/png;base64,${'A'.repeat(4096)}`, tinyPreview), null)
})

test('rejects preview payloads that are not inline image data', () => {
  assert.equal(toWallpaperPreview('idb:upload-1', 'https://example.com/a.jpg'), null)
  assert.equal(toWallpaperPreview('idb:upload-1', `data:image/webp;base64,${'A'.repeat(40001)}`), null)
})

test('parses stored previews and drops corrupted entries', () => {
  const stored = JSON.stringify({ source: 'https://example.com/a.jpg', dataUrl: tinyPreview })

  assert.deepEqual(parseWallpaperPreview(stored), {
    source: 'https://example.com/a.jpg',
    dataUrl: tinyPreview,
  })
  assert.equal(parseWallpaperPreview(null), null)
  assert.equal(parseWallpaperPreview('not json'), null)
  // 字段缺失或类型不符时按无预览处理
  assert.equal(parseWallpaperPreview(JSON.stringify({ source: 'idb:upload-1' })), null)
  assert.equal(parseWallpaperPreview(JSON.stringify({ source: 1, dataUrl: tinyPreview })), null)
  assert.equal(parseWallpaperPreview(JSON.stringify(['idb:upload-1', tinyPreview])), null)
})

test('only covers sources that startup-wallpaper.js cannot paint', () => {
  // 在线地址需要下载、IndexedDB Blob 需要异步读回，才需要预览铺底
  assert.equal(shouldUseStartupPreview('https://example.com/a.jpg'), true)
  assert.equal(shouldUseStartupPreview('http://127.0.0.1:8791/a.jpg'), true)
  assert.equal(shouldUseStartupPreview('idb:upload-1'), true)
  // 本地预设图由首帧脚本直接绘制，无需预览
  assert.equal(shouldUseStartupPreview('./../images/wallpapers/wallpaper-1.jpg'), false)
  assert.equal(shouldUseStartupPreview('data:image/png;base64,AAAA'), false)
  assert.equal(shouldUseStartupPreview(''), false)
})
