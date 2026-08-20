type CacheEntry<T> = {
  readonly timestamp: number
  readonly bookmarks: readonly T[]
}

const MAX_SIZE = 100
const MAX_AGE = 5 * 60 * 1000

export function createBookmarkCache<T>(now: () => number = Date.now) {
  const data = new Map<string, CacheEntry<T>>()

  const cleanup = (): void => {
    const entries = [...data.entries()].sort((left, right) => left[1].timestamp - right[1].timestamp)
    const deleteCount = Math.floor(entries.length * 0.2)
    for (const [parentId] of entries.slice(0, deleteCount)) data.delete(parentId)
  }

  return {
    set(parentId: string, bookmarks: readonly T[]): void {
      if (data.size >= MAX_SIZE) cleanup()
      data.set(parentId, { timestamp: now(), bookmarks })
    },
    get(parentId: string): CacheEntry<T> | null {
      const cached = data.get(parentId)
      if (cached === undefined) return null
      if (now() - cached.timestamp > MAX_AGE) {
        data.delete(parentId)
        return null
      }
      return cached
    },
    delete(parentId: string): boolean {
      return data.delete(parentId)
    },
    clear(): void {
      data.clear()
    },
  }
}
