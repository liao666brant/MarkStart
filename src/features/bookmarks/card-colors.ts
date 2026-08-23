import { isBookmarkColors } from './page-parsers'
import type { BookmarkColors } from './page-parsers'

const COLOR_KEY_PREFIX = 'bookmark-colors-'
// 已废弃的文件夹颜色整表缓存键（ColorCache v2 已移除），载入时顺带清理
const LEGACY_V2_STORAGE_KEY = 'bookmark-colors-v2'
const SAVE_DELAY_MS = 2000

// 书签卡颜色缓存的内存层：渲染路径不再逐卡同步读写 localStorage，
// 首次访问时一次性载入，写操作收集脏项后延迟批量落盘
let loaded = false
const memory = new Map<string, BookmarkColors>()
const dirty = new Set<string>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

function loadIfNeeded(): void {
  if (loaded) return
  loaded = true
  localStorage.removeItem(LEGACY_V2_STORAGE_KEY)
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key === null || !key.startsWith(COLOR_KEY_PREFIX)) continue
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '')
      if (isBookmarkColors(parsed)) memory.set(key.slice(COLOR_KEY_PREFIX.length), parsed)
    } catch {
      // 损坏的条目直接跳过
    }
  }
}

function scheduleSave(): void {
  if (saveTimer !== undefined) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    for (const bookmarkId of dirty) {
      const colors = memory.get(bookmarkId)
      if (colors !== undefined) {
        localStorage.setItem(COLOR_KEY_PREFIX + bookmarkId, JSON.stringify(colors))
      }
    }
    dirty.clear()
  }, SAVE_DELAY_MS)
}

export function getCachedCardColors(bookmarkId: string): BookmarkColors | null {
  loadIfNeeded()
  return memory.get(bookmarkId) ?? null
}

export function setCachedCardColors(bookmarkId: string, colors: BookmarkColors): void {
  loadIfNeeded()
  memory.set(bookmarkId, colors)
  dirty.add(bookmarkId)
  scheduleSave()
}

export function evictCachedCardColors(bookmarkId: string): void {
  loadIfNeeded()
  memory.delete(bookmarkId)
  dirty.delete(bookmarkId)
  localStorage.removeItem(COLOR_KEY_PREFIX + bookmarkId)
}
