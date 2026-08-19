export function refreshBookmarkOrder(bookmarksApi, cache, parentId, renderBookmarks) {
  const cached = cache.get(parentId);
  if (!cached) return;

  bookmarksApi.getChildren(parentId, (bookmarks) => {
    const chromeOrder = bookmarks.map(bookmark => bookmark.id);
    const cachedOrder = cached.bookmarks.map(bookmark => bookmark.id);

    if (JSON.stringify(chromeOrder) !== JSON.stringify(cachedOrder)) {
      cache.set(parentId, bookmarks);
      renderBookmarks(bookmarks);
    }
  });
}
