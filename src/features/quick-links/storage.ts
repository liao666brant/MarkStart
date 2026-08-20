export type QuickLink = {
  readonly name: string
  readonly url: string
  readonly favicon: string
  readonly fixed: boolean
}

type KeyValueStorage = {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
  readonly removeItem: (key: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseQuickLinks(value: unknown): QuickLink[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item['name'] !== 'string' ||
      typeof item['url'] !== 'string' ||
      typeof item['favicon'] !== 'string' ||
      typeof item['fixed'] !== 'boolean'
    ) {
      return []
    }

    return [{
      name: item['name'],
      url: item['url'],
      favicon: item['favicon'],
      fixed: item['fixed'],
    }]
  })
}

export function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createQuickLinksCache(storage: KeyValueStorage, now: () => number = Date.now) {
  let data: QuickLink[] | null = null
  let timestamp = 0
  const maxAge = 5 * 60 * 1000

  return {
    get data(): QuickLink[] | null {
      return data
    },
    get timestamp(): number {
      return timestamp
    },
    maxAge,
    isValid(): boolean {
      return data !== null && now() - timestamp < maxAge
    },
    set(nextData: QuickLink[]): void {
      data = nextData
      timestamp = now()
      storage.setItem('quickLinksCache', JSON.stringify({ data, timestamp }))
    },
    load(): void {
      const cached = storage.getItem('quickLinksCache')
      if (!cached) return

      let parsed: unknown
      try {
        parsed = JSON.parse(cached)
      } catch (error) {
        if (error instanceof SyntaxError) {
          storage.removeItem('quickLinksCache')
          return
        }
        throw error
      }
      if (!isRecord(parsed) || typeof parsed['timestamp'] !== 'number') return

      data = parseQuickLinks(parsed['data'])
      timestamp = parsed['timestamp']
    },
  }
}
