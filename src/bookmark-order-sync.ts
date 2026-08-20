type BookmarkNode = {
  readonly id: string
}

type BookmarkCache = {
  readonly get: (parentId: string) => { readonly bookmarks: readonly BookmarkNode[] } | null | undefined
  readonly set: (parentId: string, bookmarks: readonly BookmarkNode[]) => void
}

type BookmarksChildrenApi = {
  readonly getChildren: (parentId: string, callback: (bookmarks: readonly BookmarkNode[]) => void) => void
}

type RenderBookmarks = (bookmarks: readonly BookmarkNode[]) => void

export function refreshBookmarkOrder(
  bookmarksApi: BookmarksChildrenApi,
  cache: BookmarkCache,
  parentId: string,
  renderBookmarks: RenderBookmarks,
): void {
  const cached = cache.get(parentId)
  if (!cached) return

  bookmarksApi.getChildren(parentId, (bookmarks) => {
    const chromeOrder = bookmarks.map((bookmark) => bookmark.id)
    const cachedOrder = cached.bookmarks.map((bookmark) => bookmark.id)

    if (JSON.stringify(chromeOrder) !== JSON.stringify(cachedOrder)) {
      cache.set(parentId, bookmarks)
      renderBookmarks(bookmarks)
    }
  })
}
