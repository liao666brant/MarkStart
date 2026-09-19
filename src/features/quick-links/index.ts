// allow: SIZE_OK — quick-links page controller coordinates DOM, Chrome APIs, and state.
import { rankHistoryItems } from './history';
import { showQuickLinkDeleteDialog, showQuickLinkEditDialog } from './dialogs';
import { copyQuickLinkToClipboard, showQuickLinkToast } from './feedback';
import { showQuickLinkContextMenu } from './menu';
import {
  createQuickLinksCache,
  parseQuickLinks,
  parseStringArray,
} from './storage';
import type { QuickLink } from './storage';
import { buildQuickLinks } from './shortcuts';
import { renderQuickLinks } from './view';
import { getSiteName } from './site-name';
import { createFaviconUrl as faviconURL } from '../../shared/favicon';

document.addEventListener('DOMContentLoaded', function () {
  const MAX_DISPLAY = 10;

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
          // 缓存持有的是本页加载时的快照，先失效再重算，避免覆盖刚保存的修改
          setTimeout(() => regenerateQuickLinks(), 0);
        }
      });
    });
  }

  const quickLinksCache = createQuickLinksCache(localStorage);

  // 2. 优化生成快速链接函数
  async function generateQuickLinks() {
    // 首先尝试使用缓存数据快速渲染
    if (quickLinksCache.isValid()) {
      const cachedLinks = quickLinksCache.data;
      if (cachedLinks) renderQuickLinks(cachedLinks, showContextMenu);


      // 在后台更新缓存
      updateQuickLinksCache();
      return;
    }

    // 如果没有有效缓存，则正常加载
    const fixedShortcuts = await getFixedShortcuts();

    // 种子写入只需一次；V2 修正了扩展自身域名：快捷链接按 hostname 比对，
    // chrome-extension URL 的 hostname 就是扩展 ID，原先写死的完整 URL 与 ID 都不会命中
    if (localStorage.getItem('blacklistSeededV2') !== '1') {
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
        chrome.runtime.id,  // 扩展自身的 URL：快捷链接按 hostname 比对，chrome-extension 的 hostname 就是扩展 ID
      ];

      // 将搜索引擎域名添加到黑名单
      for (const domain of searchEngineDomains) {
        if (!blacklist.includes(domain)) {
          await addToBlacklist(domain);
        }
      }
      localStorage.setItem('blacklistSeededV2', '1');
    }

    // 获取（含种子域名的）黑名单
    const updatedBlacklist = await getBlacklist();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    chrome.history.search({
      text: '',
      startTime: oneMonthAgo.getTime(),
      maxResults: 1000
    }, function (historyItems) {
      const allShortcuts = buildQuickLinks({
        fixedShortcuts,
        blacklist: updatedBlacklist,
        sortedHistory: rankHistoryItems(historyItems, Date.now()),
        maxDisplay: MAX_DISPLAY,
        getSiteName,
        faviconURL,
      });

      renderQuickLinks(allShortcuts, showContextMenu);

      // 冷启动路径此前不写缓存，导致 5 分钟 TTL 缓存永远无效，
      // 每次打开新标签页都要重新检索 1000 条历史
      quickLinksCache.set(allShortcuts);
    });
  }

  // 数据变更后重新生成：先失效缓存，再从 Chrome 数据重建
  function regenerateQuickLinks(): void {
    quickLinksCache.invalidate();
    void generateQuickLinks();
  }

  // 3. 添加后台更新缓存的函数
  async function updateQuickLinksCache() {
    const fixedShortcuts = await getFixedShortcuts();
    // 重新获取更新后的黑名单
    const updatedBlacklist = await getBlacklist();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    chrome.history.search({
      text: '',
      startTime: oneMonthAgo.getTime(),
      maxResults: 1000
    }, function (historyItems) {
      const allShortcuts = buildQuickLinks({
        fixedShortcuts,
        blacklist: updatedBlacklist,
        sortedHistory: rankHistoryItems(historyItems, Date.now()),
        maxDisplay: MAX_DISPLAY,
        getSiteName,
        faviconURL,
      });

      // 更新缓存
      quickLinksCache.set(allShortcuts);
    });
  }

  // 显示上下文菜单
  function showContextMenu(e: MouseEvent, site: QuickLink): void {
    showQuickLinkContextMenu(e, site, {
      editQuickLink,
      addToBlacklistConfirm,
      copyToClipboard: copyQuickLinkToClipboard,
    });
  }

  // 编辑快捷链接
  function editQuickLink(site: QuickLink): void {
    showQuickLinkEditDialog(site, { faviconURL, updateFixedShortcut });
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
    showQuickLinkDeleteDialog(site, {
      addToBlacklist,
      removeFixedShortcut,
      generateQuickLinks: regenerateQuickLinks,
      showToast: showQuickLinkToast,
    });
  }

  function removeFixedShortcut(url: string): void {
    chrome.storage.sync.get('fixedShortcuts', (result) => {
      const shortcuts = parseQuickLinks(result['fixedShortcuts']);
      chrome.storage.sync.set({ fixedShortcuts: shortcuts.filter((shortcut) => shortcut.url !== url) });
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

  // 加载缓存（必须先于 generateQuickLinks：否则缓存检查时数据尚未载入，TTL 缓存永远判定无效）
  quickLinksCache.load();

  // 初始化
  generateQuickLinks();

});
