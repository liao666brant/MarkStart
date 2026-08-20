import assert from 'node:assert/strict'
import test from 'node:test'

import { pruneDefaultFolders } from '../src/features/bookmarks/default-folders'

test('removes deleted folders from the persisted defaults', async () => {
  const writes: { defaultFolders: { items: readonly { id: string; name: string; order: number }[] } }[] = []
  const storage: Parameters<typeof pruneDefaultFolders>[1] & {
    readonly sync: { readonly get: () => Promise<never> }
  } = {
    local: {
      get: async () => ({
        defaultFolders: {
          items: [
            { id: '4', name: 'Keep', order: 0 },
            { id: '195', name: 'Deleted', order: 1 },
          ],
        },
      }),
      set: async (value) => {
        writes.push(value)
      },
    },
    sync: {
      get: async () => {
        throw new Error('Fixed folders must not use sync storage')
      },
    },
  }
  const bookmarks: Parameters<typeof pruneDefaultFolders>[0] = {
    get: async (id) => {
      if (id === '195') throw new Error("Can't find bookmark for id.")
      return [{ id, title: 'Keep' }]
    },
  }

  const folders = await pruneDefaultFolders(bookmarks, storage)

  assert.deepEqual(folders, [{ id: '4', name: 'Keep', order: 0 }])
  assert.deepEqual(writes, [{ defaultFolders: { items: folders } }])
})
