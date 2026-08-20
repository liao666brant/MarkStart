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

export function refreshBookmarkOrder<T extends BookmarkNode>(
  bookmarksApi: BookmarksChildrenApi<T>,
  cache: BookmarkCache<T>,
  parentId: string,
  renderBookmarks: RenderBookmarks<T>,
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
