export async function pruneDefaultFolders(bookmarks, storage) {
  const { defaultFolders } = await storage.sync.get('defaultFolders');
  const folders = Array.isArray(defaultFolders?.items) ? defaultFolders.items : [];
  const validFolders = [];

  for (const folder of folders) {
    try {
      const [bookmark] = await bookmarks.get(folder.id);
      if (bookmark && !bookmark.url) validFolders.push(folder);
    } catch {
      // Deleted bookmarks are removed from the user's default-folder settings.
    }
  }

  if (validFolders.length !== folders.length) {
    await storage.sync.set({
      defaultFolders: { ...defaultFolders, items: validFolders },
    });
  }

  return validFolders;
}
