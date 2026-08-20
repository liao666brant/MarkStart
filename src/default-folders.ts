type DefaultFolder = {
  readonly id: string
  readonly name: string
  readonly order: number
}

type DefaultFolders = {
  readonly items?: readonly DefaultFolder[]
}

type DefaultFoldersStorage = {
  readonly defaultFolders?: DefaultFolders
}

type BookmarksApi = {
  readonly get: (id: string) => Promise<readonly { readonly id: string; readonly title?: string; readonly url?: string }[]>
}

type StorageApi = {
  readonly local: {
    readonly get: (key: 'defaultFolders') => Promise<DefaultFoldersStorage>
    readonly set: (items: { readonly defaultFolders: { readonly items: readonly DefaultFolder[] } }) => Promise<void>
  }
}

export async function pruneDefaultFolders(
  bookmarks: BookmarksApi,
  storage: StorageApi,
): Promise<DefaultFolder[]> {
  const { defaultFolders } = await storage.local.get('defaultFolders')
  const folders = Array.isArray(defaultFolders?.items) ? defaultFolders.items : []
  const validFolders: DefaultFolder[] = []

  for (const folder of folders) {
    const [bookmark] = await bookmarks.get(folder.id).then(
      ([entry]) => [entry],
      () => [],
    )

    if (bookmark && !bookmark.url) validFolders.push(folder)
  }

  if (validFolders.length !== folders.length) {
    await storage.local.set({
      defaultFolders: { ...defaultFolders, items: validFolders },
    })
  }

  return validFolders
}
