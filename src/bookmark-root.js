export async function getBookmarksBarId(bookmarks) {
  const [root] = await bookmarks.getTree();
  const folders = root?.children?.filter(node => Array.isArray(node.children) && !node.url) ?? [];
  const bookmarksBar = folders.find(folder => folder.id === '1') ?? folders[0];

  if (!bookmarksBar) {
    throw new Error('No bookmark folder available');
  }

  return bookmarksBar.id;
}
