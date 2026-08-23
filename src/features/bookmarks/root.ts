type BookmarkNode = {
  readonly id: string
  readonly url?: string
  readonly children?: readonly BookmarkNode[]
}

type BookmarksTreeApi = {
  readonly getTree: () => Promise<readonly BookmarkNode[]>
}

// 书签栏 id 在一次会话内不会变化，缓存后避免启动路径反复拉取整棵树
let cachedBookmarksBarId: string | undefined

export async function getBookmarksBarId(bookmarks: BookmarksTreeApi): Promise<string> {
  if (cachedBookmarksBarId !== undefined) return cachedBookmarksBarId

  const [root] = await bookmarks.getTree()
  const folders = root?.children?.filter((node) => Array.isArray(node.children) && !node.url) ?? []
  const bookmarksBar = folders.find((folder) => folder.id === '1') ?? folders[0]

  if (!bookmarksBar) {
    throw new Error('No bookmark folder available')
  }

  cachedBookmarksBarId = bookmarksBar.id
  return cachedBookmarksBarId
}
