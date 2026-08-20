// allow: SIZE_OK — legacy quick-links DOM controller; this task is type-only migration.
import { ICONS } from './icons';
import type { IconName } from './icons';
import QRCode from 'qrcode';

type QuickLink = {
  readonly name: string;
  readonly url: string;
  readonly favicon: string;
  readonly fixed: boolean;
};

type HistoryEntry = {
  readonly url: string;
  readonly title: string;
  readonly lastVisitTime: number;
};

type DomainPageVisit = {
  readonly item: HistoryEntry;
  visitCount: number;
  lastVisitTime: number;
};

type DomainVisit = {
  totalCount: number;
  lastVisit: number;
  mainPage: HistoryEntry | null;
  lastSubPage: HistoryEntry | null;
  readonly subPages: Map<string, DomainPageVisit>;
};

type SortedHistoryItem = HistoryEntry & {
  readonly domain: string;
  readonly visitCount: number;
};

type ContextMenuItem = {
  readonly text: string;
  readonly icon: IconName;
  readonly action: () => unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseQuickLinks(value: unknown): QuickLink[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item['name'] !== 'string' ||
      typeof item['url'] !== 'string' ||
      typeof item['favicon'] !== 'string' ||
      typeof item['fixed'] !== 'boolean'
    ) {
      return [];
    }

    return [{
      name: item['name'],
      url: item['url'],
      favicon: item['favicon'],
      fixed: item['fixed'],
    }];
  });
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseHistoryEntry(item: chrome.history.HistoryItem): HistoryEntry | null {
  if (!item.url || typeof item.lastVisitTime !== 'number') return null;

  return {
    url: item.url,
    title: item.title ?? '',
    lastVisitTime: item.lastVisitTime,
  };
}

