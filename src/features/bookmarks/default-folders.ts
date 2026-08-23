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
  // 逐个串行 await 会把最多 8 次 IPC 排成一条链，并行探测即可
  const checked = await Promise.all(folders.map(async (folder) => {
    const [bookmark] = await bookmarks.get(folder.id).then(
      ([entry]) => [entry],
      () => [],
    )

    return bookmark && !bookmark.url ? folder : null
  }))
  const validFolders = checked.filter((folder): folder is DefaultFolder => folder !== null)

  if (validFolders.length !== folders.length) {
    await storage.local.set({
      defaultFolders: { ...defaultFolders, items: validFolders },
    })
  }

  return validFolders
}
