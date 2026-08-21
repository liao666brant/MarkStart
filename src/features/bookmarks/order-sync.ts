type BookmarkNode = {
  readonly id: string
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

export function refreshBookmarkOrder<T extends BookmarkNode>(
  bookmarksApi: BookmarksChildrenApi<T>,
  cache: BookmarkCache<T>,
  parentId: string,
  renderBookmarks: RenderBookmarks<T>,
): void {
  const cached = cache.get(parentId)

  bookmarksApi.getChildren(parentId, (bookmarks) => {
    if (cached === null || cached === undefined || JSON.stringify(bookmarks) !== JSON.stringify(cached.bookmarks)) {
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
): void {
  const handle = (): void => {
    const parentId = getCurrentParentId()
    if (!parentId) return

    try {
      sync(parentId)
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  sources.forEach((source) => source.addListener(handle))
}