document.addEventListener('DOMContentLoaded', function () {
  const MAX_DISPLAY = 10;

  // 添加快捷链接专用的状态变量
  let quickLinkToDelete: QuickLink | null = null;

  function faviconURL(u: string): string {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", u);
    url.searchParams.set("size", "32");
    url.searchParams.set("cache", "1");
    return url.toString();
  }

  function getSiteName(title: string, url: string): string {
    const MAX_WIDTH_EN = 16; // 英文最大宽度
    const MAX_WIDTH_CN = 14; // 中文最大宽度（允许7个中文字符）
    const MAX_WIDTH_MIXED = 15; // 混合语言最大宽度

    function getVisualWidth(str: string): number {
        return str.split('').reduce((width, char) => {
            return width + (/[\u4e00-\u9fa5]/.test(char) ? 2 : 1);
        }, 0);
    }

    function cleanTitle(value: string): string {
        if (!value) return '';

        // 移除常见的无用后缀
        let cleaned = value.replace(/\s*[-|·:]\s*.*$/, '');

        // 移除常见的网站后缀保留有效的标题部分
        cleaned = cleaned.replace(/\s*(官方网站|首页|网|网站|官网)$/, '');

        // 如果标题太长，尝试提取品牌名
        if (cleaned.length > 20) {
            const parts = cleaned.split(/\s+/);
            cleaned = parts.length > 1 ? parts.slice(0, 2).join(' ') : cleaned.substring(0, 20);
        }

        // 如果清理后仍为空，返回原始标题的某种变体
        const cleanedTitle = cleaned.trim();
        if (cleanedTitle === '') {
            return cleaned;
        }

        return cleanedTitle;
    }

    title = cleanTitle(title);

    // 处理标题
    if (title && title.trim() !== '') {
        const visualWidth = getVisualWidth(title);
        const chineseCharCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length;
        const chineseRatio = chineseCharCount / title.length;

        let maxWidth;
        if (chineseRatio === 0) {
            maxWidth = MAX_WIDTH_EN;
        } else if (chineseRatio === 1) {
            maxWidth = MAX_WIDTH_CN;
        } else {
            maxWidth = Math.round(MAX_WIDTH_MIXED * (1 - chineseRatio) + MAX_WIDTH_CN * chineseRatio / 2);
        }

        if (visualWidth > maxWidth) {
            let truncated = '';
            let currentWidth = 0;
            for (let char of title) {
                const charWidth = /[\u4e00-\u9fa5]/.test(char) ? 2 : 1;
                if (currentWidth + charWidth > maxWidth) break;
                truncated += char;
                currentWidth += charWidth;
            }
            return truncated; // 返回截断后的标题
        }
        return title; // 返回清理后的标题
    } else {
        // 处理 URL
        try {
            const hostname = new URL(url).hostname;
            let name = hostname.replace(/^www\./, '').split('.')[0] ?? '';
            name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');
            return getVisualWidth(name) > MAX_WIDTH_EN ? name.substring(0, MAX_WIDTH_EN) : name;
        } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            return 'Unknown Site';
        }
    }
  }

  // 获取固定的快捷方式
  function getFixedShortcuts(): Promise<QuickLink[]> {
    return new Promise((resolve) => {
      chrome.storage.sync.get('fixedShortcuts', (result) => {
        resolve(parseQuickLinks(result['fixedShortcuts']));
      });
    });
  }

  // 更新固定的快捷方式
  function updateFixedShortcut(updatedSite: QuickLink, oldUrl: string): void {
    chrome.storage.sync.get('fixedShortcuts', (result) => {
      const fixedShortcuts = parseQuickLinks(result['fixedShortcuts']);
      const index = fixedShortcuts.findIndex(s => s.url === oldUrl);
      if (index !== -1) {
        fixedShortcuts[index] = updatedSite;
      } else {
        fixedShortcuts.push(updatedSite);
      }
      chrome.storage.sync.set({ fixedShortcuts }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving updated shortcut:', chrome.runtime.lastError);
        } else {
          refreshQuickLink(updatedSite, oldUrl);
          setTimeout(() => generateQuickLinks(), 0);
        }
      });
    });
  }

  // 智能排序历史记录
  function sortHistoryItems(items: readonly chrome.history.HistoryItem[]): SortedHistoryItem[] {
    const now = new Date().getTime();
    const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // 一周的毫秒数

    // 创建一个 Map 来存储每个主域名的访问信息
    const domainVisits = new Map<string, DomainVisit>();

    // 计算每个域名的访问次数和最后访问时间，同时保存主页面和子页面信息
    items.forEach(rawItem => {
      const item = parseHistoryEntry(rawItem);
      if (!item) return;

      const url = new URL(item.url);
      const domain = url.hostname;

      let domainInfo = domainVisits.get(domain);
      if (!domainInfo) {
        domainInfo = {
          totalCount: 0,
          lastVisit: 0,
          mainPage: null,
          lastSubPage: null,
          subPages: new Map(),
        };
        domainVisits.set(domain, domainInfo);
      }

      domainInfo.totalCount += 1;

      if (item.lastVisitTime > domainInfo.lastVisit) {
        domainInfo.lastVisit = item.lastVisitTime;
      }

      // 使用新的更新逻辑
      updateDomainPageInfo(domainInfo, item);
    });

    // 将 Map 转换为数组并排序
    return Array.from(domainVisits.entries())
      .flatMap(([domain, info]) => {
        // 优先选择主页面，如果没有主页面则选择最后访问的子页面
        const representativeItem = info.mainPage || info.lastSubPage;

        if (!representativeItem) return []; // 跳过没有有效项目的域名

        return [{
          domain: domain,
          url: representativeItem.url,
          title: representativeItem.title,
          lastVisitTime: info.lastVisit,
          visitCount: info.totalCount
        }];
      })
      .sort((a, b) => {
        const recencyScoreA = Math.exp(-(now - a.lastVisitTime) / WEEK_IN_MS);
        const recencyScoreB = Math.exp(-(now - b.lastVisitTime) / WEEK_IN_MS);
        const frequencyScoreA = Math.log(a.visitCount + 1);
        const frequencyScoreB = Math.log(b.visitCount + 1);
        const scoreA = recencyScoreA * 0.45 + frequencyScoreA * 0.55;
        const scoreB = recencyScoreB * 0.45 + frequencyScoreB * 0.55;
        return scoreB - scoreA;
      });
  }

  // 1. 添加缓存机制
  const quickLinksCache: {
    data: QuickLink[] | null;
    timestamp: number;
    readonly maxAge: number;
    isValid(): boolean;
    set(data: QuickLink[]): void;
    load(): void;
  } = {
    data: null,
    timestamp: 0,
    maxAge: 5 * 60 * 1000, // 5分钟缓存

    isValid() {
      return this.data !== null && (Date.now() - this.timestamp < this.maxAge);
    },

    set(data: QuickLink[]) {
      this.data = data;
      this.timestamp = Date.now();
      // 将数据保存到 localStorage
      localStorage.setItem('quickLinksCache', JSON.stringify({
        data: data,
        timestamp: this.timestamp
      }));
    },

    load() {
      const cached = localStorage.getItem('quickLinksCache');
      if (cached) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(cached);
        } catch (error) {
          if (error instanceof SyntaxError) {
            localStorage.removeItem('quickLinksCache');
            return;
          }
          throw error;
        }
        if (!isRecord(parsed) || typeof parsed['timestamp'] !== 'number') return;

        this.data = parseQuickLinks(parsed['data']);
        this.timestamp = parsed['timestamp'];
      }
    }
  };

  // 2. 优化生成快速链接函数
  async function generateQuickLinks() {
    // 首先尝试使用缓存数据快速渲染
    if (quickLinksCache.isValid()) {
      const cachedLinks = quickLinksCache.data;
      if (cachedLinks) renderQuickLinks(cachedLinks);


      // 在后台更新缓存
      updateQuickLinksCache();
      return;
    }

    // 如果没有有效缓存，则正常加载
    const fixedShortcuts = await getFixedShortcuts();
    const fixedUrls = new Set(fixedShortcuts.map(shortcut => shortcut.url));
    const blacklist = await getBlacklist();

    // 添加搜索引擎域名到黑名单
    const searchEngineDomains = [
      'kimi.moonshot.cn',
      'www.doubao.com',
      'chatgpt.com',
      'felo.ai',
      'metaso.cn',
      'www.google.com',
      'cn.bing.com',
      'www.baidu.com',
      'www.sogou.com',
      'www.so.com',
      'www.360.cn',
      'chrome-extension://amkgcblhdallfcijnbmjahooalabjaao'  // 添加扩展自身的URL
    ];

    // 将搜索引擎域名添加到黑名单
    for (const domain of searchEngineDomains) {
      if (!blacklist.includes(domain)) {
        await addToBlacklist(domain);
      }
    }

    // 重新获取更新后的黑名单
    const updatedBlacklist = await getBlacklist();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    chrome.history.search({
      text: '',
      startTime: oneMonthAgo.getTime(),
      maxResults: 1000
    }, function (historyItems) {
      const sortedHistory = sortHistoryItems(historyItems);
      const uniqueDomains = new Set<string>();
      const allShortcuts: QuickLink[] = [];

      // 首先添加固定的快捷方式
      fixedShortcuts.forEach(shortcut => {
        const domain = new URL(shortcut.url).hostname;
        if (!updatedBlacklist.includes(domain)) {
          allShortcuts.push(shortcut);
          uniqueDomains.add(domain);
        }
      });

      // 然后添加历史记录中的项目
      for (const item of sortedHistory) {
        const domain = new URL(item.url).hostname;
        if (!fixedUrls.has(item.url) && !uniqueDomains.has(domain) && allShortcuts.length < MAX_DISPLAY && !updatedBlacklist.includes(domain)) {
          uniqueDomains.add(domain);
          allShortcuts.push({
            name: getSiteName(item.title, item.url),
            url: item.url,
            favicon: faviconURL(item.url),
            fixed: false
          });
        }
      }

      renderQuickLinks(allShortcuts);

    });
  }

  // 3. 添加后台更新缓存的函数
  async function updateQuickLinksCache() {
    const fixedShortcuts = await getFixedShortcuts();
    const fixedUrls = new Set(fixedShortcuts.map(shortcut => shortcut.url));
    // 重新获取更新后的黑名单
    const updatedBlacklist = await getBlacklist();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    chrome.history.search({
      text: '',
      startTime: oneMonthAgo.getTime(),
      maxResults: 1000
    }, function (historyItems) {
      const sortedHistory = sortHistoryItems(historyItems);
      const uniqueDomains = new Set<string>();
      const allShortcuts: QuickLink[] = [];

      // 首先添加固定的快捷方式
      fixedShortcuts.forEach(shortcut => {
        const domain = new URL(shortcut.url).hostname;
        if (!updatedBlacklist.includes(domain)) {
          allShortcuts.push(shortcut);
          uniqueDomains.add(domain);
        }
      });

      // 然后添加历史记录中的项目
      for (const item of sortedHistory) {
        const domain = new URL(item.url).hostname;
        if (!fixedUrls.has(item.url) && !uniqueDomains.has(domain) && allShortcuts.length < MAX_DISPLAY && !updatedBlacklist.includes(domain)) {
          uniqueDomains.add(domain);
          allShortcuts.push({
            name: getSiteName(item.title, item.url),
            url: item.url,
            favicon: faviconURL(item.url),
            fixed: false
          });
        }
      }

      // 更新缓存
      quickLinksCache.set(allShortcuts);
    });
  }

  // 3. 优化渲染函数，使用 DocumentFragment 减少重排
  function renderQuickLinks(shortcuts: readonly QuickLink[]): void {
    const quickLinksContainer = document.getElementById('quick-links');
    if (!quickLinksContainer) return;

    const fragment = document.createDocumentFragment();

    quickLinksContainer.innerHTML = '';

    // 渲染实际的快捷链接
    shortcuts.forEach((site) => {
      const linkItem = document.createElement('div');
      linkItem.className = 'quick-link-item-container';
      linkItem.dataset['url'] = site.url;

      const link = document.createElement('a');
      link.href = site.url;
      link.className = 'quick-link-item';

      // 修改点击事件处理
      link.addEventListener('click', function(event) {
        event.preventDefault();

        try {
          console.log('[Quick Link Click] Starting...', {
            url: site.url,
            currentUrl: window.location.href
          });

          chrome.storage.sync.get(['openInNewTab'], (result) => {
            if (result['openInNewTab'] !== false) {
              window.open(site.url, '_blank');
            } else {
              window.location.href = site.url;
            }
          });
        } catch (error) {
          if (error instanceof Error) {
            console.error('[Quick Link Click] Error:', error);
            return;
          }
          throw error;
        }
      });

      const img = document.createElement('img');
      img.src = site.favicon;
      img.alt = `${site.name} Favicon`;
      img.loading = 'lazy'; // 添加图片懒加载
      img.addEventListener('error', function () {
        this.src = '../images/placeholder-icon.svg';
      });

      link.appendChild(img);

      const span = document.createElement('span');
      span.textContent = site.name;

      linkItem.appendChild(link);
      linkItem.appendChild(span);

      linkItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, site);
      });

      fragment.appendChild(linkItem);
    });

    // 智能添加占位符
    const placeholdersNeeded = Math.min(0, 10 - shortcuts.length); // 最多显示3个占位符
    if (shortcuts.length < 10) {
        for (let i = 0; i < placeholdersNeeded; i++) {
            const placeholder = document.createElement('div');
            placeholder.className = 'quick-link-placeholder';

            // 添加提示文本（可选）
            if (i === 0 && shortcuts.length === 0) {
                const hint = document.createElement('span');
                hint.className = 'placeholder-hint';
                hint.textContent = '访问网站将自动添加到这里';
                placeholder.appendChild(hint);
            }

            fragment.appendChild(placeholder);
        }
    }

    quickLinksContainer.appendChild(fragment);

  }

  // 显示上下文菜单
  function showContextMenu(e: MouseEvent, site: QuickLink): void {
    console.log('=== Quick Link Context Menu ===');
    console.log('Event:', e.type);
    console.log('Site:', site);

    e.preventDefault();
    // 移除任何已存在的上下文菜单
    const existingMenu = document.querySelector('.custom-context-menu');
    if (existingMenu) {
      console.log('Removing existing context menu');
      existingMenu.remove();
    }

    const contextMenu = document.createElement('div');
    contextMenu.className = 'custom-context-menu';

    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    // 定义菜单项
    const menuItems: readonly ContextMenuItem[] = [
      { text: chrome.i18n.getMessage("openInNewTab"), icon: 'open_in_new', action: () => window.open(site.url, '_blank') },
      { text: chrome.i18n.getMessage("openInNewWindow"), icon: 'launch', action: () => window.open(site.url, '_blank', 'noopener,noreferrer') },
      { text: chrome.i18n.getMessage("openInIncognito"), icon: 'visibility_off', action: () => openInIncognito(site.url) },
      { text: chrome.i18n.getMessage("editQuickLink"), icon: 'edit', action: () => editQuickLink(site) },
      { text: chrome.i18n.getMessage("deleteQuickLink"), icon: 'delete', action: () => addToBlacklistConfirm(site) },
      { text: chrome.i18n.getMessage("copyLink"), icon: 'content_copy', action: () => copyToClipboard(site.url) },
      { text: chrome.i18n.getMessage("createQRCode"), icon: 'qr_code', action: () => createQRCode(site.url, site.name) }
    ];

    menuItems.forEach((item, index) => {
      const menuItem = document.createElement('div');
      menuItem.className = 'custom-context-menu-item';

      const icon = document.createElement('span');
      icon.className = 'material-icons';
      icon.innerHTML = ICONS[item.icon];

      const text = document.createElement('span');
      text.textContent = item.text;

      menuItem.appendChild(icon);
      menuItem.appendChild(text);

      menuItem.addEventListener('click', () => {
        item.action();
        contextMenu.remove();
      });

      if (index === 3 || index === 5) {
        const divider = document.createElement('div');
        divider.className = 'custom-context-menu-divider';
        contextMenu.appendChild(divider);
      }

      contextMenu.appendChild(menuItem);
    });

    document.body.appendChild(contextMenu);

    // 确保菜单不会超出视窗
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuRect = contextMenu.getBoundingClientRect();

    if (e.clientX + menuRect.width > viewportWidth) {
      contextMenu.style.left = `${viewportWidth - menuRect.width}px`;
    }

    if (e.clientY + menuRect.height > viewportHeight) {
      contextMenu.style.top = `${viewportHeight - menuRect.height}px`;
    }

    // 点击其他地方闭菜单
    function closeMenu(e: MouseEvent): void {
      if (!(e.target instanceof Node) || !contextMenu.contains(e.target)) {
        contextMenu.remove();
        document.removeEventListener('click', closeMenu);
      }
    }

    // 使用 setTimeout 来确保这个监听器不会立即触发
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  // 编辑快捷链接
  function editQuickLink(site: QuickLink): void {
    const editDialog = document.getElementById('edit-dialog');
    const editNameInput = document.getElementById('edit-name');
    const editUrlInput = document.getElementById('edit-url');
    const editForm = document.getElementById('edit-form');
    const cancelButton = document.querySelector<HTMLButtonElement>('.cancel-button');
    const closeButton = document.querySelector<HTMLButtonElement>('.close-button');

    if (
      !editDialog ||
      !(editNameInput instanceof HTMLInputElement) ||
      !(editUrlInput instanceof HTMLInputElement) ||
      !(editForm instanceof HTMLFormElement) ||
      !cancelButton ||
      !closeButton
    ) return;

    const editDialogTitle = editDialog.querySelector('h2');
    if (!editDialogTitle) return;

    editDialogTitle.textContent = chrome.i18n.getMessage("editDialogTitle");

    editNameInput.value = site.name;
    editUrlInput.value = site.url;

    editDialog.style.display = 'block';

    editForm.onsubmit = function(event) {
      event.preventDefault();
      const newName = editNameInput.value.trim();
      const newUrl = editUrlInput.value.trim();

      if (newName && newUrl) {
        const oldUrl = site.url;
        const updatedSite = {
          name: newName,
          url: newUrl,
          favicon: faviconURL(newUrl),
          fixed: true
        };
        updateFixedShortcut(updatedSite, oldUrl);
        editDialog.style.display = 'none';
      }
    };

    cancelButton.onclick = function() {
      editDialog.style.display = 'none';
    };

    closeButton.onclick = function() {
      editDialog.style.display = 'none';
    };
  }

  // 刷新单个快捷链接
  function refreshQuickLink(site: QuickLink, oldUrl: string): void {
    const linkItem = document.querySelector<HTMLElement>(`.quick-link-item-container[data-url="${CSS.escape(oldUrl)}"]`);
    if (linkItem) {
      const link = linkItem.querySelector<HTMLAnchorElement>('a');
      const img = link?.querySelector<HTMLImageElement>('img');
      const span = linkItem.querySelector('span');
      if (!link || !img || !span) return;

      link.href = site.url;

      // 更新 favicon
      const newFaviconUrl = faviconURL(site.url);
      img.src = newFaviconUrl;
      img.alt = `${site.name} Favicon`;

      // 添加错误处理，如果新的 favicon 加载失败，使用默认图标
      img.onerror = function() {
        this.src = '../images/placeholder-icon.svg';
      };

      span.textContent = site.name;

      // 更新 data-url 属性
      linkItem.dataset['url'] = site.url;
    } else {
      console.error('Quick link element not found for:', oldUrl);
      generateQuickLinks();
    }
  }

  // 确认添加到黑名单
  function addToBlacklistConfirm(site: QuickLink): void {
    console.log('=== Quick Link Delete Confirmation ===');
    console.log('Quick link to delete:', site);

    const confirmDialog = document.getElementById('confirm-dialog');
    const confirmMessage = document.getElementById('confirm-dialog-message');
    const confirmDeleteQuickLinkMessage = document.getElementById('confirm-delete-quick-link-message');
    const confirmDeleteButton = document.querySelector<HTMLButtonElement>('#confirm-delete-button');
    const cancelDeleteButton = document.querySelector<HTMLButtonElement>('#cancel-delete-button');
    if (!confirmDialog || !confirmDeleteButton || !cancelDeleteButton) return;

    // 保存要删除的快捷链接
    quickLinkToDelete = site;
    console.log('Set quickLinkToDelete:', quickLinkToDelete);

    // 确保两个消息元素都正确显示
    if (confirmMessage) {
      confirmMessage.style.display = 'none'; // 隐藏默认的确认消息
    }

    if (confirmDeleteQuickLinkMessage) {
      confirmDeleteQuickLinkMessage.style.display = 'block'; // 显示快捷链接的确认消息
      confirmDeleteQuickLinkMessage.innerHTML = chrome.i18n.getMessage(
        "confirmDeleteQuickLinkMessage",
        `<strong>${site.name}</strong>`
      );
      console.log('Setting quick link delete message:', confirmDeleteQuickLinkMessage.innerHTML);
    } else {
      console.error('Quick link delete message element not found');
    }

    confirmDialog.style.display = 'block';

    // 修改确认按钮处理程序
    confirmDeleteButton.onclick = function() {
      console.log('=== Quick Link Delete Confirmed ===');
      console.log('Current quickLinkToDelete:', quickLinkToDelete);

      const selectedLink = quickLinkToDelete;
      if (selectedLink) {
        const domain = new URL(selectedLink.url).hostname;
        console.log('Deleting domain:', domain);

        addToBlacklist(domain).then((added) => {
          console.log('Domain added to blacklist:', added);
          if (added) {
            if (selectedLink.fixed) {
              console.log('Removing fixed shortcut:', selectedLink);
              chrome.storage.sync.get('fixedShortcuts', (result) => {
                const fixedShortcuts = parseQuickLinks(result['fixedShortcuts']);
                const updatedShortcuts = fixedShortcuts.filter(s => s.url !== selectedLink.url);
                chrome.storage.sync.set({ fixedShortcuts: updatedShortcuts });
              });
            }
            generateQuickLinks();
            // 使用 chrome.i18n.getMessage 显示删除成功提示
            showToast(chrome.i18n.getMessage('deleteSuccess'));
          }
          confirmDialog.style.display = 'none';
          // 重置消息显示状态
          if (confirmMessage) confirmMessage.style.display = 'block';
          if (confirmDeleteQuickLinkMessage) confirmDeleteQuickLinkMessage.style.display = 'none';
          console.log('Clearing quickLinkToDelete state');
          quickLinkToDelete = null;
        });
      } else {
        console.error('No quick link selected for deletion');
      }
    };

    // 修改取消按钮处理程序
    cancelDeleteButton.onclick = function() {
      console.log('=== Quick Link Delete Cancelled ===');
      console.log('Clearing quickLinkToDelete:', quickLinkToDelete);
      confirmDialog.style.display = 'none';
      // 重置消息显示状态
      if (confirmMessage) confirmMessage.style.display = 'block';
      if (confirmDeleteQuickLinkMessage) confirmDeleteQuickLinkMessage.style.display = 'none';
      quickLinkToDelete = null;
    };
  }

  // 在无痕窗口中打开链接
  function openInIncognito(url: string): void {
    chrome.windows.create({ url: url, incognito: true });
  }

  // 复制链接到剪贴板
  function copyToClipboard(url: string): void {
    try {
      navigator.clipboard.writeText(url).then(() => {
        // 使用本地化消息
        showToast(chrome.i18n.getMessage("linkCopied"));
      }).catch(() => {
        // 使用本地化消息
        showToast(chrome.i18n.getMessage("copyLinkFailed"));
      });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      console.error('Copy failed:', error);
      // 使用本地化消息
      showToast(chrome.i18n.getMessage("copyLinkFailed"));
    }
  }
  // 显示 toast 提示
  function showToast(message: string): void {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000); // 显示3秒钟
  }

  // 创建二维码的函数
  function createQRCode(url: string, bookmarkName: string): void {
    // 创建一个模态来显示二维码
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';

    const qrContainer = document.createElement('div');
    qrContainer.style.backgroundColor = 'white';
    qrContainer.style.padding = '1.5rem 3rem';
    qrContainer.style.width = '320px';
    qrContainer.style.borderRadius = '10px';
    qrContainer.style.display = 'flex';
    qrContainer.style.flexDirection = 'column';
    qrContainer.style.alignItems = 'center';
    qrContainer.style.position = 'relative';

    // 添加关闭按钮
    const closeButton = document.createElement('span');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.right = '10px';
    closeButton.style.top = '10px';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.onclick = () => document.body.removeChild(modal);
    qrContainer.appendChild(closeButton);

    // 添加标题
    const title = document.createElement('h2');
    title.textContent = window.getLocalizedMessage('scanQRCode');
    title.style.marginBottom = '20px';
    title.style.fontWeight = '600';
    title.style.fontSize = '0.875rem';
    qrContainer.appendChild(title);

    // 创建 QR 码容器
    const qrCodeElement = document.createElement('canvas');
    qrContainer.appendChild(qrCodeElement);

    // 添加 URL 显示
    const urlDisplay = document.createElement('div');
    urlDisplay.textContent = url;
    urlDisplay.style.marginTop = '20px';
    urlDisplay.style.wordBreak = 'break-all';
    urlDisplay.style.maxWidth = '300px';
    urlDisplay.style.textAlign = 'center';
    qrContainer.appendChild(urlDisplay);

    // 添加按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.width = '100%';
    buttonContainer.style.marginTop = '20px';

    // 添加复制按钮
    const copyButton = document.createElement('button');
    copyButton.textContent = window.getLocalizedMessage('copyLink');
    copyButton.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        copyButton.textContent = window.getLocalizedMessage('copied');
        setTimeout(() => copyButton.textContent = window.getLocalizedMessage('copyLink'), 2000);
      });
    };

    // 添加下载按钮
    const downloadButton = document.createElement('button');
    downloadButton.textContent = window.getLocalizedMessage('download');
    downloadButton.onclick = () => {
      setTimeout(() => {
        const canvas = qrCodeElement;
        if (canvas) {
          const link = document.createElement('a');
          // 使用书签名称作为文件名，添加 .png 扩展名
          const fileName = `${bookmarkName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qrcode.png`;
          link.download = fileName;
          link.href = canvas.toDataURL('image/png');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }, 100);
    };

    // 设置按钮样式和hover效果
    [copyButton, downloadButton].forEach(button => {
      button.style.padding = '5px 10px';
      button.style.border = 'none';
      button.style.borderRadius = '5px';
      button.style.cursor = 'pointer';
      button.style.backgroundColor = '#f0f0f0';
      button.style.color = '#333';
      button.style.transition = 'all 0.3s ease';

      // 添加hover效果
      button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = '#e0e0e0';
        button.style.color = '#111827';
      });
      button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = '#f0f0f0';
        button.style.color = '#717882';
      });
    });

    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(downloadButton);
    qrContainer.appendChild(buttonContainer);

    modal.appendChild(qrContainer);
    document.body.appendChild(modal);

    void QRCode.toCanvas(qrCodeElement, url, { width: 200 }).catch((error: unknown) => {
      if (error instanceof Error) {
        console.error('Failed to create QR code:', error);
        return;
      }
      throw error;
    });

    // 点击模态框外部关闭
    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  // 获取黑名单
  function getBlacklist(): Promise<string[]> {
    return new Promise((resolve) => {
      chrome.storage.sync.get('blacklist', (result) => {
        resolve(parseStringArray(result['blacklist']));
      });
    });
  }

  // 添加到黑名单
  function addToBlacklist(domain: string): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.storage.sync.get('blacklist', (result) => {
        const blacklist = parseStringArray(result['blacklist']);
        if (!blacklist.includes(domain)) {
          blacklist.push(domain);
          chrome.storage.sync.set({ blacklist }, () => {
            resolve(true);
          });
        } else {
          resolve(false);
        }
      });
    });
  }

  // 初始化
  generateQuickLinks();

  // 加载缓存
  quickLinksCache.load();

  // 定义主页路径模式
  const MAIN_PAGE_PATTERNS = {
    paths: ['/', '', '/home', '/index', '/main', '/welcome', '/start', '/default', '/dashboard', '/portal', '/explore'],
    // 添加常见的主页查询参数模式
    queryParams: ['home=true', 'page=home', 'view=home'],
    // 添加常见的主页语言变体
    localizedPaths: ['/zh', '/en', '/zh-CN', '/zh-TW', '/en-US']
  } as const;

  // 优化判断主页的逻辑
  function isMainPageUrl(path: string, query: string): boolean {
    // 1. 检查基本路径
    if (MAIN_PAGE_PATTERNS.paths.some((candidate) => candidate === path)) {
      return true;
    }

    // 2. 检查本地化路径变体
    if (MAIN_PAGE_PATTERNS.localizedPaths.some(localePath => path.startsWith(localePath))) {
      return true;
    }

    // 3. 检查查询参数
    if (query && MAIN_PAGE_PATTERNS.queryParams.some(param => query.includes(param))) {
      return true;
    }

    // 4. 检查路径深度（通常主页路径层级较浅）
    const pathSegments = path.split('/').filter(Boolean);
    const firstSegment = pathSegments[0];
    if (pathSegments.length === 1 && firstSegment?.toLowerCase().includes('home')) {
      return true;
    }

    return false;
  }

  // 更新域名信息的逻辑
  function updateDomainPageInfo(domainInfo: DomainVisit, item: HistoryEntry): DomainVisit {
    const url = new URL(item.url);
    const path = url.pathname;
    const query = url.search;

    // 判断是否为主页
    if (isMainPageUrl(path, query)) {
      // 如果是主页，且比现有主页更新或尚未设置主页
      if (!domainInfo.mainPage || item.lastVisitTime > domainInfo.mainPage.lastVisitTime) {
        domainInfo.mainPage = item;
      }
    } else {
      // 如果不是主页，更新最近访问的子页面
      if (!domainInfo.lastSubPage || item.lastVisitTime > domainInfo.lastSubPage.lastVisitTime) {
        const existingSubPage = domainInfo.subPages.get(path);
        if (existingSubPage) {
          existingSubPage.visitCount++;
          existingSubPage.lastVisitTime = Math.max(existingSubPage.lastVisitTime, item.lastVisitTime);
        } else {
          domainInfo.subPages.set(path, {
            item: item,
            visitCount: 1,
            lastVisitTime: item.lastVisitTime
          });
        }

        domainInfo.lastSubPage = item;
      }
    }

    return domainInfo;
  }

});
