type HistoryItem = {
  readonly url?: string;
  readonly title?: string;
  readonly lastVisitTime?: number;
};

type HistoryEntry = {
  readonly url: string;
  readonly title: string;
  readonly lastVisitTime: number;
};

type DomainVisit = {
  totalCount: number;
  lastVisit: number;
  mainPage: HistoryEntry | null;
  lastSubPage: HistoryEntry | null;
};

type RankedHistoryItem = HistoryEntry & {
  readonly domain: string;
  readonly visitCount: number;
};

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const MAIN_PAGE_PATTERNS = {
  paths: ['/', '', '/home', '/index', '/main', '/welcome', '/start', '/default', '/dashboard', '/portal', '/explore'],
  queryParams: ['home=true', 'page=home', 'view=home'],
  localizedPaths: ['/zh', '/en', '/zh-CN', '/zh-TW', '/en-US'],
} as const;

function parseHistoryEntry(item: HistoryItem): HistoryEntry | null {
  if (!item.url || typeof item.lastVisitTime !== 'number') return null;

  return {
    url: item.url,
    title: item.title ?? '',
    lastVisitTime: item.lastVisitTime,
  };
}

function parseHistoryUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isMainPageUrl(path: string, query: string): boolean {
  if (MAIN_PAGE_PATTERNS.paths.some((candidate) => candidate === path)) return true;
  if (MAIN_PAGE_PATTERNS.localizedPaths.some((localePath) => path.startsWith(localePath))) return true;
  if (query && MAIN_PAGE_PATTERNS.queryParams.some((param) => query.includes(param))) return true;

  const pathSegments = path.split('/').filter(Boolean);
  return pathSegments.length === 1 && pathSegments[0]?.toLowerCase().includes('home') === true;
}

function updateDomainPageInfo(domainInfo: DomainVisit, item: HistoryEntry, url: URL): void {
  if (isMainPageUrl(url.pathname, url.search)) {
    if (!domainInfo.mainPage || item.lastVisitTime > domainInfo.mainPage.lastVisitTime) {
      domainInfo.mainPage = item;
    }
    return;
  }

  if (!domainInfo.lastSubPage || item.lastVisitTime > domainInfo.lastSubPage.lastVisitTime) {
    domainInfo.lastSubPage = item;
  }
}

export function rankHistoryItems(items: readonly HistoryItem[], now: number): RankedHistoryItem[] {
  const domainVisits = new Map<string, DomainVisit>();

  for (const rawItem of items) {
    const item = parseHistoryEntry(rawItem);
    if (!item) continue;

    const url = parseHistoryUrl(item.url);
    if (!url) continue;

    const domain = url.hostname;
    let domainInfo = domainVisits.get(domain);
    if (!domainInfo) {
      domainInfo = {
        totalCount: 0,
        lastVisit: 0,
        mainPage: null,
        lastSubPage: null,
      };
      domainVisits.set(domain, domainInfo);
    }

    domainInfo.totalCount += 1;
    if (item.lastVisitTime > domainInfo.lastVisit) domainInfo.lastVisit = item.lastVisitTime;
    updateDomainPageInfo(domainInfo, item, url);
  }

  return Array.from(domainVisits.entries())
    .flatMap(([domain, info]) => {
      const representativeItem = info.mainPage || info.lastSubPage;
      if (!representativeItem) return [];

      return [{
        domain,
        url: representativeItem.url,
        title: representativeItem.title,
        lastVisitTime: info.lastVisit,
        visitCount: info.totalCount,
      }];
    })
    .sort((a, b) => {
      const recencyScoreA = Math.exp(-(now - a.lastVisitTime) / WEEK_IN_MS);
      const recencyScoreB = Math.exp(-(now - b.lastVisitTime) / WEEK_IN_MS);
      const frequencyScoreA = Math.log(a.visitCount + 1);
      const frequencyScoreB = Math.log(b.visitCount + 1);
      return (recencyScoreB * 0.45 + frequencyScoreB * 0.55) - (recencyScoreA * 0.45 + frequencyScoreA * 0.55);
    });
}
