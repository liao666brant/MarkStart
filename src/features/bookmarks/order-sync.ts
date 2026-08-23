type BookmarkNode = {
  readonly id: string
  readonly title?: string
  readonly url?: string
}

type BookmarkCache<T extends BookmarkNode> = {
  readonly get: (parentId: string) => { readonly bookmarks: readonly T[] } | null | undefined
  readonly set: (parentId: string, bookmarks: readonly T[]) => void
}

type BookmarksChildrenApi<T extends BookmarkNode> = {
  readonly getChildren: (parentId: string, callback: (bookmarks: readonly T[]) => void) => void
}

type RenderBookmarks<T extends BookmarkNode> = (bookmarks: readonly T[]) => void

type SyncTrigger = (parentId: string) => void
type CurrentParentId = () => string | undefined
type SyncErrorHandler = (error: unknown) => void

export type BookmarkChangeSource = {
  readonly addListener: (callback: () => void) => void
}

export type BookmarkSyncOptions = {
  // 事件合流静默期：窗口内的后续事件只触发一次收尾同步；0 表示每次事件立即同步
  readonly quietPeriodMs?: number
}

// 逐字段浅比较替代 JSON.stringify，避免大文件夹每事件两次整树序列化
function sameBookmarks(left: readonly BookmarkNode[], right: readonly BookmarkNode[]): boolean {
  if (left.length !== right.length) return false
  for (const [index, after] of right.entries()) {
    const before = left[index]
    if (before === undefined) return false
    if (before.id !== after.id || before.title !== after.title || before.url !== after.url) return false
  }
  return true
}

export function refreshBookmarkOrder<T extends BookmarkNode>(
  bookmarksApi: BookmarksChildrenApi<T>,
  cache: BookmarkCache<T>,
  parentId: string,
  renderBookmarks: RenderBookmarks<T>,
): void {
  const cached = cache.get(parentId)

  bookmarksApi.getChildren(parentId, (bookmarks) => {
    if (cached === null || cached === undefined || !sameBookmarks(bookmarks, cached.bookmarks)) {
      cache.set(parentId, bookmarks)
      renderBookmarks(bookmarks)
    }
  })
}

export function startBookmarkChangeSync(
  sources: readonly BookmarkChangeSource[],
  getCurrentParentId: CurrentParentId,
  sync: SyncTrigger,
  handleError: SyncErrorHandler,
  options: BookmarkSyncOptions = {},
): void {
  const quietPeriodMs = options.quietPeriodMs ?? 0
  let lastRunAt = Number.NEGATIVE_INFINITY
  let trailingTimer: ReturnType<typeof setTimeout> | undefined

  const run = (): void => {
    lastRunAt = Date.now()
    const parentId = getCurrentParentId()
    if (!parentId) return

    try {
      sync(parentId)
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const handle = (): void => {
    const elapsed = Date.now() - lastRunAt
    if (elapsed >= quietPeriodMs) {
      if (trailingTimer !== undefined) {
        clearTimeout(trailingTimer)
        trailingTimer = undefined
      }
      run()
      return
    }

    if (trailingTimer !== undefined) clearTimeout(trailingTimer)
    trailingTimer = setTimeout(() => {
      trailingTimer = undefined
      run()
    }, quietPeriodMs - elapsed)
  }

  sources.forEach((source) => source.addListener(handle))
}
