import type { QuickLink } from './storage'

type RankedHistoryItem = {
  readonly url: string
  readonly title: string
}

type BuildQuickLinksOptions = {
  readonly fixedShortcuts: readonly QuickLink[]
  readonly blacklist: readonly string[]
  readonly sortedHistory: readonly RankedHistoryItem[]
  readonly maxDisplay: number
  readonly getSiteName: (title: string, url: string) => string
  readonly faviconURL: (url: string) => string
}

export function buildQuickLinks(options: BuildQuickLinksOptions): QuickLink[] {
  const fixedUrls = new Set(options.fixedShortcuts.map((shortcut) => shortcut.url))
  const uniqueDomains = new Set<string>()
  const shortcuts: QuickLink[] = []

  for (const shortcut of options.fixedShortcuts) {
    const domain = new URL(shortcut.url).hostname
    if (!options.blacklist.includes(domain)) {
      shortcuts.push(shortcut)
      uniqueDomains.add(domain)
    }
  }

  for (const item of options.sortedHistory) {
    const domain = new URL(item.url).hostname
    if (
      fixedUrls.has(item.url) ||
      uniqueDomains.has(domain) ||
      shortcuts.length >= options.maxDisplay ||
      options.blacklist.includes(domain)
    ) {
      continue
    }

    uniqueDomains.add(domain)
    shortcuts.push({
      name: options.getSiteName(item.title, item.url),
      url: item.url,
      favicon: options.faviconURL(item.url),
      fixed: false,
    })
  }

  return shortcuts
}
