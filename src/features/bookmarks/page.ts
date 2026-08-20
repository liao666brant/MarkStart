// allow: SIZE_OK — legacy main-page state machine; this task is a mechanical TypeScript migration only.
import { featureTips } from '../onboarding/feature-tips';
import { debounce, throttle } from 'radashi';
import QRCode from 'qrcode';
import Sortable from 'sortablejs';
import { getBookmarksBarId } from './root';
import { pruneDefaultFolders } from './default-folders';
import { initGestureNavigation } from './gesture-navigation';
import {
  getBooleanProperty,
  getDefaultFolders,
  getNumberProperty,
  getOpenMultipleTabsResponse,
  isBookmarkColors,
  isUnknownRecord,
} from './page-parsers';
import type { BookmarkColors } from './page-parsers';
import { getIconHtml, ICONS, replaceIconsWithSvg } from '../../shared/icons';
import { updateBookmarkCard } from './card-update';
import { refreshBookmarkOrder, startPeriodicBookmarkSync } from './order-sync';
import { 
  SearchEngineManager, 
  updateSearchEngineIcon,
  setSearchEngineIcon,
  createSearchEngineDropdown, 
  initializeSearchEngineDialog,
  createTemporarySearchTabs
} from '../search/dropdown';

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;
type ColorCacheEntry = {
  readonly colors: BookmarkColors;
  readonly url: string;
  readonly timestamp: number;
};
type QuickLink = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly icon?: string;
};
type CurrentBookmark = (BookmarkNode | QuickLink) & { readonly type?: string };
type DeleteTarget = {
  readonly type: 'bookmark' | 'quickLink';
  readonly data: CurrentBookmark;
};
type SearchSuggestion = {
  readonly text: string;
  readonly type: 'search' | 'bookmark' | 'history' | 'bing_suggestion';
  readonly url?: string;
  relevance: number;
  readonly timestamp?: number;
  readonly userRelevance?: number;
};
type RecentHistorySuggestion = SearchSuggestion & {
  readonly domain: string;
  readonly url: string;
  readonly timestamp: number;
};
type SearchBehavior = {
  count: number;
  lastUsed: number;
};
type SearchBehaviorMap = Record<string, SearchBehavior>;
type BookmarkDisplay = {
  readonly id: string;
  readonly children?: readonly BookmarkNode[];
};
declare global {
  interface Window {
    updateBookmarksDisplay(parentId: string, movedItemId?: string, newIndex?: number): Promise<void>;
    lastSearchTrigger?: 'cmdCtrlEnter';
  }
}

declare function deleteQuickLink(quickLink: CurrentBookmark): void;
declare function updateContainerHeight(): void;

type ElementConstructor<T extends Element> = new () => T;

function requireElement<T extends Element>(
  element: Element | null,
  constructor: ElementConstructor<T>,
  description: string,
): T {
  if (!(element instanceof constructor)) {
    throw new TypeError(`Missing or invalid ${description}`);
  }
  return element;
}

let bookmarkTreeNodes: BookmarkNode[] = [];
let defaultSearchEngine = 'google';
let contextMenu: HTMLElement | null = null;
let currentBookmark: CurrentBookmark | null = null;

// 使用单一的状态变量
let itemToDelete: DeleteTarget | null = null;

// Define and initialize the variables
let bookmarkFolderContextMenu: HTMLElement | null = null;
let currentBookmarkFolder: HTMLElement | null = null;

// 解决函数未定义错误，将这些函数提升到全局范围
// 创建二维码函数
function createQRCode(url: string, bookmarkName: string) {
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
  title.textContent = getLocalizedMessage('scanQRCode');
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
  copyButton.textContent = getLocalizedMessage('copyLink');
  copyButton.onclick = () => {
    navigator.clipboard.writeText(url).then(() => {
      copyButton.textContent = getLocalizedMessage('copied');
      setTimeout(() => copyButton.textContent = getLocalizedMessage('copyLink'), 2000);
    });
  };

  // 添加下载按钮
  const downloadButton = document.createElement('button');
  downloadButton.textContent = getLocalizedMessage('download');
  downloadButton.onclick = () => {
    // 给 QRCode 生成一些时间
    setTimeout(() => {
      const canvas = qrCodeElement;
      if (canvas) {
        const link = document.createElement('a');
        // 使用书签名称作为文件名，并添加 .png 扩展名
        const fileName = `${bookmarkName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qrcode.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }, 100); // 给予 100ms 的延迟，确保 QR 码已经生成
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

  void QRCode.toCanvas(qrCodeElement, url, { width: 200 }).catch((error) =>
    console.error('Failed to create QR code:', error),
  );

  // 点击模态框外部关闭
  modal.addEventListener('click', function (event) {
    if (event.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// 编辑书签对话框函数
function openEditDialog(bookmark: CurrentBookmark) {
  const bookmarkId = bookmark.id;
  const bookmarkTitle = bookmark.title;
  const bookmarkUrl = bookmark.url ?? '';

  const editNameInput = requireElement(document.getElementById('edit-name'), HTMLInputElement, '#edit-name');
  const editUrlInput = requireElement(document.getElementById('edit-url'), HTMLInputElement, '#edit-url');
  const editDialog = requireElement(document.getElementById('edit-dialog'), HTMLElement, '#edit-dialog');
  const editForm = requireElement(document.getElementById('edit-form'), HTMLFormElement, '#edit-form');
  const cancelButton = requireElement(document.querySelector('.cancel-button'), HTMLElement, '.cancel-button');
  const closeButton = requireElement(document.querySelector('.close-button'), HTMLElement, '.close-button');

  editNameInput.value = bookmarkTitle;
  editUrlInput.value = bookmarkUrl;
  editDialog.style.display = 'block';

  // 设置提交事件
  editForm.onsubmit = function (event) {
    event.preventDefault();
    const newTitle = editNameInput.value;
    const newUrl = editUrlInput.value;
    chrome.bookmarks.update(bookmarkId, { title: newTitle, url: newUrl }, function () {
      if (chrome.runtime.lastError) {
        console.error('Error updating bookmark:', chrome.runtime.lastError);
        return;
      }
      editDialog.style.display = 'none';

      if ('parentId' in bookmark) {
        bookmarksCache.delete(bookmark.parentId);
      }
      updateBookmarkCard(bookmarkId, newTitle, newUrl, { getColors, applyColors });
    });
  };

  // 添加取消按钮的事件监听
  cancelButton.addEventListener('click', function () {
    editDialog.style.display = 'none';
  });

  // 添加关闭按钮的事件监听
  closeButton.addEventListener('click', function () {
    editDialog.style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', function () {
  // 应用保存的书签卡片高度设置
  chrome.storage.sync.get('bookmarkCardHeight', (rawResult: unknown) => {
    const bookmarkCardHeight = getNumberProperty(rawResult, 'bookmarkCardHeight');
    if (bookmarkCardHeight) {
      // 创建或更新自定义样式
      let styleElement = document.getElementById('custom-card-height');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'custom-card-height';
        document.head.appendChild(styleElement);
      }
      
      // 设置卡片高度
      styleElement.textContent = `
        .card {
          height: ${bookmarkCardHeight}px !important;
        }
      `;
    }
  });

  // 初始化手势导航，传入 updateBookmarksDisplay 函数
  initGestureNavigation(updateBookmarksDisplay);
   // 初始化功能提示
  featureTips.initAllTips();
  // 替换所有图标
  replaceIconsWithSvg();

  // 或者在动态创建元素时使用
  const button = document.createElement('button');
  button.innerHTML = getIconHtml('settings') + ' Settings';

  // 更新这部分代码
  updateSearchEngineIcon(defaultSearchEngine);

  const searchEngineIcon = document.getElementById('search-engine-icon');
  if (searchEngineIcon instanceof HTMLImageElement && searchEngineIcon.src === '') {
    searchEngineIcon.src = '../images/placeholder-icon.svg';
  }
});

function getLocalizedMessage(messageName: string) {
  const message = chrome.i18n.getMessage(messageName);
  return message || messageName;
}

// Define the context menu creation function
function createContextMenu() {
  console.log('Creating context menu');

  // 移除任何已存在的上下文菜单
  const existingMenu = document.querySelector<HTMLElement>('.custom-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  const menu = document.createElement('div');
  menu.className = 'custom-context-menu';
  document.body.appendChild(menu);

  const menuItems = [
    { text: getLocalizedMessage('openInNewTab'), icon: 'open_in_new', action: () => currentBookmark?.url && window.open(currentBookmark.url, '_blank') },
    { text: getLocalizedMessage('openInNewWindow'), icon: 'launch', action: () => currentBookmark?.url && openInNewWindow(currentBookmark.url) },
    { text: getLocalizedMessage('openInIncognito'), icon: 'visibility_off', action: () => currentBookmark?.url && openInIncognito(currentBookmark.url) },
    { text: getLocalizedMessage('editQuickLink'), icon: 'edit', action: () => currentBookmark && openEditDialog(currentBookmark) },
    { 
      text: getLocalizedMessage('deleteQuickLink'), 
      icon: 'delete', 
      action: () => {
        console.log('Delete action triggered. Current item:', currentBookmark);
        
        if (!currentBookmark) {
          console.error('No item selected for deletion');
          return;
        }

        itemToDelete = {
          type: currentBookmark.type === 'quickLink' ? 'quickLink' : 'bookmark',
          data: {
            id: currentBookmark.id,
            title: currentBookmark.title,
            url: currentBookmark.url ?? ''
          }
        };
        
        console.log('Set itemToDelete:', itemToDelete);
        
        const message = itemToDelete.type === 'quickLink' 
          ? chrome.i18n.getMessage("confirmDeleteQuickLink", [`<strong>${itemToDelete.data.title}</strong>`])
          : chrome.i18n.getMessage("confirmDeleteBookmark", [`<strong>${itemToDelete.data.title}</strong>`]);
        
        showConfirmDialog(message, () => {
          if (itemToDelete && itemToDelete.data) {
            if (itemToDelete.type === 'quickLink') {
              deleteQuickLink(itemToDelete.data);
            } else {
              deleteBookmark(itemToDelete.data.id, itemToDelete.data.title);
            }
          }
        });
      }
    },
    { text: getLocalizedMessage('copyLink'), icon: 'content_copy', action: () => currentBookmark && Utilities.copyBookmarkLink(currentBookmark) },
    { text: getLocalizedMessage('createQRCode'), icon: 'qr_code', action: () => currentBookmark?.url && createQRCode(currentBookmark.url, currentBookmark.title) }
  ];

  menuItems.forEach((item, index) => {
    // 在特定位置添加分隔线
    if (index === 3 || index === 5) {
      const divider = document.createElement('div');
      divider.className = 'custom-context-menu-divider';
      menu.appendChild(divider);
    }
    
    const menuItem = document.createElement('div');
    menuItem.className = 'custom-context-menu-item';
    
    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.innerHTML = getIconHtml(item.icon);
    icon.style.marginRight = '8px';
    icon.style.fontSize = '18px';
    
    const text = document.createElement('span');
    text.textContent = item.text;

    menuItem.appendChild(icon);
    menuItem.appendChild(text);

    menuItem.addEventListener('click', () => {
      if (typeof item.action === 'function') {
        item.action();
      }
      menu.style.display = 'none';
    });

    menu.appendChild(menuItem);
  });

  return menu;
}

// 在文件顶部添加这个函数
function applyBackgroundColor() {
    const savedBg = localStorage.getItem('selectedBackground');
    if (savedBg) {
        const useDefaultBackground = localStorage.getItem('useDefaultBackground');
        
        if (useDefaultBackground !== 'true') {
            document.querySelectorAll<HTMLElement>('.settings-bg-option').forEach(option => {
                option.classList.remove('active');
            });
            return;
        }
        
        document.documentElement.className = savedBg;
        
        // 使用 WelcomeManager 更新欢迎消息颜色
        const welcomeElement = document.getElementById('welcome-message');
        if (welcomeElement && window.WelcomeManager) {
            window.WelcomeManager.adjustTextColor(welcomeElement);
        }
    }
}

// 立即调用这个函数
applyBackgroundColor();

// 添加颜色缓存管理器
const ColorCache = {
  data: new Map<string, ColorCacheEntry>(),
  maxSize: 2000, // 最多缓存500个书签的颜色
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7天过期
  storageKey: 'bookmark-colors-v2', // 新的存储键，避免与旧数据冲突

  // 初始化缓存
  init() {
    try {
      // 从 localStorage 加载缓存数据
      const cached = localStorage.getItem(this.storageKey);
      if (cached) {
        const parsedData = JSON.parse(cached);
        if (typeof parsedData !== 'object' || parsedData === null) return;
        Object.entries(parsedData).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null &&
              'timestamp' in value && typeof value.timestamp === 'number' &&
              'url' in value && typeof value.url === 'string' &&
              'colors' in value && isBookmarkColors(value.colors) &&
              Date.now() - value.timestamp < this.maxAge) {
            this.data.set(key, { timestamp: value.timestamp, url: value.url, colors: value.colors });
          }
        });
      }
    } catch (error) {
      console.error('Error initializing color cache:', error instanceof Error ? error : String(error));
      this.clear();
    }
  },

  // 获取颜色
  get(bookmarkId: string, url: string) {
    const cached = this.data.get(bookmarkId);
    if (!cached) return null;

    // 检查URL是否变化和过期时间
    if (cached.url !== url || Date.now() - cached.timestamp > this.maxAge) {
      this.data.delete(bookmarkId);
      return null;
    }

    return cached.colors;
  },

  // 设置颜色
  set(bookmarkId: string, url: string, colors: BookmarkColors) {
    // 如果缓存即将超出限制，清理旧数据
    if (this.data.size >= this.maxSize) {
      this.cleanup();
    }

    this.data.set(bookmarkId, {
      colors,
      url,
      timestamp: Date.now()
    });

    // 异步保存到 localStorage
    this.scheduleSave();
  },

  // 清理过期和多余的缓存
  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.data.entries());

    // 删除过期项
    entries.forEach(([key, value]) => {
      if (now - value.timestamp > this.maxAge) {
        this.data.delete(key);
      }
    });

    // 如果仍然超出限制，删除最旧的项
    if (this.data.size >= this.maxSize) {
      const sortedEntries = Array.from(this.data.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const deleteCount = Math.floor(this.data.size * 0.2);
      sortedEntries.slice(0, deleteCount).forEach(([key]) => {
        this.data.delete(key);
      });
    }
  },

  // 清除所有缓存
  clear() {
    this.data.clear();
    localStorage.removeItem(this.storageKey);
  },

  // 使用防抖保存到 localStorage
  scheduleSave: debounce({ delay: 1000 }, () => {
    try {
      const dataToSave = Object.fromEntries(ColorCache.data);
      localStorage.setItem(ColorCache.storageKey, JSON.stringify(dataToSave));
    } catch {
      // 如果存储失败（比如超出配额），清理一半的缓存后重试
      const entries = Array.from(ColorCache.data.entries());
      entries.slice(0, Math.floor(entries.length / 2)).forEach(([key]) => {
        ColorCache.data.delete(key);
      });
      ColorCache.scheduleSave();
    }
  })
};



// 页面加载时更新图标
document.addEventListener('DOMContentLoaded', () => {
  const defaultEngine = SearchEngineManager.getDefaultEngine();
  if (defaultEngine) {
    updateSearchEngineIcon(defaultEngine);
  }
});

// 同样，将这个函数也移到全作用域


// 1. 首先定义全局变量
let bookmarksList: HTMLElement;
let itemHeight = 120;
let bufferSize = 5;
let visibleItems: number;
let allBookmarks: BookmarkNode[] = [];
  void allBookmarks;
let renderTimeout: number | null = null;
let scrollHandler: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

// 2. 定义主要的虚拟滚动函数
function initVirtualScroll() {
  bookmarksList = requireElement(document.getElementById('bookmarks-list'), HTMLElement, '#bookmarks-list');

  visibleItems = Math.ceil(window.innerHeight / itemHeight) + 2 * bufferSize;

  // 渲染函数
  function renderVisibleBookmarks() {
    if (!bookmarksList) return;
    // ... 保持原有的 renderVisibleBookmarks 实现 ...
  }

  // 滚动处理函数
  const handleScroll = throttle({ interval: 16, trailing: true }, () => {
    if (renderTimeout) {
      cancelAnimationFrame(renderTimeout);
    }
    renderTimeout = requestAnimationFrame(renderVisibleBookmarks);
  });

  // 窗口大小变化处理函数
  function handleResize() {
    const newVisibleItems = Math.ceil(window.innerHeight / itemHeight) + 2 * bufferSize;
    if (newVisibleItems !== visibleItems) {
      visibleItems = newVisibleItems;
      renderVisibleBookmarks();
    }
  }

  // 清理函数
  function cleanup() {
    if (scrollHandler) {
      bookmarksList.removeEventListener('scroll', scrollHandler);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (renderTimeout) {
      cancelAnimationFrame(renderTimeout);
    }
    allBookmarks = [];
  }

  // 初始化事件监听
  function initializeListeners() {
    cleanup(); // 清理旧的监听器

    scrollHandler = handleScroll;
    bookmarksList.addEventListener('scroll', scrollHandler, { passive: true });

    // 确保 handleResize 在正确的作用域内
    const boundHandleResize = handleResize;
    resizeObserver = new ResizeObserver(debounce({ delay: 100 }, boundHandleResize));
    resizeObserver.observe(bookmarksList);
  }

  // 更新书签显示
  window.updateBookmarksDisplay = function(parentId: string, _movedItemId?: string, _newIndex?: number) {
    return new Promise<void>((resolve, reject) => {
      chrome.bookmarks.getChildren(parentId, (bookmarks) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        cleanup();
        allBookmarks = bookmarks;
        
        updateContainerHeight();
        updateFolderName(parentId);
        renderVisibleBookmarks();
        
        bookmarksList.dataset["parentId"] = parentId;
        initializeListeners();
        
        resolve();
      });
    });
  };

  // 初始化
  initializeListeners();
}

// 3. 合并 DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', function() {
  // 初始化虚拟滚动
  initVirtualScroll();
  
  // 初始化滚动指示器
  initScrollIndicator();
  
  // 其他初始化代码...
  startPeriodicSync();
  setupSpecialLinks();
  console.log('[Init] Starting initialization...');

  // 只调用一次搜索引擎初始化
  createSearchEngineDropdown();
  initializeSearchEngineDialog();

 

  // 加载保存的背景颜色
  const savedBg = localStorage.getItem('selectedBackground');
  const useDefaultBackground = localStorage.getItem('useDefaultBackground');
  const hasWallpaper = localStorage.getItem('originalWallpaper');

  console.log('[Background] Initial load state:', {
    savedBg,
    useDefaultBackground,
    hasWallpaper
  });

  // 清除所有选项的 active 状态
  document.querySelectorAll<HTMLElement>('.settings-bg-option').forEach(opt => {
    opt.classList.remove('active');
  });

  if (savedBg) {
    if (useDefaultBackground === 'true') {
      console.log('[Background] Activating saved background color:', savedBg);
      document.documentElement.className = savedBg;
      const activeOption = document.querySelector<HTMLElement>(`[data-bg="${savedBg}"]`);
      if (activeOption) {
        activeOption.classList.add('active');
      }
    } else if (hasWallpaper) {
      console.log('[Background] Wallpaper is active, keeping background options unselected');
    }
  } else {
    console.log('[Background] No saved background, checking wallpaper state');
    if (!hasWallpaper && useDefaultBackground !== 'false') {
      console.log('[Background] No wallpaper, using default background');
      document.documentElement.className = 'gradient-background-7';
      const defaultOption = document.querySelector<HTMLElement>('[data-bg="gradient-background-7"]');
      if (defaultOption) {
        defaultOption.classList.add('active');
      }
    } else {
      console.log('[Background] Wallpaper exists, skipping default background');
      document.documentElement.className = '';
    }
  }

  // 如果有壁纸，激活对应的壁纸选项
  if (hasWallpaper) {
    const wallpaperOption = document.querySelector<HTMLElement>(`.wallpaper-option[data-wallpaper-url="${hasWallpaper}"]`);
    if (wallpaperOption) {
      console.log('[Background] Activating wallpaper option');
      wallpaperOption.classList.add('active');
    }
  }

  // 背景选项点击事件
  const bgOptions = document.querySelectorAll<HTMLElement>('.settings-bg-option');
  bgOptions.forEach(option => {
    option.addEventListener('click', function() {
      const bgClass = this.getAttribute('data-bg') ?? '';
      console.log('[Background] Color option clicked:', {
        bgClass,
        previousBackground: document.documentElement.className,
        previousWallpaper: localStorage.getItem('originalWallpaper')
      });

      // 移除所有背景选项的 active 状态
      bgOptions.forEach(opt => {
        opt.classList.remove('active');
        console.log('[Background] Removing active state from:', opt.getAttribute('data-bg'));
      });
      
      // 添加当前选项的 active 状态
      this.classList.add('active');
      console.log('[Background] Setting active state for:', bgClass);
      
      document.documentElement.className = bgClass;
      localStorage.setItem('selectedBackground', bgClass);
      localStorage.setItem('useDefaultBackground', 'true');
      
      // 清除壁纸相关的状态
      document.querySelectorAll<HTMLElement>('.wallpaper-option').forEach(opt => {
        opt.classList.remove('active');
      });

      // 清除壁纸
      const mainElement = document.querySelector<HTMLElement>('main');
      if (mainElement) {
        mainElement.style.backgroundImage = 'none';
        document.body.style.backgroundImage = 'none';
        console.log('[Background] Cleared wallpaper');
      }
      localStorage.removeItem('originalWallpaper');

      // 使用 WelcomeManager 更新欢迎消息颜色
      const welcomeElement = document.getElementById('welcome-message');
      if (welcomeElement && window.WelcomeManager) {
        window.WelcomeManager.adjustTextColor(welcomeElement);
      }
    });
  });

  // 监听主题变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        // 当背景类发生变化时，调整文字颜色
        requestAnimationFrame(() => {
          const welcomeElement = document.getElementById('welcome-message');
          if (welcomeElement && window.WelcomeManager) {
            window.WelcomeManager.adjustTextColor(welcomeElement);
          }
        });
      }
    });
  });

  // 开始观察 documentElement 的 class 变化
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  // 初始化快捷链接显示状态
  chrome.storage.sync.get(['enableQuickLinks'], function(rawResult: unknown) {
    const enableQuickLinks = getBooleanProperty(rawResult, 'enableQuickLinks');
    const quickLinksWrapper = document.querySelector<HTMLElement>('.quick-links-wrapper');
    if (quickLinksWrapper) {
      quickLinksWrapper.style.display = enableQuickLinks !== false ? 'flex' : 'none';
    }
  });

  // 应用保存的书签宽度设置
  chrome.storage.sync.get(['bookmarkWidth'], (rawResult: unknown) => {
    const savedWidth = getNumberProperty(rawResult, 'bookmarkWidth') || 190;
    const bookmarksList = document.getElementById('bookmarks-list');
    if (bookmarksList) {
      bookmarksList.style.gridTemplateColumns = `repeat(auto-fill, minmax(${savedWidth}px, 1fr))`;
    }
  });

  // 应用保存的书签容器宽度设置
  chrome.storage.sync.get(['bookmarkContainerWidth'], (rawResult: unknown) => {
    const savedWidth = getNumberProperty(rawResult, 'bookmarkContainerWidth') || 85; // 默认85%
    const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
    if (bookmarksContainer) {
      bookmarksContainer.style.width = `${savedWidth}%`;
    }
  });

  // 应用保存的界面元素显示设置
  chrome.storage.sync.get(
    [
      'showSearchBox', 
      'showWelcomeMessage', 
      'showFooter',
      'showHistoryLink',
      'showDownloadsLink',
      'showPasswordsLink',
      'showExtensionsLink'
    ], 
    (rawResult: unknown) => {
      const showSearchBox = getBooleanProperty(rawResult, 'showSearchBox');
      const showWelcomeMessage = getBooleanProperty(rawResult, 'showWelcomeMessage');
      const showFooter = getBooleanProperty(rawResult, 'showFooter');
      const showHistoryLink = getBooleanProperty(rawResult, 'showHistoryLink');
      const showDownloadsLink = getBooleanProperty(rawResult, 'showDownloadsLink');
      const showPasswordsLink = getBooleanProperty(rawResult, 'showPasswordsLink');
      const showExtensionsLink = getBooleanProperty(rawResult, 'showExtensionsLink');
      // 应用搜索框显示设置 - 修改为默认隐藏
      const searchContainer = document.querySelector<HTMLElement>('.search-container');
      if (searchContainer) {
        searchContainer.style.display = showSearchBox === true ? '' : 'none';
      }
      
      // 应用欢迎语显示设置
      const welcomeMessage = document.getElementById('welcome-message');
      if (welcomeMessage) {
        // 先移除初始的 visibility: hidden
        welcomeMessage.style.visibility = 'visible';
        // 然后根据设置决定是否显示
        welcomeMessage.style.display = showWelcomeMessage !== false ? '' : 'none';
      }
      
      // 应用页脚显示设置
      const footer = document.querySelector<HTMLElement>('footer');
      if (footer) {
        footer.style.display = showFooter !== false ? '' : 'none';
      }
      
      // 应用快捷链接图标显示设置
      const toggleElementVisibility = (selector: string, isVisible: boolean) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (element) {
          element.style.display = isVisible ? '' : 'none';
        }
      };
      
      toggleElementVisibility('#history-link', showHistoryLink !== false);
      toggleElementVisibility('#downloads-link', showDownloadsLink !== false);
      toggleElementVisibility('#passwords-link', showPasswordsLink !== false);
      toggleElementVisibility('#extensions-link', showExtensionsLink !== false);
      
      // 检查是否所有链接都被隐藏
      const linksContainer = document.querySelector<HTMLElement>('.links-icons');
      if (linksContainer) {
        const allLinksHidden = 
          showHistoryLink === false &&
          showDownloadsLink === false &&
          showPasswordsLink === false &&
          showExtensionsLink === false;
        
        linksContainer.style.display = allLinksHidden ? 'none' : '';
      }
    }
  );
});

// 修改书签缓存对象的定义
const bookmarksCache = {
  data: new Map<string, { timestamp: number; bookmarks: readonly BookmarkNode[] }>(),
  maxSize: 100, // 最大缓存条目数
  maxAge: 5 * 60 * 1000, // 5分钟缓存

  set(parentId: string, bookmarks: readonly BookmarkNode[]) {
    // 如果缓存即将超出限制，清理最旧的数据
    if (this.data.size >= this.maxSize) {
      this.cleanup();
    }

    this.data.set(parentId, {
      timestamp: Date.now(),
      bookmarks: bookmarks
    });
  },

  get(parentId: string) {
    const cached = this.data.get(parentId);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.maxAge) {
      this.data.delete(parentId);
      return null;
    }

    return cached;
  },

  // 添加 delete 方法
  delete(parentId: string) {
    return this.data.delete(parentId);
  },

  // 添加清除方法
  clear() {
    this.data.clear();
  },

  // 清理过期和最少使用缓存
  cleanup() {
    const now = Date.now();
      void now;
    const entries = Array.from(this.data.entries());

    // 按最后访问时间排序
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 删除最旧的 20% 缓存
    const deleteCount = Math.floor(entries.length * 0.2);
    entries.slice(0, deleteCount).forEach(([key]) => {
      this.data.delete(key);
    });
  }
};

async function updateBookmarkCards() {
  const bookmarksList = requireElement(document.getElementById('bookmarks-list'), HTMLElement, '#bookmarks-list');
  const defaultBookmarkId = localStorage.getItem('defaultBookmarkId');
  let parentId = defaultBookmarkId || bookmarksList.dataset["parentId"];

  if (!parentId) {
    parentId = await getBookmarksBarId(chrome.bookmarks);
  }

  let bookmarks: BookmarkNode[];
  try {
    bookmarks = await chrome.bookmarks.getChildren(parentId);
  } catch {
    parentId = await getBookmarksBarId(chrome.bookmarks);
    bookmarks = await chrome.bookmarks.getChildren(parentId);
  }

  displayBookmarks({ id: parentId, children: bookmarks });

  // 在显示书签后更新默认书签指示器
  updateDefaultBookmarkIndicator();
  updateSidebarDefaultBookmarkIndicator();

  // 更新 bookmarks-list 的 data-parent-id
  bookmarksList.dataset["parentId"] = parentId;
}

document.addEventListener('DOMContentLoaded', function () {
  // Create context menu immediately when the document loads
  contextMenu = createContextMenu();
  
  const searchEngineIcon = document.getElementById('search-engine-icon');
  const defaultSearchEngine = localStorage.getItem('selectedSearchEngine') || 'google';
  console.log('[Init] Default search engine:', localStorage.getItem('selectedSearchEngine'));
  let deletedBookmark = null;
    void deletedBookmark;
  let deletedCategory = null; // 添加这行
    void deletedCategory;
  let deleteTimeout = null;
    void deleteTimeout;
  let bookmarkTreeNodes: BookmarkNode[] = []; // 定义全局变量
    void bookmarkTreeNodes;
  // 调用 updateBookmarkCards
  updateBookmarkCards().catch(error => {
    console.error('Error updating bookmark cards:', error);
  });
  
  updateSearchEngineIcon(defaultSearchEngine);

  if (searchEngineIcon instanceof HTMLImageElement && searchEngineIcon.src === '') {
    searchEngineIcon.src = '../images/placeholder-icon.svg';
  }
  setTimeout(() => {
    updateSearchEngineIcon(defaultSearchEngine);
  }, 0);

  // 修改 updateSearchEngineIcon 函数
  function updateSearchEngineIcon(engineName: string) {
    setSearchEngineIcon(engineName);
  }

  // 更新侧边栏默认书签指示器和选中状态
  updateSidebarDefaultBookmarkIndicator();

  // ... 其他代码 ...

  


  
  // 优化后的更新显示函数


  // 添加分页控制
  // 化书顺序步


  // 修改右键菜单事件监听器
  document.addEventListener('contextmenu', async function (event) {
    if (!(event.target instanceof Element)) return;
    const targetFolder = event.target.closest<HTMLElement>('.bookmark-folder');

    if (targetFolder) {
      event.preventDefault();
      event.stopPropagation(); // 阻止事件冒泡
      
      // 确保文件夹上下文菜单存在
      if (!bookmarkFolderContextMenu) {
        bookmarkFolderContextMenu = createBookmarkFolderContextMenu();
      }

      if (!bookmarkFolderContextMenu) {
        console.error('Failed to create bookmark folder context menu');
        return;
      }

      // 更新当前文件夹
      const oldFolder = currentBookmarkFolder;
        void oldFolder;
      currentBookmarkFolder = targetFolder;
      
      // 重新创建菜单项
      await createMenuItems(bookmarkFolderContextMenu);
      
      // 先显示菜单但设为不可见，以便获取其尺寸
      bookmarkFolderContextMenu.style.display = 'block';
      bookmarkFolderContextMenu.style.visibility = 'hidden';
      bookmarkFolderContextMenu.style.left = '0';
      bookmarkFolderContextMenu.style.top = '0';
      
      // 获取视窗尺寸
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // 等待一下以确保菜单已渲染
      const activeFolderMenu = bookmarkFolderContextMenu;
      setTimeout(() => {
        const menuRect = activeFolderMenu.getBoundingClientRect();
        
        // 计算最佳位置
        let left = event.clientX;
        let top = event.clientY;
        
        // 检查右侧空间
        if (left + menuRect.width > viewportWidth) {
          // 如果右侧空间不足，尝试将菜单放在点击位置的左侧
          left = Math.max(5, left - menuRect.width);
        }
        
        // 检查底部空间
        if (top + menuRect.height > viewportHeight) {
          // 如果底部空间不足，尝试将菜单放在点击位置的上方
          top = Math.max(5, viewportHeight - menuRect.height - 5);
        }
        
        // 应用计算后的位置
        activeFolderMenu.style.left = `${left}px`;
        activeFolderMenu.style.top = `${top}px`;
        
        // 使菜单可见
        activeFolderMenu.style.visibility = 'visible';
      }, 0);

      // 隐藏其他上下文菜单
      if (contextMenu) {
        contextMenu.style.display = 'none';
      }
    }
  });

  // 修改文档点击事件，确保正确关闭菜单
  document.addEventListener('click', function(event) {
    // 如果点击的不是菜单本身，则关闭菜单
    if (bookmarkFolderContextMenu && 
        !(event.target instanceof Node && bookmarkFolderContextMenu.contains(event.target)) &&
        !(event.target instanceof Element && event.target.closest('.bookmark-folder'))) {
      bookmarkFolderContextMenu.style.display = 'none';
      currentBookmarkFolder = null; // 重置当前文件夹
    }
  });

  // 为菜单本身添加点击事件处理
  if (bookmarkFolderContextMenu) {
    bookmarkFolderContextMenu.addEventListener('click', function(event) {
      event.stopPropagation(); // 阻止事件冒泡到文档
    });
  }

  // 在点击其他地方时重置状态
  document.addEventListener('click', function () {
    // 延迟处理点击事件，让菜单项的点击事件先执行
    setTimeout(() => {
    if (contextMenu) {
      contextMenu.style.display = 'none';
        currentBookmark = null;
      }
      
      if (bookmarkFolderContextMenu) {
        bookmarkFolderContextMenu.style.display = 'none';
        currentBookmarkFolder = null;
      }
    }, 200);
  });
});

function showMovingFeedback(element: HTMLElement) {
  element.style.opacity = '0.5';
}

function hideMovingFeedback(element: HTMLElement) {
  element.style.opacity = '1';
}

function showSuccessFeedback(element: HTMLElement) {
  element.style.backgroundColor = '#e6ffe6';
  setTimeout(() => {
    element.style.backgroundColor = '';
  }, 1000);
}

function showErrorFeedback(element: HTMLElement) {
  element.style.backgroundColor = '#ffe6e6';
  setTimeout(() => {
    element.style.backgroundColor = '';
  }, 1000);
}


// 移除所有 defaultBookmarkId 相关的代码
// 修改 waitForFirstCategory 函数
async function waitForFirstCategory(attemptsLeft = 5) {
  try {
    // 1. 先隐藏书签列表，避免闪烁
    const bookmarksList = document.getElementById('bookmarks-list');
    const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
    if (bookmarksList && bookmarksContainer) {
      bookmarksContainer.style.opacity = '0';
      bookmarksContainer.style.transition = 'opacity 0.3s ease';
    }

    // 2. 尝试获取上次访问的文件夹
    const { lastViewedFolder } = await chrome.storage.local.get('lastViewedFolder');

    if (typeof lastViewedFolder === 'string') {
      try {
        const results = await chrome.bookmarks.get(lastViewedFolder);
        if (results && results.length > 0) {
          await updateBookmarksDisplay(lastViewedFolder);
          updateFolderName(lastViewedFolder);
          selectSidebarFolder(lastViewedFolder);
          // 显示内容
          if (bookmarksContainer) bookmarksContainer.style.opacity = '1';
          return;
        }
      } catch { // no-excuse-ok: catch
        await chrome.storage.local.remove('lastViewedFolder');
      }
    }

    // 3. 尝试使用用户设置的默认文件夹
    const defaultFolders = await pruneDefaultFolders(chrome.bookmarks, chrome.storage);
    const firstDefaultFolder = defaultFolders[0];
    if (firstDefaultFolder) {
      const defaultFolderId = firstDefaultFolder.id;
      try {
        const results = await chrome.bookmarks.get(defaultFolderId);
        if (results && results.length > 0) {
          await updateBookmarksDisplay(defaultFolderId);
          updateFolderName(defaultFolderId);
          selectSidebarFolder(defaultFolderId);
          // 显示内容
          if (bookmarksContainer) bookmarksContainer.style.opacity = '1';
          return;
        }
      } catch (error) {
        if (error instanceof Error) void error;
        // The folder was removed after the default-folder list was validated.
      }
    }

    // 4. 兜底方案：使用实际存在的书签栏目录
    await showBookmarksBar();
    // 显示内容
    if (bookmarksContainer) bookmarksContainer.style.opacity = '1';

  } catch (error) {
    console.error('Error in waitForFirstCategory:', error instanceof Error ? error : String(error));
    if (attemptsLeft > 0) {
      setTimeout(() => {
        waitForFirstCategory(attemptsLeft - 1).catch(error => {
          console.error('Error retrying first category:', error);
        });
      }, 1000);
    } else {
      // 重试次数用完，使用实际存在的书签栏目录
      await showBookmarksBar();
      // 显示内容
      const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
      if (bookmarksContainer) {
        bookmarksContainer.style.opacity = '1';
      }
    }
  }
}

async function showBookmarksBar() {
  const folderId = await getBookmarksBarId(chrome.bookmarks);
  await updateBookmarksDisplay(folderId);
  updateFolderName(folderId);
  selectSidebarFolder(folderId);
}

// 修改 initDefaultFoldersTabs 函数
async function initDefaultFoldersTabs() {
  const tabsContainer = document.querySelector<HTMLElement>('.tabs-container');
  const defaultFoldersTabs = document.querySelector<HTMLElement>('.default-folders-tabs');
  
  if (!tabsContainer || !defaultFoldersTabs) {
    console.error('Tabs container not found');
    return;
  }

  // 获取默认文件夹列表
  const [{ lastViewedFolder }, folders] = await Promise.all([
    chrome.storage.local.get('lastViewedFolder'),
    pruneDefaultFolders(chrome.bookmarks, chrome.storage),
  ]);
  let defaultFolders = folders;
  
  // 确保文件夹按 order 排序
  defaultFolders = defaultFolders.sort((a, b) => a.order - b.order);
  
  console.log('Initializing default folders tabs:', defaultFolders);

  // 清空现有标签
  tabsContainer.innerHTML = '';

  // 创建标签
  for (const folder of defaultFolders) {
    const tab = document.createElement('div');
    tab.className = 'folder-tab';
    tab.dataset["folderId"] = folder.id;
    tab.dataset["order"] = folder.order.toString();
    tab.dataset["name"] = folder.name;
    tab.addEventListener('click', () => switchToFolder(folder.id));
    tabsContainer.appendChild(tab);
  }

  // 只调用一次更新书签树
  chrome.bookmarks.getTree(function (nodes) {
    bookmarkTreeNodes = nodes;
    displayBookmarkCategories(bookmarkTreeNodes[0]?.children ?? [], 0, null, '1');
  });

  // 如果有默认文件夹，激活第一个或上次访问的文件夹
  if (defaultFolders.length > 0) {
    let folderToActivate: string;

    // 检查上次访问的文件夹是否在默认文件夹列表中
    if (typeof lastViewedFolder === 'string' && defaultFolders.some(f => f.id === lastViewedFolder)) {
      folderToActivate = lastViewedFolder;
    } else {
      // 否则使用第一个默认文件夹
      folderToActivate = defaultFolders[0]?.id ?? await getBookmarksBarId(chrome.bookmarks);
    }

    // 激活选中的文件夹
    const activeTab = document.querySelector<HTMLElement>(`.folder-tab[data-folder-id="${folderToActivate}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
      activeTab.style.transform = 'scale(1.2)';
    }

    // 切换到选中的文件夹
    await switchToFolder(folderToActivate);
  } else {
    // 当没有默认文件夹时，切换到根文件夹或其他指定文件夹
    await switchToFolder(await getBookmarksBarId(chrome.bookmarks));
  }

  // 重新初始化滚轮切换功能
  initWheelSwitching();

  // 更新显示状态
  updateDefaultFoldersTabsVisibility();

  return defaultFolders;
}

// 修改滚轮切换功能的实现
function initWheelSwitching() {
  const main = document.querySelector<HTMLElement>('main');
  if (!main) return;

  let wheelTimeout: ReturnType<typeof setTimeout> | undefined;
  let isProcessing = false;
  let wheelEventListener: ((event: WheelEvent) => void) | null = null;
  let isEnabled = false; // 默认禁用

  // 创建滚轮事件处理函数
  const wheelHandler = async (event: WheelEvent) => {
    // 如果功能被禁用，直接返回
    if (!isEnabled) return;

    // 检查是否在搜索相关元素内滚动
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#bookmarks-list') || 
        event.target.closest('.search-form') || 
        event.target.closest('.search-suggestions') ||
        event.target.closest('.search-suggestions-wrapper')) {
      return;
    }

    // 防止重复触发
    if (isProcessing) return;

    // 防抖处理
    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(async () => {
      isProcessing = true;

      try {
        const data = await chrome.storage.local.get('defaultFolders');
        const defaultFolders = getDefaultFolders(data["defaultFolders"]);
        if (defaultFolders.length <= 1) {
          isProcessing = false;
          return;
        }

        // 获取当前激活的标签
        const activeTab = document.querySelector<HTMLElement>('.folder-tab.active');
        if (!activeTab) {
          isProcessing = false;
          return;
        }

        const currentOrder = parseInt(activeTab.dataset["order"] ?? '0');
        let nextOrder;

        // 根据滚动方向决定下一个标签
        if (event.deltaY > 0) { // 向下滚动
          nextOrder = currentOrder + 1;
          if (nextOrder >= defaultFolders.length) {
            nextOrder = 0;
          }
        } else { // 向上滚动
          nextOrder = currentOrder - 1;
          if (nextOrder < 0) {
            nextOrder = defaultFolders.length - 1;
          }
        }

        // 找到对应顺序的文件夹并切换
        const nextFolder = defaultFolders.find(f => f.order === nextOrder);
        if (nextFolder) {
          await switchToFolder(nextFolder.id);
          
          // 添加切换动画效果
          const tabs = document.querySelectorAll<HTMLElement>('.folder-tab');
          tabs.forEach(tab => {
            if (tab.dataset["folderId"] === nextFolder.id) {
              tab.classList.add('switching');
              tab.style.transform = 'scale(1.2)';
              setTimeout(() => {
                tab.classList.remove('switching');
              }, 1500);
            } else {
              tab.style.transform = 'scale(1)';
            }
          });
        }
      } catch (error) {
        console.error('Error in wheel switching:', error instanceof Error ? error : String(error));
      } finally {
        // 设置一个短暂的冷却时间
        setTimeout(() => {
          isProcessing = false;
        }, 150);
      }
    }, 50); // 50ms 的防抖延迟
  };
  
  // 添加或移除事件监听器的函数
  const updateWheelListener = (enabled: boolean) => {
    if (enabled) {
      if (!wheelEventListener) {
        main.addEventListener('wheel', wheelHandler, { passive: true });
        wheelEventListener = wheelHandler;
      }
    } else {
      if (wheelEventListener) {
        main.removeEventListener('wheel', wheelEventListener);
        wheelEventListener = null;
      }
    }
  };
  
  // 检查设置并初始化
  chrome.storage.sync.get({ enableWheelSwitching: false }, (rawResult: unknown) => {
    isEnabled = getBooleanProperty(rawResult, 'enableWheelSwitching') === true;
    updateWheelListener(isEnabled);
  });
  
  // 监听设置变化
  document.addEventListener('wheelSwitchingChanged', (event) => {
    if (!(event instanceof CustomEvent)) return;
    const enabled = getBooleanProperty(event.detail, 'enabled');
    if (enabled === undefined) return;
    isEnabled = enabled;
    updateWheelListener(isEnabled);
  });
}

// 修改文件夹切换函数，确保同步更新所有状态
async function switchToFolder(folderId: string) {
  try {
    console.log('Switching to folder:', folderId);
    
    // 验证文件夹是否存在
    const results = await chrome.bookmarks.get(folderId);
    if (!results || results.length === 0) {
      throw new Error('Folder not found');
    }

    // 更新UI状态
    document.querySelectorAll<HTMLElement>('.folder-tab').forEach(tab => {
      const isActive = tab.dataset["folderId"] === folderId;
      tab.classList.toggle('active', isActive);
      tab.style.transform = isActive ? 'scale(1.2)' : 'scale(1)';
      tab.style.transition = 'transform 0.3s ease';
    });

    // 同步更新所有状态
    await Promise.all([
      updateBookmarksDisplay(folderId),
      updateFolderName(folderId),
      selectSidebarFolder(folderId)
    ]);

    // 保存最后访问的文件夹
    await chrome.storage.local.set({ 
      lastViewedFolder: folderId,
      lastViewedTime: Date.now()
    });
    
  } catch (error) {
    console.error('Error switching folder:', error instanceof Error ? error : String(error));
    // 错误时回退到根目录
    await showBookmarksBar();
  }
}

function updateBookmarksDisplay(parentId: string, movedItemId?: string, _newIndex?: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 首先检查缓存
    const cached = bookmarksCache.get(parentId);
    if (cached && !movedItemId) {
      // 如果有缓存且不是移动操作，直接使用缓存数据
      console.log('Using cached bookmarks for:', parentId);
      displayBookmarks({ id: parentId, children: cached.bookmarks });
      resolve();
      return;
    }

    // 如果没有缓存或是移动操作，从 Chrome API 获取数据
    chrome.bookmarks.getChildren(parentId, (bookmarks) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      const bookmarksList = document.getElementById('bookmarks-list');
        void bookmarksList;
      const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
        void bookmarksContainer;

      // 更新缓存
      bookmarksCache.set(parentId, bookmarks);

      // 显示书签
      displayBookmarks({ id: parentId, children: bookmarks });

      if (movedItemId) {
        highlightBookmark(movedItemId);
      }

      // 更新文件夹名称
      updateFolderName(parentId);

      resolve();
    });
  });
}

// 获取书栏的本地化名称
function getBookmarksBarName(): Promise<string> {
  return new Promise<string>(resolve => {
    chrome.bookmarks.getTree(function(tree) {
      if (tree && tree[0] && tree[0].children) {
        const bookmarksBar = tree[0].children.find(child => child.id === '1');
        if (bookmarksBar) {
          resolve(bookmarksBar.title);
        } else {
          resolve('Bookmarks Bar'); // 默认英文名称
        }
      } else {
        resolve('Bookmarks Bar'); // 默认英文名称
      }
    });
  });
}

function getBookmarkPath(bookmarkId: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    getBookmarksBarName().then(bookmarksBarName => {
      function getParentRecursive(id: string, path: string[] = []) {
        chrome.bookmarks.get(id, function(results) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (results && results[0]) {
            path.unshift(results[0].title);
            if (results[0].parentId && results[0].parentId !== '0') {
              getParentRecursive(results[0].parentId, path);
            } else {
              // 确保书签栏名称总是作为第一个元素
              if (path[0] !== bookmarksBarName) {
                path.unshift(bookmarksBarName);
              }
              resolve(path);
            }
          } else {
            reject(new Error('Bookmark not found'));
          }
        });
      }
      getParentRecursive(bookmarkId);
    });
  });
}

function updateFolderName(bookmarkId: string) {
  const folderNameElement = document.getElementById('folder-name');
  if (!folderNameElement) return;

  // 清除所有内容
  folderNameElement.innerHTML = '';

  // 检查 bookmarkId 是否有效
  if (!bookmarkId || bookmarkId === 'undefined') {
    folderNameElement.textContent = getLocalizedMessage('bookmarks');
    return;
  }

  // 尝试获取书签路径
  getBookmarkPath(bookmarkId).then((pathArray: string[]) => {
    let breadcrumbHtml = '';
    let currentPath = '';

    pathArray.forEach((part: string, index: number) => {
      currentPath += (index > 0 ? ' > ' : '') + part;
      breadcrumbHtml += `<span class="breadcrumb-item" data-path="${currentPath}">${getLocalizedMessage(part)}</span>`;
      if (index < pathArray.length - 1) {
        breadcrumbHtml += '<span class="breadcrumb-separator">&gt;</span>';
      }
    });

    folderNameElement.innerHTML = breadcrumbHtml;
    addBreadcrumbClickListeners();
  }).catch(error => {
    console.warn('Error updating folder name:', error);
    // 设置默认文本，并确保它被本地化
    folderNameElement.textContent = getLocalizedMessage('bookmarks');
  });
}

function addBreadcrumbClickListeners() {
  const breadcrumbItems = document.querySelectorAll<HTMLElement>('.breadcrumb-item');
  breadcrumbItems.forEach(item => {
    item.addEventListener('click', function () {
      const path = this.dataset["path"];
      if (path !== undefined) navigateToPath(path);
    });
  });
}

function navigateToPath(path: string) {
  const pathParts = path.split(' > ');
  
  // 获取书签栏的名称
  getBookmarksBarName().then(bookmarksBarName => {
    let currentId = '1'; // 默认从根目录开始
    let startIndex = 0;

    // 如果路径不是从书签栏开始，我们需要找到正确的起始点
    const firstPathPart = pathParts[0];
    if (firstPathPart !== bookmarksBarName && firstPathPart !== undefined) {
      chrome.bookmarks.search({title: firstPathPart}, function(results) {
        const firstResult = results[0];
        if (firstResult) {
          currentId = firstResult.id;
        }
        navigateRecursive(startIndex);
      });
    } else {
      startIndex = 1; // 如果从书签栏开始，跳过第一个元素
      navigateRecursive(startIndex);
    }

    function navigateRecursive(index: number) {
      if (index >= pathParts.length) {
        updateBookmarksDisplay(currentId);
        return;
      }

      chrome.bookmarks.getChildren(currentId, function(children) {
        const matchingChild = children.find(child => child.title === pathParts[index]);
        if (matchingChild) {
          currentId = matchingChild.id;
          navigateRecursive(index + 1);
        } else {
          updateBookmarksDisplay(currentId);
        }
      });
    }
  });
}

function displayBookmarks(bookmark: BookmarkDisplay) {
  const bookmarksList = document.getElementById('bookmarks-list');
  const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
  if (!bookmarksList || !bookmarksContainer) {
    return;
  }

  // 先移除 loaded 类
  bookmarksContainer.classList.remove('loaded');
  
  const fragment = document.createDocumentFragment();
  
  const itemsToDisplay = [...(bookmark.children ?? [])];
  
  itemsToDisplay.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  
  itemsToDisplay.forEach((child: BookmarkNode) => {
    if (child.url) {
      const card = createBookmarkCard(child, child.index ?? 0);
      fragment.appendChild(card);
    } else {
      const folderCard = createFolderCard(child, child.index ?? 0);
      fragment.appendChild(folderCard);
    }
  });
  
  bookmarksList.innerHTML = '';
  bookmarksList.appendChild(fragment);
  bookmarksList.dataset["parentId"] = bookmark.id;
  
  // 使用 requestAnimationFrame 确保在下一帧添加 loaded 类
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bookmarksContainer.classList.add('loaded');
    });
  });
  
  setupSortable();
}

function getColors(img: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  if (!ctx) return { primary: [200, 200, 200], secondary: [220, 220, 220] };
  ctx.drawImage(img, 0, 0, img.width, img.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const colors: Record<string, number> = {};

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue; // 跳过完全透明的像素
    const rgb = `${r},${g},${b}`;
    colors[rgb] = (colors[rgb] || 0) + 1;
  }

  const sortedColors = Object.entries(colors).sort((a, b) => b[1] - a[1]);
  
  if (sortedColors.length === 0) {
    // 如果图片完全透明，返回默认颜色
    return { primary: [200, 200, 200], secondary: [220, 220, 220] };
  }
  
  const [firstColor, secondColor] = sortedColors;
  if (!firstColor) return { primary: [200, 200, 200], secondary: [220, 220, 220] };
  const primaryColor = firstColor[0].split(',').map(Number);
  const secondaryColor = secondColor
    ? secondColor[0].split(',').map(Number)
    : primaryColor.map(c => Math.min(255, c + 20)); // 如果只有一种颜色，创建一个稍微亮的次要颜色

  return { primary: primaryColor, secondary: secondaryColor };
}



// 修改现有的颜色处理函数


// 修改创建书签卡片时的颜色处理
function createBookmarkCard(bookmark: BookmarkNode, index: number) {
  const bookmarkUrl = bookmark.url ?? '';
  const card = document.createElement('a');
  card.href = bookmarkUrl;
  card.className = 'bookmark-card card';
  card.dataset["id"] = bookmark.id;
  card.dataset["parentId"] = bookmark.parentId;
  card.dataset["index"] = index.toString();

  const img = document.createElement('img');
  img.className = 'w-6 h-6 mr-2';
  img.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bookmarkUrl)}&size=32`;

  // 尝试从缓存获取颜色
  const cachedColors = localStorage.getItem(`bookmark-colors-${bookmark.id}`);
  
  if (cachedColors) {
    // 如果有缓存，直接应用缓存的颜色
    const colors = JSON.parse(cachedColors);
    applyColors(card, colors);
    
    // 只加载 favicon 图片，不重新计算颜色
    img.onload = null;
  } else {
    // 只在没有缓存时计算颜色
    img.onload = function() {
      const colors = getColors(img);
      applyColors(card, colors);
      localStorage.setItem(`bookmark-colors-${bookmark.id}`, JSON.stringify(colors));
    };
  }

  img.onerror = function() {
    // 处 favicon 加载失败的情况
    const defaultColors = { primary: [200, 200, 200], secondary: [220, 220, 220] };
    applyColors(card, defaultColors);
    localStorage.setItem(`bookmark-colors-${bookmark.id}`, JSON.stringify(defaultColors));
  };

  const favicon = document.createElement('div');
  favicon.className = 'favicon';
  favicon.appendChild(img);
  card.appendChild(favicon);

  const content = document.createElement('div');
  content.className = 'card-content';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = bookmark.title;

  content.appendChild(title);
  card.appendChild(content);

  card.addEventListener('contextmenu', function(event) {
    event.preventDefault();
    event.stopPropagation(); // 阻止事件冒泡，防止触发文档级的contextmenu事件监听器
    console.log('Bookmark context menu triggered:', bookmark);
    showContextMenu(event, bookmark, 'bookmark'); // 明确指定类型为 'bookmark'
  });

  // 添加鼠标悬停效果
  card.addEventListener('mouseenter', function() {
    this.style.transform = 'scale(1.03)';
    this.style.boxShadow = '0 1px 1px rgba(0,0,0,0.01)';
    this.style.backgroundColor = 'rgba(255,255,255,1)';
  });

  card.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1)';
    this.style.boxShadow = '';
    this.style.backgroundColor = '';
  });

  // 在文件顶部添加防重复点击控制
  let isProcessingClick = false;
  const CLICK_COOLDOWN = 500; // 点击冷却时间

  // 只使用一个事件处理器
  card.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessingClick) return;
    isProcessingClick = true;

    try {
      const isInternalUrl = bookmarkUrl.startsWith('chrome://') ||
                           bookmarkUrl.startsWith('chrome-extension://') ||
                           bookmarkUrl.startsWith('edge://') ||
                           bookmarkUrl.startsWith('about:');

      console.log('[Bookmark Click] Starting...', {
        url: bookmarkUrl,
        isInternalUrl: isInternalUrl
      });

      // 处理内部链接
      if (isInternalUrl) {
        console.log('[Bookmark Click] Opening internal URL');
        chrome.tabs.create({
          url: bookmarkUrl,
          active: true
        }).then(tab => {
          console.log('[Bookmark Click] Internal tab created successfully:', tab);
        }).catch(error => {
          console.error('[Bookmark Click] Failed to create internal tab:', error);
        });
        return;
      }

      console.log('[Bookmark Click] Opening in Main Window mode');
      chrome.storage.sync.get(['openInNewTab'], (rawResult: unknown) => {
        if (getBooleanProperty(rawResult, 'openInNewTab') !== false) {
          window.open(bookmarkUrl, '_blank');
        } else {
          window.location.href = bookmarkUrl;
        }
      });
    } catch (error) {
      console.error('[Bookmark Click] Error:', error instanceof Error ? error : String(error));
    } finally {
      setTimeout(() => {
        isProcessingClick = false;
      }, CLICK_COOLDOWN);
    }
  });

  return card;
}

function adjustColor(r: number, g: number, b: number) {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  let factor = 1;

  if (brightness < 128) {
    // 如果颜色太暗，增加亮度
    factor = 1 + (128 - brightness) / 128;
  } else if (brightness > 200) {
    // 如果颜色太亮，减少亮度
    factor = 1 - (brightness - 200) / 55;
  }

  return {
    r: Math.min(255, Math.round(r * factor)),
    g: Math.min(255, Math.round(g * factor)),
    b: Math.min(255, Math.round(b * factor))
  };
}

function applyColors(card: HTMLElement, colors: BookmarkColors) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const adjustedPrimary = adjustColor(colors.primary[0] ?? 0, colors.primary[1] ?? 0, colors.primary[2] ?? 0);
  const adjustedSecondary = adjustColor(colors.secondary[0] ?? 0, colors.secondary[1] ?? 0, colors.secondary[2] ?? 0);
  
  const opacity = isDark ? '0.1' : '0.06';
  card.style.background = `linear-gradient(135deg, 
    rgba(${adjustedPrimary.r}, ${adjustedPrimary.g}, ${adjustedPrimary.b}, ${opacity}), 
    rgba(${adjustedSecondary.r}, ${adjustedSecondary.g}, ${adjustedSecondary.b}, ${opacity}))`;
  card.style.border = `1px solid rgba(${adjustedPrimary.r}, ${adjustedPrimary.g}, ${adjustedPrimary.b}, ${isDark ? '0.1' : '0.01'})`;
}

function openInNewWindow(url: string) {
  chrome.windows.create({ url: url }, function (window) {
    console.log('New window opened with id: ' + window?.id);
  });
}

function openInIncognito(url: string) {
  chrome.windows.create({ url: url, incognito: true }, function (window) {
    console.log('New incognito window opened with id: ' + window?.id);
  });
}

// Encapsulate toast and bookmark link copier functionality in a closure
const Utilities = (function() {
  let toastTimeout: ReturnType<typeof setTimeout> | undefined;

  function showToast(message = getLocalizedMessage('moreSearchSupportToast'), duration = 1500) {
    const toast = document.getElementById('more-button-toast');
    if (!toast) {
      console.error('Toast element not found');
      return;
    }

    // If toast is already showing, clear the previous timeout
    if (toast.classList.contains('show')) {
      clearTimeout(toastTimeout);
      toast.classList.remove('show');
      setTimeout(() => showToast(message, duration), 300); // Try showing again after a short delay
      return;
    }

    const toastMessage = toast.querySelector<HTMLElement>('p');
    if (toastMessage) {
      toastMessage.textContent = message;
    }

    toast.classList.add('show');

    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  function copyBookmarkLink(bookmark: CurrentBookmark) {
    try {
      if (!bookmark || !bookmark.url) {
        throw new Error('No valid bookmark link found');
      }
      navigator.clipboard.writeText(bookmark.url).then(() => {
        showToast(getLocalizedMessage('linkCopied'));
      }).catch(err => {
        console.error('Failed to copy link:', err);
        showToast(getLocalizedMessage('copyLinkFailed'));
      });
    } catch (error) {
      console.error('Error copying bookmark link:', error);
      if (error instanceof Error && error.message === 'Extension context invalidated.') {
        showToast(getLocalizedMessage('extensionReloaded'));
      } else {
        showToast(getLocalizedMessage('copyLinkFailed'));
      }
    }
  }

  return {
    showToast: showToast,
    copyBookmarkLink: copyBookmarkLink
  };
})();

// 修改 showContextMenu 函数
function showContextMenu(event: MouseEvent, item: CurrentBookmark | HTMLElement, type = 'bookmark') {
  // 先关闭所有已存在的上下文菜单
  const existingMenus = document.querySelectorAll<HTMLElement>('.custom-context-menu');
  existingMenus.forEach(menu => {
    if (menu !== contextMenu && menu.style.display !== 'none') {
      menu.style.display = 'none';
    }
  });

  // 如果上下文菜单不存在，则创建一个新的
  if (!contextMenu) {
    contextMenu = createContextMenu();
  }

  if (!contextMenu) {
    console.error('Failed to create context menu');
    return;
  }

  // 清除之前的状态
  itemToDelete = null;
  currentBookmark = null;
  
  // 设置当前项目，确保包含类型信息
  const itemElement = item instanceof HTMLElement ? item : null;
  const bookmarkItem = item instanceof HTMLElement ? null : item;
  currentBookmark = {
    id: bookmarkItem?.id ?? itemElement?.dataset['id'] ?? '',
    title: bookmarkItem?.title ?? itemElement?.querySelector('.card-title')?.textContent ?? itemElement?.querySelector('span')?.textContent ?? '',
    url: bookmarkItem?.url ?? itemElement?.dataset['url'] ?? '',
    type: bookmarkItem?.type ?? type
  };

  // 先显示菜单但设为不可见，以便获取其尺寸
  contextMenu.style.display = 'block';
  contextMenu.style.visibility = 'hidden';
  contextMenu.style.left = '0';
  contextMenu.style.top = '0';
  
  // 获取视窗尺寸
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 等待一下以确保菜单已渲染
  const activeMenu = contextMenu;
  setTimeout(() => {
    const menuRect = activeMenu.getBoundingClientRect();
    
    // 计算最佳位置
    let left = event.clientX;
    let top = event.clientY;
    
    // 检查右侧空间
    if (left + menuRect.width > viewportWidth) {
      // 如果右侧空间不足，尝试将菜单放在点击位置的左侧
      left = Math.max(5, left - menuRect.width);
    }
    
    // 检查底部空间
    if (top + menuRect.height > viewportHeight) {
      // 如果底部空间不足，尝试将菜单放在点击位置的上方
      top = Math.max(5, viewportHeight - menuRect.height - 5);
    }
    
    // 应用计算后的位置
    activeMenu.style.left = `${left}px`;
    activeMenu.style.top = `${top}px`;
    
    // 使菜单可见
    activeMenu.style.visibility = 'visible';
  }, 0);
}



// 新增函数：根据类型创建菜单项



// 在创建快捷链接卡片时


// 在确认对话框关闭时清理数据


// 分别定义两个函数处理不同类型的删除



// 新增：清理所有删除相关的状态


// 修改 showConfirmDialog 函数
function showConfirmDialog(message: string, callback: () => void | Promise<void>) {
  // 先保存当前状态的副本
  const currentState = {
    itemToDelete: itemToDelete ? { ...itemToDelete } : null,
    currentBookmark: currentBookmark ? { ...currentBookmark } : null,
    type: itemToDelete ? itemToDelete.type : 'unknown'  // 从 itemToDelete 获取类型
  };

  console.log('Current state:', currentState);

  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmMessage = document.getElementById('confirm-dialog-message');
  const confirmQuickLinkMessage = document.getElementById('confirm-delete-quick-link-message');
  const confirmButton = document.getElementById('confirm-delete-button');
  const cancelButton = document.getElementById('cancel-delete-button');

  if (!confirmDialog || !confirmMessage || !confirmButton || !cancelButton) {
    console.error('Required dialog elements not found');
    return;
  }

  // 清空所有确认消息
  confirmMessage.innerHTML = '';
  if (confirmQuickLinkMessage) {
    confirmQuickLinkMessage.innerHTML = '';
    confirmQuickLinkMessage.style.display = 'none';
  }
  
  // 根据 itemToDelete 的类型显示相应的消息
  if (itemToDelete && itemToDelete.type === 'quickLink') {
    if (confirmQuickLinkMessage) {
      confirmQuickLinkMessage.innerHTML = message;
      confirmQuickLinkMessage.style.display = 'block';
      confirmMessage.style.display = 'none';
    }
  } else {
    confirmMessage.innerHTML = message;
    confirmMessage.style.display = 'block';
    if (confirmQuickLinkMessage) {
      confirmQuickLinkMessage.style.display = 'none';
    }
  }

  confirmDialog.style.display = 'block';

  const handleConfirm = () => {
    console.log('Confirm clicked. Current state:', currentState);
    if (typeof callback === 'function') {
      callback();
    }
    confirmDialog.style.display = 'none';
    cleanup();
  };

  const handleCancel = () => {
    console.log('Cancel clicked. Clearing state...');
    confirmDialog.style.display = 'none';

    // 清空所有确认消息
    confirmMessage.innerHTML = '';
    confirmMessage.style.display = 'block';
    if (confirmQuickLinkMessage) {
      confirmQuickLinkMessage.innerHTML = '';
      confirmQuickLinkMessage.style.display = 'none';
    }

    // 使用之前保存的状态副本记录日志
    console.log('State before cancel:', currentState);

    clearAllStates();
    cleanup();
  };

  const cleanup = () => {
    console.log('Cleaning up event listeners');
    confirmButton.removeEventListener('click', handleConfirm);
    cancelButton.removeEventListener('click', handleCancel);
  };

  // 移除旧的事件监听器并添加新的
  confirmButton.removeEventListener('click', handleConfirm);
  cancelButton.removeEventListener('click', handleCancel);
  confirmButton.addEventListener('click', handleConfirm);
  cancelButton.addEventListener('click', handleCancel);
}

// 新增一个函数来清理所有状态
function clearAllStates() {
  itemToDelete = null;
  currentBookmark = null;

  // 隐藏上下文菜单
  if (contextMenu) {
    contextMenu.style.display = 'none';
  }
}


function deleteBookmark(bookmarkId: string, _bookmarkTitle: string) {
  if (!bookmarkId) {
    console.error('No bookmark ID provided for deletion');
    return;
  }

  // 先从界面上移除书签卡片
  const bookmarkCard = document.querySelector<HTMLElement>(`.bookmark-card[data-id="${bookmarkId}"]`);
  if (bookmarkCard) {
    // 添加淡出动画
    bookmarkCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    bookmarkCard.style.opacity = '0';
    bookmarkCard.style.transform = 'scale(0.95)';
    
    // 等待动画完成后移除元素
    setTimeout(() => {
      bookmarkCard.remove();
    }, 300);
  }

  // 然后调用 Chrome API 删除书签
  chrome.bookmarks.remove(bookmarkId, function() {
    if (chrome.runtime.lastError) {
      console.error('Error deleting bookmark:', chrome.runtime.lastError);
      Utilities.showToast(getLocalizedMessage('deleteBookmarkError'));
      
      // 如果删除失败，恢复书签卡片
      if (bookmarkCard && bookmarkCard.parentNode) {
        bookmarkCard.style.opacity = '1';
        bookmarkCard.style.transform = 'scale(1)';
      }
    } else {
      // 保留成功删除的日志，但简化
      Utilities.showToast(getLocalizedMessage('deleteSuccess'));
      
      // 清除相关缓存
      bookmarksCache.clear();
      
      // 更新父文件夹的显示
      const parentId = document.getElementById('bookmarks-list')?.dataset["parentId"];
      if (parentId) {
        // 不需要完全刷新，因为我们已经从界面上移除了书签卡片
        // 但我们需要更新缓存和排序
        chrome.bookmarks.getChildren(parentId, (bookmarks) => {
          if (!chrome.runtime.lastError) {
            bookmarkOrderCache[parentId] = bookmarks.map(b => b.id);
          }
        });
      }
    }
  });
}

function showToast(message: string, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.error('Toast element not found');
    return;
  }
  toast.textContent = message;
  toast.style.display = 'block';
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.style.display = 'none';
    }, 300);
  }, duration);
}



function createFolderCard(folder: BookmarkNode, index: number) {
  const card = document.createElement('div');
  card.className = 'bookmark-folder card';
  card.dataset["id"] = folder.id;
  card.dataset["parentId"] = folder.parentId;
  card.dataset["index"] = index.toString();

  const icon = document.createElement('span');
  icon.className = 'material-icons mr-2';
  icon.innerHTML = ICONS.folder;
  
  const content = document.createElement('div');
  content.className = 'card-content';
  
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = folder.title;
  
  content.appendChild(title);
  card.appendChild(icon);
  card.appendChild(content);

  // Add click event handler to display folder contents
  card.addEventListener('click', function() {
    updateBookmarksDisplay(folder.id);
    updateFolderName(folder.id);
  });

  // 从缓存获取文件夹颜色
  const cachedColors = ColorCache.get(folder.id, 'folder');
  if (cachedColors) {
    applyColors(card, cachedColors);
  } else {
    // 为文件夹生成默认颜色
    const defaultColors = {
      primary: [230, 230, 230],    // 稍微浅一点的灰色
      secondary: [240, 240, 240]    // 更浅的灰色
    };
    applyColors(card, defaultColors);
    ColorCache.set(folder.id, 'folder', defaultColors);
  }

  // 修改右键点击事件，使用文件夹的上下文菜单
  card.addEventListener('contextmenu', async function (event) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Folder card right click:', {
      folderId: card.dataset["id"],
      folderTitle: card.querySelector<HTMLElement>('.card-title')?.textContent
    });
    
    // 确保文件夹上下文菜单存在
    if (!bookmarkFolderContextMenu) {
      bookmarkFolderContextMenu = createBookmarkFolderContextMenu();
    }

    if (!bookmarkFolderContextMenu) {
      console.error('Failed to create bookmark folder context menu');
      return;
    }

    // 更新当前文件夹
    currentBookmarkFolder = card;
    
    // 重新创建菜单项以反映当前文件夹的状态
    await createMenuItems(bookmarkFolderContextMenu);
    
    // 先显示菜单但设为不可见，以便获取其尺寸
    bookmarkFolderContextMenu.style.display = 'block';
    bookmarkFolderContextMenu.style.visibility = 'hidden';
    bookmarkFolderContextMenu.style.left = '0';
    bookmarkFolderContextMenu.style.top = '0';
    
    // 获取视窗尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 等待一下以确保菜单已渲染
    const activeFolderMenu = bookmarkFolderContextMenu;
    setTimeout(() => {
      const menuRect = activeFolderMenu.getBoundingClientRect();
      
      // 计算最佳位置
      let left = event.clientX;
      let top = event.clientY;
      
      // 检查右侧空间
      if (left + menuRect.width > viewportWidth) {
        // 如果右侧空间不足，尝试将菜单放在点击位置的左侧
        left = Math.max(5, left - menuRect.width);
      }
      
      // 检查底部空间
      if (top + menuRect.height > viewportHeight) {
        // 如果底部空间不足，尝试将菜单放在点击位置的上方
        top = Math.max(5, viewportHeight - menuRect.height - 5);
      }
      
      // 应用计算后的位置
      activeFolderMenu.style.left = `${left}px`;
      activeFolderMenu.style.top = `${top}px`;
      
      // 使菜单可见
      activeFolderMenu.style.visibility = 'visible';
    }, 0);

    // 隐藏其他上下文菜单
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
  });

  return card;
}

function setupSortable() {
  const bookmarksList = document.getElementById('bookmarks-list');
  if (bookmarksList) {
    new Sortable(bookmarksList, {
      animation: 150,
      onEnd: function (evt) {
        const itemId = evt.item.dataset["id"];
        const newParentId = bookmarksList.dataset["parentId"];
        const newIndex = evt.newIndex;

        showMovingFeedback(evt.item);

        if (itemId === undefined || newParentId === undefined || newIndex === undefined) return;
        moveBookmark(itemId, newParentId, newIndex)
          .then(() => {
            hideMovingFeedback(evt.item);
            showSuccessFeedback(evt.item);
          })
          .catch(error => {
            console.error('Error moving bookmark:', error);
            hideMovingFeedback(evt.item);
            showErrorFeedback(evt.item);
            syncBookmarkOrder(newParentId);
          });
      }
    });
  } else {
    console.error('Bookmarks list element not found');
  }

  const categoriesList = document.getElementById('categories-list');
  if (categoriesList) {
    new Sortable(categoriesList, {
      animation: 150,
      group: 'nested',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onStart: function (evt) {
        console.log('Category drag started:', evt.item.dataset["id"]);
      },
      onEnd: function (evt) {
        const itemEl = evt.item;
        const newIndex = evt.newIndex;
        const bookmarkId = itemEl.dataset["id"];
        const newParentId = evt.to.closest<HTMLElement>('li')?.dataset["id"] ?? '1';

        console.log('Category moved:', {
          bookmarkId: bookmarkId,
          newParentId: newParentId,
          oldIndex: evt.oldIndex,
          newIndex: newIndex,
          fromList: evt.from.id,
          toList: evt.to.id
        });

        if (evt.oldIndex !== evt.newIndex || evt.from !== evt.to) {
          if (bookmarkId !== undefined && newIndex !== undefined) moveBookmark(bookmarkId, newParentId, newIndex);
        }
      }
    });

    const folders = categoriesList.querySelectorAll<HTMLElement>('li ul');
    folders.forEach((folder, _index) => {
      new Sortable(folder, {
        group: 'nested',
        animation: 150,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        onStart: function (evt) {
          console.log('Subfolder drag started:', evt.item.dataset["id"]);
        },
        onEnd: function (evt) {
          const itemEl = evt.item;
          const newIndex = evt.newIndex;
          const bookmarkId = itemEl.dataset["id"];
          const newParentId = evt.to.closest<HTMLElement>('li')?.dataset["id"] ?? '1';

          console.log('Subfolder item moved:', {
            bookmarkId: bookmarkId,
            newParentId: newParentId,
            oldIndex: evt.oldIndex,
            newIndex: newIndex,
            fromList: evt.from.id,
            toList: evt.to.id
          });

          if (evt.oldIndex !== evt.newIndex || evt.from !== evt.to) {
            if (bookmarkId !== undefined && newIndex !== undefined) moveBookmark(bookmarkId, newParentId, newIndex);
          }
        }
      });
    });
  } else {
    console.error('Categories list element not found');
  }
}

function moveBookmark(itemId: string, newParentId: string, newIndex: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.bookmarks.move(itemId, { index: newIndex }, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error moving bookmark:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        console.log(`Bookmark ${itemId} moved to index ${result.index}`);
        updateAffectedBookmarks(newParentId, itemId, result.index ?? newIndex)
          .then(() => {
            console.log(`Bookmark ${itemId} position updated in UI`);
            resolve();
          })
          .catch(reject);
      }
    });
  });
}

function updateAffectedBookmarks(parentId: string, movedItemId: string | undefined, newIndex: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const bookmarksList = document.getElementById('bookmarks-list');
    if (!bookmarksList) {
      reject(new Error('Bookmarks list not found'));
      return;
    }
    const bookmarkElements = Array.from(bookmarksList.children);
    const movedElement = bookmarksList.querySelector<HTMLElement>(`[data-id="${movedItemId}"]`);
    
    if (!movedElement) {
      console.error('Moved element not found');
      reject(new Error('Moved element not found'));
      return;
    }

    const oldIndex = bookmarkElements.indexOf(movedElement);
    
    // 如置没有变化，不需要更新
    if (oldIndex === newIndex) {
      resolve();
      return;
    }

    // 移动元素到新位置
    if (newIndex >= bookmarkElements.length) {
      bookmarksList.appendChild(movedElement);
    } else {
      bookmarksList.insertBefore(movedElement, bookmarksList.children[newIndex] ?? null);
    }

    // 更新所有书签的索引
    bookmarkElements.forEach((element, index) => {
      if (element instanceof HTMLElement) element.dataset["index"] = index.toString();
    });

    // 更新本地缓存
    bookmarkOrderCache[parentId] = bookmarkElements
      .map(el => el instanceof HTMLElement ? el.dataset["id"] : undefined)
      .filter((id): id is string => id !== undefined);

    if (movedItemId !== undefined) highlightBookmark(movedItemId);
    console.log(`UI updated: Bookmark ${movedItemId} moved from ${oldIndex} to ${newIndex}`);
    resolve();
  });
}

function highlightBookmark(itemId: string) {
  const bookmarkElement = document.querySelector<HTMLElement>(`[data-id="${itemId}"]`);
  if (bookmarkElement) {
    bookmarkElement.style.transition = 'background-color 0.5s ease';
    bookmarkElement.style.backgroundColor = '#ffff99';
    setTimeout(() => {
      bookmarkElement.style.backgroundColor = '';
    }, 1000);
  }
}

// 修改 displayBookmarkCategories 函数，添加清理逻辑
function displayBookmarkCategories(bookmarkNodes: BookmarkNode[], level: number, parentUl: HTMLUListElement | null, parentId: string) {
  const categoriesList = parentUl || document.getElementById('categories-list');
  if (!categoriesList) return;

  // 如果是根级调用，先清空现有内容
  if (!parentUl) {
    categoriesList.innerHTML = '';
  }

  if (parentId === '1') {
    categoriesList.style.display = 'block';
  }

  bookmarkNodes.forEach(function (bookmark: BookmarkNode) {
    if (bookmark.children && bookmark.children.length > 0) {
      let li = document.createElement('li');
      li.className = 'cursor-pointer p-2 hover:bg-emerald-500 rounded-lg flex items-center folder-item';
      li.style.paddingLeft = `${(level * 20) + 8}px`;
      li.dataset["title"] = bookmark.title;
      li.dataset["id"] = bookmark.id;

      let span = document.createElement('span');
      span.textContent = bookmark.title;

      const folderIcon = document.createElement('span');
      folderIcon.className = 'material-icons mr-2';
      folderIcon.innerHTML = ICONS.folder;
      li.insertBefore(folderIcon, li.firstChild);

      const hasSubfolders = bookmark.children.some((child: BookmarkNode) => child.children);
      let arrowIcon: HTMLElement | null;
      if (hasSubfolders) {
        arrowIcon = document.createElement('span');
        arrowIcon.className = 'material-icons ml-auto';
        arrowIcon.innerHTML = ICONS.chevron_right;
        li.appendChild(arrowIcon);
      }

      let sublist = document.createElement('ul');
      sublist.className = 'pl-4 space-y-2';
      sublist.style.display = 'none';

      li.addEventListener('click', function (event) {
        event.stopPropagation();
        if (hasSubfolders) {
          let isExpanded = sublist.style.display === 'block';
          sublist.style.display = isExpanded ? 'none' : 'block';
          if (arrowIcon) {
            arrowIcon.innerHTML = isExpanded ? ICONS.chevron_right : ICONS.expand_less;
          }
        }

        document.querySelectorAll<HTMLElement>('#categories-list li').forEach(function (item) {
          item.classList.remove('bg-emerald-500');
        });
        li.classList.add('bg-emerald-500');

        updateBookmarksDisplay(bookmark.id);
      });

      li.appendChild(span);
      categoriesList.appendChild(li);
      categoriesList.appendChild(sublist);

      displayBookmarkCategories(bookmark.children, level + 1, sublist, bookmark.id);
    }
  });

  setupSortable();
}

// 添加一个获取文件夹内书签数量的函数

// 新增辅助函数

// 创建文件夹上下文菜单
function createBookmarkFolderContextMenu() {
  console.log('Creating folder context menu');

  // 移除任何已存在的上下文菜单
  const existingMenu = document.querySelector<HTMLElement>('.bookmark-folder-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  const menu = document.createElement('div');
  menu.className = 'bookmark-folder-context-menu custom-context-menu';
  document.body.appendChild(menu);

  // 异步创建菜单项
  createMenuItems(menu).catch(error => {
    console.error('Error creating menu items:', error);
  });

  return menu;
}

async function createMenuItems(menu: HTMLElement) {
  console.log('=== Creating Menu Items ===');
  console.log('Current bookmark folder:', currentBookmarkFolder);
  
  // 清空现有菜单项
  menu.innerHTML = '';

  // 每次创建菜单时重新检查当前文件夹的状态
  let isDefault = false;
  if (currentBookmarkFolder?.dataset?.["id"]) {
    try {
      // 确保在获取状态前等待 chrome.storage.local.get 完成
      const data = await chrome.storage.local.get('defaultFolders');
      const defaultFolders = getDefaultFolders(data["defaultFolders"]);
      isDefault = defaultFolders.some(folder => folder.id === currentBookmarkFolder?.dataset["id"]);
      
      console.log('Folder status check:', {
        folderId: currentBookmarkFolder.dataset["id"],
        isDefault: isDefault,
        defaultFolders: defaultFolders,
        folderTitle: currentBookmarkFolder.querySelector<HTMLElement>('.card-title')?.textContent
      });
    } catch (error) {
      console.error('Error checking default folder status:', error instanceof Error ? error : String(error));
      isDefault = false;
    }
  }

  const menuItems = [
    { 
      text: getLocalizedMessage('openAllBookmarks'),
      icon: 'open_in_new',  
      action: () => {
        if (currentBookmarkFolder) {
          const folderId = currentBookmarkFolder.dataset["id"];
          const folderTitle = currentBookmarkFolder.querySelector<HTMLElement>('.card-title')?.textContent ?? '';

          if (folderId === undefined) return;
          chrome.bookmarks.getChildren(folderId, (bookmarks) => {
            // 过滤出有效的书签URL
            const validUrls = bookmarks
              .filter(bookmark => bookmark.url)
              .map(bookmark => bookmark.url);

            if (validUrls.length > 0) {
              // 使用 chrome.runtime.sendMessage 发送消息给后台脚本
              chrome.runtime.sendMessage({
                action: 'openMultipleTabsAndGroup',
                urls: validUrls,
                groupName: folderTitle // 使用文件夹名称作为标签组名称
              }, (rawResponse: unknown) => {
                const response = getOpenMultipleTabsResponse(rawResponse);
                if (response?.success) {
                  console.log('Bookmarks opened in new tab group');
                } else {
                  console.error('Error opening bookmarks:', response?.error);
                }
              });
            }
          });
        }
      }
    },
    // 原有的菜单项
    { text: getLocalizedMessage('rename'), icon: 'edit', action: () => currentBookmarkFolder && openEditBookmarkFolderDialog(currentBookmarkFolder) },
    { text: getLocalizedMessage('delete'), icon: 'delete', action: () => {
      if (currentBookmarkFolder) {
        const folderId = currentBookmarkFolder.dataset["id"];
        const folderTitle = currentBookmarkFolder.querySelector<HTMLElement>('.card-title')?.textContent ?? '';
          const parentId = currentBookmarkFolder.dataset["parentId"] || '1';

          showConfirmDialog(chrome.i18n.getMessage("confirmDeleteFolder", [`<strong>${folderTitle}</strong>`]), async () => {
            try {
              if (folderId === undefined) return;
              await chrome.bookmarks.removeTree(folderId);
            
            // 1. 立即从 UI 中移除文件夹卡片
            const folderCard = document.querySelector<HTMLElement>(`.bookmark-folder[data-id="${folderId}"]`);
            if (folderCard) {
              folderCard.remove();
            }
            
            // 2. 从侧边栏中移除对应的文件夹及其所有子文件夹
            const sidebarFolder = document.querySelector<HTMLElement>(`#categories-list li[data-id="${folderId}"]`);
            if (sidebarFolder) {
              // 获取并移除所有子文件夹
              const subFolders = sidebarFolder.querySelectorAll<HTMLElement>('ul');
              subFolders.forEach(ul => ul.remove());
              sidebarFolder.remove();
            }

            // 3. 清除相关缓存
            if (bookmarksCache.data.has(folderId)) {
              bookmarksCache.delete(folderId);
            }
            if (bookmarksCache.data.has(parentId)) {
              bookmarksCache.delete(parentId);
            }
            
            // 4. 显示删除成功的 toast 消息
            Utilities.showToast(getLocalizedMessage('deleteSuccess'));

            // 5. 如果删除的是当前显示的文件夹，则返回上一级并重新加载
            const bookmarksList = document.getElementById('bookmarks-list');
            if (bookmarksList?.dataset["parentId"] === folderId) {
              await updateBookmarksDisplay(parentId);
              updateFolderName(parentId);
              selectSidebarFolder(parentId);
            }

            // 6. 重新加载父文件夹的内容
            const parentFolder = document.querySelector<HTMLElement>(`.bookmark-folder[data-id="${parentId}"]`);
            if (parentFolder) {
              await updateBookmarksDisplay(parentId);
            }

          } catch (error) {
            console.error('Error deleting folder:', error instanceof Error ? error : String(error));
            Utilities.showToast(getLocalizedMessage('deleteFolderError'));
          }
        });
      }
    }},
    {
      // 根据当前状态设置文本
      text: isDefault ? getLocalizedMessage('removeFromDefaultFolders') : getLocalizedMessage('addToDefaultFolders'),
      icon: isDefault ? 'keep_off' : 'keep',
      action: async () => {
        const folder = currentBookmarkFolder;
        console.log('Toggle default folder action triggered:', {
          folder: folder,
          folderId: folder?.dataset?.["id"],
          currentIsDefault: isDefault
        });

        if (!folder?.dataset?.["id"]) {
          console.error('No valid folder selected');
          return;
        }

        await toggleDefaultFolder(folder);

        // 重新获取当前状态
        const data = await chrome.storage.local.get('defaultFolders');
        const defaultFolders = getDefaultFolders(data["defaultFolders"]);
        const newIsDefault = defaultFolders.some(f => f.id === folder.dataset["id"]);
        
        console.log('Menu item status update:', {
          oldState: isDefault,
          newState: newIsDefault,
          folderId: folder.dataset["id"],
          defaultFolders: defaultFolders
        });

        const menuItem = menu.querySelector<HTMLElement>(`[data-action="toggleDefault"]`);
        if (menuItem) {
          const newText = getLocalizedMessage(newIsDefault ? 'removeFromDefaultFolders' : 'addToDefaultFolders');
          console.log('Updating menu item text to:', newText);
          
          const textElement = menuItem.querySelector<HTMLElement>('.text');
          if (textElement) textElement.textContent = newText;
          const iconElement = menuItem.querySelector<HTMLElement>('.icon-svg');
          if (iconElement) {
            iconElement.innerHTML = ICONS[newIsDefault ? 'keep_off' : 'keep'];
          }
        }
      }
    }
  ];

  // 创建菜单项
  menuItems.forEach((item, index) => {
    console.log(`Creating menu item ${index}:`, {
      text: item.text,
      icon: item.icon
    });
    const menuItem = document.createElement('div');
    menuItem.className = 'custom-context-menu-item';
    
    if (item.icon === 'keep' || item.icon === 'keep_off') {
      menuItem.dataset["action"] = 'toggleDefault';
    }
    
    const icon = document.createElement('span');
    icon.className = 'icon-svg';
    icon.innerHTML = getIconHtml(item.icon);
    if (item.icon === 'keep' || item.icon === 'keep_off') {
      icon.classList.toggle('selected', isDefault);
    }
    
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = item.text;

    menuItem.appendChild(icon);
    menuItem.appendChild(text);
    menuItem.addEventListener('click', async (e) => {
      e.stopPropagation();
      await item.action();
      setTimeout(() => {
      menu.style.display = 'none';
      }, 100);
    });

    menu.appendChild(menuItem);
  });
}


// 添加文件夹相关的全局变量
// Add event listeners or logic that uses these variables
document.addEventListener('DOMContentLoaded', () => {
  // Example initialization logic
  bookmarkFolderContextMenu = document.querySelector<HTMLElement>('#bookmark-folder-context-menu');
  currentBookmarkFolder = document.querySelector<HTMLElement>('.bookmark-folder.active');

  // Ensure these elements exist before using them
  if (bookmarkFolderContextMenu && currentBookmarkFolder) {
    // Add your event listeners or logic here
  }
});


function openEditBookmarkFolderDialog(folderElement: HTMLElement) {
  const folderId = folderElement.dataset["id"];
  const folderTitle = folderElement.querySelector<HTMLElement>('.card-title')?.textContent ?? '';

  const editCategoryNameInput = requireElement(document.getElementById('edit-category-name'), HTMLInputElement, '#edit-category-name');
  const editCategoryDialog = requireElement(document.getElementById('edit-category-dialog'), HTMLElement, '#edit-category-dialog');
  const editCategoryForm = requireElement(document.getElementById('edit-category-form'), HTMLFormElement, '#edit-category-form');

  editCategoryNameInput.value = folderTitle;
  editCategoryDialog.style.display = 'block';

  if (folderId === undefined) return;
  editCategoryForm.onsubmit = function (event) {
    event.preventDefault();
    const newTitle = editCategoryNameInput.value;
    chrome.bookmarks.update(folderId, { title: newTitle }, function () {
      console.log('Bookmark updated:', folderId, newTitle);
      updateCategoryUI(folderId, newTitle);
      updateFolderName(folderId);
      editCategoryDialog.style.display = 'none';
    });
  };
}

function updateCategoryUI(folderId: string, newTitle: string) {
  // 更新侧边栏中的文件夹名称
  const sidebarItem = document.querySelector<HTMLElement>(`#categories-list li[data-id="${folderId}"]`);
  if (sidebarItem) {
    // 更新文本内容
    const textSpan = sidebarItem.querySelector<HTMLElement>('span:not(.material-icons)');
    if (textSpan) {
      textSpan.textContent = newTitle;
    }

    // 更新 data-title 属性
    sidebarItem.setAttribute('data-title', newTitle);

    // 更新样式
    sidebarItem.classList.add('updated-folder');
    setTimeout(() => {
      sidebarItem.classList.remove('updated-folder');
    }, 2000); // 2秒后移除高亮效果
  }

  // 更新面包屑导航
  updateFolderName(folderId);

  // 更新文件夹卡片（如果在当前视图中）
  const folderCard = document.querySelector<HTMLElement>(`.bookmark-folder[data-id="${folderId}"]`);
  if (folderCard) {
    const titleElement = folderCard.querySelector<HTMLElement>('.card-title');
    if (titleElement) {
      titleElement.textContent = newTitle;
    }
  }
}



function updateSidebarDefaultBookmarkIndicator() {
  const defaultBookmarkId = localStorage.getItem('defaultBookmarkId');
  if (defaultBookmarkId !== null) selectSidebarFolder(defaultBookmarkId);
  
  const allCategories = document.querySelectorAll<HTMLElement>('#categories-list li');
  allCategories.forEach(category => {
    const indicator = category.querySelector<HTMLElement>('.default-indicator');
    if (indicator) {
      indicator.remove();
    }
    if (category.dataset["id"] === defaultBookmarkId) {
      const defaultIndicator = document.createElement('span');
      defaultIndicator.className = 'default-indicator material-icons';
      defaultIndicator.textContent = 'star';
      defaultIndicator.title = getLocalizedMessage('homepage');
      category.appendChild(defaultIndicator);
    }
  });
}

// 添加局变量来存储本地缓存
let bookmarkOrderCache: Record<string, string[]> = {};

// 添加一函数来同步本地缓存和 Chrome 书签
function syncBookmarkOrder(parentId: string) {
  refreshBookmarkOrder(chrome.bookmarks, bookmarksCache, parentId, (bookmarks) => {
    displayBookmarks({ id: parentId, children: bookmarks });
  });
}

// 添加一个定期同步函数
function startPeriodicSync() {
  startPeriodicBookmarkSync(
    () => document.getElementById('bookmarks-list')?.dataset["parentId"],
    syncBookmarkOrder,
    (error) => console.error('Error during bookmark sync:', error instanceof Error ? error : String(error)),
  );
}

let isRequestPending = false;
  void isRequestPending;

function setupSpecialLinks() {
  const specialLinks = document.querySelectorAll<HTMLElement>('.links-icons a, .settings-icon a');
  let isProcessingClick = false;

  specialLinks.forEach(link => {
    link.addEventListener('click', async function (e) {
      e.preventDefault();
      if (isProcessingClick) return;

      isProcessingClick = true;

      const href = this.getAttribute('href');
      let chromeUrl;
      switch (href) {
        case '#history':
          chromeUrl = 'chrome://history';
          break;
        case '#downloads':
          chromeUrl = 'chrome://downloads';
          break;
        case '#passwords':
          chromeUrl = 'chrome://settings/passwords';
          break;
        case '#extensions':
          chromeUrl = 'chrome://extensions';
          break;
        case '#settings':
          openSettingsModal();
          isProcessingClick = false;
          return;
        default:
          console.error('Unknown special link:', href);
          isProcessingClick = false;
          return;
      }

      try {
        // 直接使用 chrome.tabs.create 打开新标签页
        chrome.tabs.create({ url: chromeUrl }, (_tab) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to open tab:', chrome.runtime.lastError);
          }
        });
      } catch (error) {
        console.error('Error opening internal page:', error instanceof Error ? error : String(error));
      } finally {
        setTimeout(() => {
          isProcessingClick = false;
        }, 1000);
      }
    });
  });
}

function updateDefaultBookmarkIndicator() {
  const defaultBookmarkId = localStorage.getItem('defaultBookmarkId');
  const allBookmarks = document.querySelectorAll<HTMLElement>('.bookmark-card, .bookmark-folder');
  allBookmarks.forEach(bookmark => {
    const indicator = bookmark.querySelector<HTMLElement>('.default-indicator');
    if (indicator) {
      indicator.remove();
    }
    if (bookmark.dataset["id"] === defaultBookmarkId) {
      const defaultIndicator = document.createElement('span');
      defaultIndicator.className = 'default-indicator material-icons';
      defaultIndicator.textContent = 'star';
      defaultIndicator.title = getLocalizedMessage('homepage');
      bookmark.appendChild(defaultIndicator);
    }
  });
}

function selectSidebarFolder(folderId: string) {
  const allFolders = document.querySelectorAll<HTMLElement>('#categories-list li');
  allFolders.forEach(folder => {
    folder.classList.remove('bg-emerald-500');
    if (folder.dataset["id"] === folderId) {
      folder.classList.add('bg-emerald-500');
    }
  });
}

// 确在 DOMContentLoaded 事件初始化上文菜单
document.addEventListener('DOMContentLoaded', function () {
  // ... 其他初始化代码 ...
  createBookmarkFolderContextMenu();
});




// 保留原有的DOMContentLoaded事件监听器，但移除其中的背景应用逻辑
document.addEventListener('DOMContentLoaded', function () {

  // 在页面加载完成后立即检查 folder-name 元素
  const folderNameElement = document.getElementById('folder-name');
  if (!folderNameElement) return;

  // 设置一个 MutationObserver 来监视 folder-name 元素的变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((_mutation) => {
    });
  });

  observer.observe(folderNameElement, { childList: true, subtree: true });


  function waitForFirstCategoryEdge(attemptsLeft: number) {
    waitForFirstCategory(attemptsLeft);
  }



  function isEdgeBrowser() {
    return /Edg/.test(navigator.userAgent);
  }

  if (isEdgeBrowser()) {
    waitForFirstCategoryEdge(10);
  } else {
    waitForFirstCategory(10);
  }

  const toggleSidebarButton = requireElement(document.getElementById('toggle-sidebar'), HTMLElement, '#toggle-sidebar');
  const sidebarContainer = requireElement(document.getElementById('sidebar-container'), HTMLElement, '#sidebar-container');

  // 读保存的侧边栏状态
  const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

  // 初状
  function setSidebarState(isCollapsed: boolean) {
    if (isCollapsed) {
      sidebarContainer.classList.add('collapsed');
      toggleSidebarButton.textContent = '>';
      toggleSidebarButton.style.left = '2rem'; // 收起时的位置
    } else {
      sidebarContainer.classList.remove('collapsed');
      toggleSidebarButton.textContent = '<';
      toggleSidebarButton.style.left = '14.75rem'; // 展开时的位置
    }
  }

  // 应用初始状态
  setSidebarState(isSidebarCollapsed);

  // 切换侧边状态的函数
  function toggleSidebar() {
    const isCollapsed = sidebarContainer.classList.toggle('collapsed');
    setSidebarState(isCollapsed);
    localStorage.setItem('sidebarCollapsed', String(isCollapsed));
  }

  // 添加点击事件监听器
  toggleSidebarButton.addEventListener('click', toggleSidebar);

  document.addEventListener('click', function (event) {
    if (event.target instanceof Element && event.target.closest('#categories-list li')) {
      updateBookmarkCards();
    }
  });

  updateBookmarkCards();

  // 注释掉这个重复的createContextMenu函数定义，使用全局已经定义的函数
  /* function createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    document.body.appendChild(menu);
    // ... 其余函数内容 ...
  } */

  document.addEventListener('click', function () {
    // 延迟处理点击事件，让菜单项的点击事件先执行
    setTimeout(() => {
    if (contextMenu) {
      contextMenu.style.display = 'none';
        currentBookmark = null;
      }
      
      if (bookmarkFolderContextMenu) {
        bookmarkFolderContextMenu.style.display = 'none';
        currentBookmarkFolder = null;
      }
    }, 200);
  });

  const editDialog = requireElement(document.getElementById('edit-dialog'), HTMLElement, '#edit-dialog');
  const closeButton = requireElement(document.querySelector('.close-button'), HTMLElement, '.close-button');
  const cancelButton = requireElement(document.querySelector('.cancel-button'), HTMLElement, '.cancel-button');


  closeButton.onclick = function () {
    editDialog.style.display = 'none';
  };

  cancelButton.onclick = function () {
    editDialog.style.display = 'none';
  };

  window.onclick = function (event) {
    if (event.target == editDialog) {
      editDialog.style.display = 'none';
    }
  };




  // 调用 updateBookmarkCards
  updateBookmarkCards();








  let currentCategory: HTMLElement | null = null;
  // 递归获取所有书签数量的函数
  const getAllBookmarksCount = async (folderId: string, maxDepth = 5): Promise<number> => {
    let count = 0;
    let depth = 0;

    async function countBookmarks(id: string, currentDepth: number): Promise<number> {
      if (currentDepth > maxDepth) return 0;

      return new Promise<number>(resolve => {
        chrome.bookmarks.getChildren(id, async (items) => {
          let localCount = 0;

          for (const item of items) {
            if (item.url && item.url.startsWith('http')) {
              localCount++;
            } else if (currentDepth < maxDepth) {
              localCount += await countBookmarks(item.id, currentDepth + 1);
            }
          }

          resolve(localCount);
        });
      });
    }

    count = await countBookmarks(folderId, depth);
    return count;
  };
  // 1. 批量创建标签页的函数

  function createCategoryContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    document.body.appendChild(menu);

    // 创建基本菜单项
    const createMenuItems = async (bookmarkCount: number) => {
      // 检查当前文件夹是否为默认文件夹
      let isDefault = false;
      if (currentCategory?.dataset?.["id"]) {
        try {
          const data = await chrome.storage.local.get('defaultFolders');
          const defaultFolders = getDefaultFolders(data["defaultFolders"]);
          isDefault = defaultFolders.some(folder => folder.id === currentCategory?.dataset["id"]);
        } catch (error) {
          console.error('Error checking default folder status:', error instanceof Error ? error : String(error));
        }
      }

      const menuItems = [
        {
          text: `${getLocalizedMessage('openAllBookmarks')} (${bookmarkCount})`,
          icon: 'open_in_new',
          action: () => {
            if (currentCategory) {
              const folderId = currentCategory.dataset["id"];
              const folderTitle = currentCategory.dataset["title"];

              // 递归获取所有书签 URL 的函数
              const getAllBookmarkUrls = async (folderId: string): Promise<string[]> => {
                return new Promise<string[]>(resolve => {
                  chrome.bookmarks.getChildren(folderId, async (items) => {
                    let urls: string[] = [];
                    for (const item of items) {
                      if (item.url) {
                        urls.push(item.url);
                      } else {
                        // 递归获取子文件夹的 URLs
                        const subUrls = await getAllBookmarkUrls(item.id);
                        urls = urls.concat(subUrls);
                      }
                    }
                    resolve(urls);
                  });
                });
              };

              // 获取并打开所有书签
              if (folderId === undefined) return;
              getAllBookmarkUrls(folderId).then((validUrls: string[]) => {
                if (validUrls.length > 0) {
                  // 使用 background.js 中的优化函数
                  chrome.runtime.sendMessage({
                    action: 'openMultipleTabsAndGroup',
                    urls: validUrls,
                    groupName: folderTitle
                  }, (rawResponse: unknown) => {
                    const response = getOpenMultipleTabsResponse(rawResponse);
                    if (response?.success) {
                      console.log('Bookmarks opened in new tab group');
                    } else {
                      console.error('Error opening bookmarks:', response?.error);
                    }
                  });
                }
              });
            }
          }
        },
        // 原有的菜单项保持不变
        { text: getLocalizedMessage('rename'), icon: 'edit' },
        { text: getLocalizedMessage('delete'), icon: 'delete' },
        { 
          text: isDefault ? getLocalizedMessage('removeFromDefaultFolders') : getLocalizedMessage('addToDefaultFolders'),
          icon: isDefault ? 'keep_off' : 'keep',
          action: async () => {
            if (!currentCategory?.dataset?.["id"]) {
              console.error('No valid folder selected');
              return;
            }
            await toggleDefaultFolder(currentCategory);
          }
        }
      ];

      // 清空现有菜单项
      menu.innerHTML = '';

      // 创建菜单项的其余代码保持不变...
      menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'custom-context-menu-item';

        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.innerHTML = getIconHtml(item.icon);
        icon.style.marginRight = '8px';
        icon.style.fontSize = '18px';

        const text = document.createElement('span');
        text.textContent = item.text;

        menuItem.appendChild(icon);
        menuItem.appendChild(text);

        menuItem.addEventListener('click', function () {
          if (item.action) {
            item.action();
          } else {
            switch (item.text) {
              case getLocalizedMessage('rename'):
                if (currentCategory) openEditCategoryDialog(currentCategory);
                break;
              case getLocalizedMessage('delete'):
                if (!currentCategory) return;
                const category = currentCategory;
                const categoryId = category.dataset["id"];
                const categoryTitle = category.dataset["title"];
                showConfirmDialog(chrome.i18n.getMessage("confirmDeleteFolder", [`<strong>${categoryTitle}</strong>`]), () => {
                  if (categoryId === undefined) return;
                  chrome.bookmarks.removeTree(categoryId, function () {
                    category.remove();
                    Utilities.showToast(getLocalizedMessage('categoryDeleted'));
                  });
                });
                break;
            }
          }
          menu.style.display = 'none';
        });

        menu.appendChild(menuItem);
      });
    };

    return {
      menu: menu,
      updateMenuItems: createMenuItems
    };
  }

  const categoryContextMenu = createCategoryContextMenu();

  document.addEventListener('contextmenu', function (event) {
    if (!(event.target instanceof Element)) return;
    const targetCategory = event.target.closest<HTMLElement>('#categories-list li');
    if (targetCategory) {
      event.preventDefault();
      currentCategory = targetCategory;

      if (currentCategory) {
        const folderId = currentCategory.dataset["id"];
        // 使用新的递归函数获取总书签数量
        if (folderId === undefined) return;
        getAllBookmarksCount(folderId).then(totalCount => {
          categoryContextMenu.updateMenuItems(totalCount);

          categoryContextMenu.menu.style.top = `${event.clientY}px`;
          categoryContextMenu.menu.style.left = `${event.clientX}px`;
          categoryContextMenu.menu.style.display = 'block';
        });
      }
    } else {
      categoryContextMenu.menu.style.display = 'none';
    }
  });

  document.addEventListener('click', function () {
    categoryContextMenu.menu.style.display = 'none';
  });

  const editCategoryDialog = requireElement(document.getElementById('edit-category-dialog'), HTMLElement, '#edit-category-dialog');
  const editCategoryForm = requireElement(document.getElementById('edit-category-form'), HTMLFormElement, '#edit-category-form');
  const editCategoryNameInput = requireElement(document.getElementById('edit-category-name'), HTMLInputElement, '#edit-category-name');
  const closeCategoryButton = requireElement(document.querySelector('.close-category-button'), HTMLElement, '.close-category-button');
  const cancelCategoryButton = requireElement(document.querySelector('.cancel-category-button'), HTMLElement, '.cancel-category-button');

  function openEditCategoryDialog(categoryElement: HTMLElement) {
    const categoryId = categoryElement.dataset["id"];
    const categoryTitle = categoryElement.dataset["title"];

    editCategoryNameInput.value = categoryTitle ?? '';

    editCategoryDialog.style.display = 'block';

    editCategoryForm.onsubmit = function (event) {
      event.preventDefault();
      const updatedTitle = editCategoryNameInput.value;

      if (categoryId === undefined) return;
      chrome.bookmarks.update(categoryId, {
        title: updatedTitle
      }, function (_result) {
        updateCategoryUI(categoryElement, updatedTitle);
        editCategoryDialog.style.display = 'none';
      });
    };
  }

  function updateCategoryUI(categoryElement: HTMLElement, newTitle: string) {
    // 更新侧边栏中的文件夹名称
    const sidebarItem = document.querySelector<HTMLElement>(`#categories-list li[data-id="${categoryElement.dataset["id"]}"]`);
    if (sidebarItem) {
      // 更新文本内容
      const textSpan = sidebarItem.querySelector<HTMLElement>('span:not(.material-icons)');
      if (textSpan) {
        textSpan.textContent = newTitle;
      }

      // 更新 data-title 属性
      sidebarItem.setAttribute('data-title', newTitle);

      // 更新样式
      sidebarItem.classList.add('updated-folder');
      setTimeout(() => {
        sidebarItem.classList.remove('updated-folder');
      }, 2000); // 2秒后移除高亮效果
    }

    // 更新面包屑导航
    const categoryId = categoryElement.dataset["id"];
    if (categoryId !== undefined) updateFolderName(categoryId);

    // 更新文件夹卡片（如果在当前视图中）
    const folderCard = document.querySelector<HTMLElement>(`.bookmark-folder[data-id="${categoryElement.dataset["id"]}"]`);
    if (folderCard) {
      const titleElement = folderCard.querySelector<HTMLElement>('.card-title');
      if (titleElement) {
        titleElement.textContent = newTitle;
      }
    }
  }

  closeCategoryButton.onclick = function () {
    editCategoryDialog.style.display = 'none';
  };

  cancelCategoryButton.onclick = function () {
    editCategoryDialog.style.display = 'none';
  };

  window.onclick = function (event) {
    if (event.target == editCategoryDialog) {
      editCategoryDialog.style.display = 'none';
    }
  };



  const tabsContainer = requireElement(document.getElementById('tabs-container'), HTMLElement, '#tabs-container');
  const tabs = document.querySelectorAll<HTMLElement>('.tab');
  const defaultSearchEngine = localStorage.getItem('selectedSearchEngine') || 'Google';

  // 在文件的适当位置（可能在 DOMContentLoaded 事件监听器内）添加这个标志
  let isChangingSearchEngine = false;

  // 将 getSearchUrl 函数移到文件前面，在事件监听器之前定义




  tabs.forEach(tab => {
    tab.setAttribute('tabindex', '0');

    tab.addEventListener('click', function () {
        const selectedEngine = this.getAttribute('data-engine') ?? defaultSearchEngine;
        const searchInput = document.querySelector<HTMLTextAreaElement>('.search-input');
        if (!searchInput) return;
        const searchQuery = searchInput.value.trim();
        
        // 移除所有标签的激活状态
        tabs.forEach(t => t.classList.remove('active'));
        // 为当前点击的标签添加激活状态
        this.classList.add('active');

        // 如果搜索框有内容，立即执行搜索
        if (searchQuery) {
            const searchUrl = getSearchUrl(selectedEngine, searchQuery);
            window.open(searchUrl, '_blank');
            hideSuggestions();
            
            // 使用 setTimeout 延迟恢复默认搜索引擎状态
            setTimeout(restoreDefaultSearchEngine, 300);
        }
    });
  });

  new Sortable(tabsContainer, {
    animation: 150,
    onEnd: function (_evt) {
      const orderedEngines = Array.from(tabsContainer.children).map(tab => tab.getAttribute('data-engine'));
      localStorage.setItem('orderedSearchEngines', JSON.stringify(orderedEngines));
    }
  });

  const savedOrderValue: unknown = JSON.parse(localStorage.getItem('orderedSearchEngines') ?? 'null');
  if (Array.isArray(savedOrderValue) && savedOrderValue.every((value): value is string => typeof value === 'string')) {
    const savedOrder = savedOrderValue;
    savedOrder.forEach((engineName: string) => {
      const tab = Array.from(tabs).find(tab => tab.getAttribute('data-engine') === engineName);
      if (tab) {
        tabsContainer.appendChild(tab);
      }
    });
  }

  const searchForm = requireElement(document.getElementById('search-form'), HTMLElement, '#search-form');
  const searchInput = requireElement(document.querySelector('.search-input'), HTMLTextAreaElement, '.search-input');
  searchInput.addEventListener('focus', async function () {
    searchForm.classList.add('focused');
    if (searchInput.value.trim() === '') {
      showDefaultSuggestions();
    } else {
      const suggestions = await getSuggestions(searchInput.value.trim());
      showSuggestions(suggestions);
    }
  });

  searchInput.addEventListener('blur', () => {
    const searchForm = requireElement(document.querySelector('.search-form'), HTMLElement, '.search-form');
    searchForm.classList.remove('focused');
    // 使用 setTimeout 来延迟隐藏建议列表，允许点击建议
    setTimeout(() => {
      if (!searchForm.contains(document.activeElement)) {
        hideSuggestions();
      }
    }, 200);
  });

  updateSubmitButtonState();





  let isSearching = false;
  let searchQueue: string[] = [];



  const debouncedPerformSearch = debounce(performSearch, 300);

  // Modify the search form submit event listener
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Prevent default form submission
    performSearch(searchInput.value.trim());
  });




  // 修改 performSearch 函数
  function performSearch(query: string) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return;
    }

    isSearching = true;

    // 获取当前激活的搜索引擎用于本次搜索
    const activeTab = document.querySelector<HTMLElement>('.tab.active');
    const currentEngine = activeTab ? activeTab.getAttribute('data-engine') : defaultSearchEngine;
    console.log('[Search] Current engine for search:', currentEngine);

    // 获取真正的默认搜索引擎
    const defaultEngine = localStorage.getItem('selectedSearchEngine') || 'google';
    let url = getSearchUrl(currentEngine ?? defaultSearchEngine, query);

    // 在打开新窗口之前先恢复默认搜索引擎
    requestAnimationFrame(() => {
      // 1. 恢复 tabs-container 中的默认选中状态
      const tabs = document.querySelectorAll<HTMLElement>('.tab');
      console.log('[Search] Found tabs:', tabs.length);

      // 清除所有临时标记
      tabs.forEach(tab => {
        delete tab.dataset["temporary"];
        if (tab.getAttribute('data-engine')?.toLowerCase() === defaultEngine.toLowerCase()) {
          console.log('[Search] Setting active tab:', defaultEngine);
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      // 根据设置决定打开方式
      chrome.storage.sync.get('openSearchInNewTab', (rawResult: unknown) => {
        const openInNewTab = getBooleanProperty(rawResult, 'openSearchInNewTab') !== false; // 默认为 true
        console.log('[Search] Opening URL:', url, 'in new tab:', openInNewTab);

        if (openInNewTab) {
          window.open(url, '_blank');
        } else {
          window.location.href = url;
        }

        hideSuggestions();
      });
    });

    setTimeout(() => {
      isSearching = false;
      processSearchQueue();
    }, 1000);
  }

  // 新增恢复默认搜索引擎的函数
  function restoreDefaultSearchEngine() {
    const defaultEngine = localStorage.getItem('selectedSearchEngine') || 'google';

    // 更新标签状态
    const tabs = document.querySelectorAll<HTMLElement>('.tab');
    tabs.forEach(tab => {
      if (tab.getAttribute('data-engine') === defaultEngine) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 更新搜索引擎图标
    updateSearchEngineIcon(defaultEngine);
  }


  // 修改 getSearchUrl 函数,使用 SearchEngineManager 中的配置


  // 动态调整 textarea 度的函数
  function adjustTextareaHeight() {
    const searchInput = document.querySelector<HTMLElement>('.search-input');
    if (!searchInput) return;

    searchInput.style.height = 'auto'; // 重置高度
    const lineHeight = parseInt(getComputedStyle(searchInput).lineHeight) || 21;
    const maxHeight = 3 * lineHeight; // 最多显示 3 行
    const newHeight = Math.min(searchInput.scrollHeight, maxHeight);
    searchInput.style.height = `${newHeight}px`;
  }

  // 在输入事件中调用调整高度的函数
  searchInput.addEventListener('input', adjustTextareaHeight);

  // 初始化时调整高度
  adjustTextareaHeight();


  const searchSuggestions = requireElement(document.getElementById('search-suggestions'), HTMLElement, '#search-suggestions');

  // 防抖函


  // 在文件顶部定义 RELEVANCE_CONFIG
  const RELEVANCE_CONFIG = {
    titleExactMatchWeight: 6,
    urlExactMatchWeight: 1.5,
    titlePartialMatchWeight: 1.2,
    urlPartialMatchWeight: 0.3,
    timeDecayHalfLife: 60,
    fuzzyMatchThreshold: 0.6,
    fuzzyMatchWeight: 1.5,
    bookmarkRelevanceBoost: 1.2
  };

  // 获取搜索建议




  // 计算模糊匹配分数

  // 辅助函数：查找部分词匹配数量


  // Levenshtein 距离计算





  new Sortable(tabsContainer, {
    animation: 150,
    onEnd: function (_evt) {
      const orderedEngines = Array.from(tabsContainer.children).map(tab => tab.getAttribute('data-engine'));
      localStorage.setItem('orderedSearchEngines', JSON.stringify(orderedEngines));
    }
  });


  searchInput.addEventListener('focus', function () {
    searchForm.classList.add('focused');
  });

  searchInput.addEventListener('blur', function () {
    searchForm.classList.remove('focused');
  });



  function updateSubmitButtonState() {
    if (searchInput.value.trim() === '') {
      tabsContainer.style.display = 'none';
    } else {
      // 只有当搜索建议列表不为空时才显示 tabs-container
      if (searchSuggestions.children.length > 0) {
        tabsContainer.style.display = 'flex';
      } else {
        tabsContainer.style.display = 'none';
      }
    }
  }






  function queueSearch() {
    const query = searchInput.value.trim();
    if (query === '') {
      return;
    }
    searchQueue.push(query);
    processSearchQueue();
  }

  function processSearchQueue() {
    if (isSearching || searchQueue.length === 0) {
      return;
    }
    
    const query = searchQueue.shift();
    if (query !== undefined) debouncedPerformSearch(query);
  }


  // 修改 getSearchUrl 函数,使用 SearchEngineManager 中的配置
  function getSearchUrl(engine: string, query: string) {
    const allEngines = SearchEngineManager.getAllEngines();
    const engineConfig = allEngines.find(e => {
      // 匹配引擎名称或别名
      return e.name.toLowerCase() === engine.toLowerCase() ||
        (e.aliases && e.aliases.some(alias => alias.toLowerCase() === engine.toLowerCase()));
    });

    if (!engineConfig) {
      // 如果找不到对应的引擎配置,使用默认引擎
      const defaultEngine = SearchEngineManager.getDefaultEngine();
      return defaultEngine.url + encodeURIComponent(query);
    }

    // 确保 URL 中包含查询参数占位符
    const url = engineConfig.url.includes('%s') ? 
      engineConfig.url.replace('%s', encodeURIComponent(query)) :
      engineConfig.url + encodeURIComponent(query);

    return url;
  }



  // 防抖函

  // 添加这个函数定义

  async function getRecentHistory(limit = 100, maxPerDomain = 5): Promise<RecentHistorySuggestion[]> {
    return new Promise(resolve => {
      chrome.history.search({ text: '', maxResults: limit * 20 }, (historyItems) => {
        const now = Date.now();
        const domainCounts: Record<string, number> = {};
        const uniqueItems = new Map<string, RecentHistorySuggestion>();

        const recentHistory = historyItems
          // 映射并添加额外信息
          .filter((item): item is chrome.history.HistoryItem & { url: string; title: string; lastVisitTime: number } =>
            typeof item.url === 'string' && typeof item.title === 'string' && typeof item.lastVisitTime === 'number')
          .map((item): RecentHistorySuggestion => {
            const url = new URL(item.url);
            const domain = url.hostname;
            return {
              text: item.title,
              url: item.url,
              domain: domain,
              type: 'history',
              relevance: 1,
              timestamp: item.lastVisitTime
            };
          })
          // 按时间排序（最近的优先）
          .sort((a, b) => b.timestamp - a.timestamp)
          // 去重（基于URL和标题）并限制每个域名的数量
          .filter(item => {
            const key = `${item.url}|${item.text}`;
            if (uniqueItems.has(key)) return false;
            
            const domainCount = (domainCounts[item.domain] ?? 0) + 1;
            domainCounts[item.domain] = domainCount;
            if (domainCount > maxPerDomain) return false;
            
            uniqueItems.set(key, item);
            return true;
          })
          // 应用时间衰减因子
          .map(item => {
            const daysSinceLastVisit = (now - item.timestamp) / (1000 * 60 * 60 * 24);
            item.relevance *= Math.exp(-daysSinceLastVisit / RELEVANCE_CONFIG.timeDecayHalfLife);
            return item;
          })
          // 再次排序，这次基于相关性（考虑了时间衰减）
          .sort((a, b) => b.relevance - a.relevance)
          // 限制结果数量
          .slice(0, limit);

        resolve(recentHistory);
      });
    });
  }

  function searchHistory(query: string, maxResults = 200): Promise<chrome.history.HistoryItem[]> {
    return new Promise(resolve => {
      const startTime = new Date().getTime() - (30 * 24 * 60 * 60 * 1000); // 搜索最近30天的历史
      chrome.history.search(
        { 
          text: query, 
          startTime: startTime,
          maxResults: maxResults 
        }, 
        (results) => {
          
          // 对历史记录进行去重
          const uniqueResults = Array.from(new Set(results.map(r => r.url)))
            .map(url => results.find(r => r.url === url))
            .filter((item): item is chrome.history.HistoryItem => item !== undefined);
          resolve(uniqueResults);
        }
      );
    });
  }
  // 获取搜索建议
  async function getSuggestions(query: string) {
    const maxHistoryResults = 200;
    const maxBookmarkResults = 50;
    const maxTotalSuggestions = 50;

    let suggestions: SearchSuggestion[] = [{ text: query, type: 'search', relevance: Infinity }];

    // 获取设置
    const settings = await new Promise<Record<string, unknown>>(resolve => {
      chrome.storage.sync.get(
        ['showHistorySuggestions', 'showBookmarkSuggestions'],
        (rawResult: unknown) => resolve(isUnknownRecord(rawResult) ? rawResult : {})
      );
    });

    // 根据设置获取历史记录建议
    let historySuggestions: SearchSuggestion[] = [];
    if (settings['showHistorySuggestions'] !== false) {
      const historyItems = await searchHistory(query, maxHistoryResults);
      historySuggestions = historyItems
        .filter((item): item is chrome.history.HistoryItem & { title: string; url: string; lastVisitTime: number } =>
          typeof item.title === 'string' && typeof item.url === 'string' && typeof item.lastVisitTime === 'number')
        .map(item => ({
        text: item.title,
        url: item.url,
        type: 'history',
        relevance: calculateRelevance(query, item.title, item.url),
        timestamp: item.lastVisitTime
      }));
    }

    // 根据设置获取书签建议
    let bookmarkSuggestions: SearchSuggestion[] = [];
    if (settings['showBookmarkSuggestions'] !== false) {
      const bookmarkItems = await new Promise<BookmarkNode[]>(resolve => {
        chrome.bookmarks.search(query, resolve);
      });
      bookmarkSuggestions = bookmarkItems.filter((item): item is BookmarkNode & { url: string } => typeof item.url === 'string').slice(0, maxBookmarkResults).map(item => ({
        text: item.title,
        url: item.url,
        type: 'bookmark',
        relevance: calculateRelevance(query, item.title, item.url) * RELEVANCE_CONFIG.bookmarkRelevanceBoost
      }));
    }

    // 合并所有建议
    suggestions.push(
      ...historySuggestions,
      ...bookmarkSuggestions
    );

    // 对结果进行排序和去重
    const uniqueSuggestions = Array.from(new Set(suggestions.map(s => s.url)))
      .map(url => suggestions.find(s => s.url === url))
      .filter((suggestion): suggestion is SearchSuggestion => suggestion !== undefined)
      .sort((a, b) => b.relevance - a.relevance);

    // 平衡和交替显示结果
    const balancedResults = await balanceResults(uniqueSuggestions, maxTotalSuggestions);

    return balancedResults;
  }

  function calculateRelevance(query: string, title: string, url: string) {
    // 基础设置
    const weights = {
      exactTitleMatch: 100,    // 标题完全匹配权重
      exactUrlMatch: 80,       // URL完全匹配权重
      titleStartsWith: 70,     // 标题开头匹配权重
      urlStartsWith: 60,       // URL开头匹配权重
      titleIncludes: 50,       // 标题包含匹配权重
      urlIncludes: 40,         // URL包含匹配权重
      wordMatch: 30,           // 分词匹配权重
      fuzzyMatch: 20           // 模糊匹配权重
    };

    // 数据预处理
    const lowerQuery = query.toLowerCase().trim();
    const lowerTitle = (title || '').toLowerCase().trim();
    const lowerUrl = (url || '').toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/);  // 将查询分词

    let score = 0;

    // 1. 完全匹配检查
    if (lowerTitle === lowerQuery) {
      score += weights.exactTitleMatch;
    }
    if (lowerUrl === lowerQuery) {
      score += weights.exactUrlMatch;
    }

    // 2. 开头匹配检查
    if (lowerTitle.startsWith(lowerQuery)) {
      score += weights.titleStartsWith;
    }
    if (lowerUrl.startsWith(lowerQuery)) {
      score += weights.urlStartsWith;
    }

    // 3. 包含匹配检查
    if (lowerTitle.includes(lowerQuery)) {
      score += weights.titleIncludes;
    }
    if (lowerUrl.includes(lowerQuery)) {
      score += weights.urlIncludes;
    }

    // 4. 分词匹配
    queryWords.forEach((word: string) => {
      if (word.length > 1) {  // 忽略单字符词
        if (lowerTitle.includes(word)) {
          score += weights.wordMatch;
        }
        if (lowerUrl.includes(word)) {
          score += weights.wordMatch / 2;  // URL分词匹配权重较低
        }
      }
    });

    // 5. 模糊匹配（编辑距离）
    if (title) {
      const fuzzyScore = calculateFuzzyMatch(lowerQuery, lowerTitle);
      if (fuzzyScore > 0.8) {  // 相似度阈值
        score += weights.fuzzyMatch * fuzzyScore;
      }
    }

    // 6. 长度惩罚因子（避免过长的结果）
    const lengthPenalty = Math.max(1, Math.log(lowerTitle.length / lowerQuery.length));
    score = score / lengthPenalty;

    return Math.round(score * 100) / 100;  // 保留两位小数
  }

  // 计算模糊匹配分数
  function calculateFuzzyMatch(query: string, text: string) {
    if (query.length === 0 || text.length === 0) return 0;
    if (query === text) return 1;

    const maxLength = Math.max(query.length, text.length);
    const distance = levenshteinDistance(query, text);
    return (maxLength - distance) / maxLength;
  }

  // Levenshtein 距离计算


  // Levenshtein 距离函数（如果之前没有定义的话）
  function levenshteinDistance(a: string, b: string) {
    let previous = Array.from({ length: a.length + 1 }, (_, index) => index);
    for (let row = 1; row <= b.length; row++) {
      const current = [row];
      for (let column = 1; column <= a.length; column++) {
        current[column] = a.charAt(column - 1) === b.charAt(row - 1)
          ? previous[column - 1] ?? 0
          : Math.min(previous[column - 1] ?? 0, current[column - 1] ?? 0, previous[column] ?? 0) + 1;
      }
      previous = current;
    }
    return previous[a.length] ?? 0;
  }

  async function balanceResults(suggestions: SearchSuggestion[], maxResults: number) {
    const currentSuggestion = suggestions.filter(s => s.type === 'search');
    let bookmarks = suggestions.filter(s => s.type === 'bookmark');
    let histories = suggestions.filter(s => s.type === 'history');
    let bingSuggestions = suggestions.filter(s => s.type === 'bing_suggestion');

    // 应用时间衰减因子到历史记录
    const now = Date.now();
    histories = histories.map(h => {
      const daysSinceLastVisit = (now - (h.timestamp ?? now)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastVisit < 7) { // 如果是最近7天内的记录
        h.relevance *= 1.5; // 为最近的记录提供额外的提升
      }
      h.relevance *= Math.exp(-daysSinceLastVisit / RELEVANCE_CONFIG.timeDecayHalfLife);
      return h;
    });

    // 为书签提供轻微的相关性提
    bookmarks = bookmarks.map(b => {
      b.relevance *= RELEVANCE_CONFIG.bookmarkRelevanceBoost;
      return b;
    });

    // 重新排序
    bookmarks.sort((a, b) => b.relevance - a.relevance);
    histories.sort((a, b) => b.relevance - a.relevance);
    bingSuggestions.sort((a, b) => b.relevance - a.relevance);

    const results = [...currentSuggestion];
    const maxEachType = Math.floor((maxResults - 1) / 4); // 现在我们有4种类型
    const appendFirst = (items: SearchSuggestion[]) => {
      const suggestion = items.shift();
      if (suggestion) results.push(suggestion);
    };

    // 交替添加不同类型的建议
    for (let i = 0; i < maxEachType * 4; i++) {
      if (i % 4 === 0 && bookmarks.length > 0) {
        appendFirst(bookmarks);
      } else if (i % 4 === 1 && histories.length > 0) {
        appendFirst(histories);
      } else if (i % 4 === 2 && bingSuggestions.length > 0) {
        appendFirst(bingSuggestions);
      } else if (histories.length > 0) {
        appendFirst(histories);
      }
    }

    // 如果还有空间，添加剩余的最相关项
    while (results.length < maxResults && (bookmarks.length > 0 || histories.length > 0 || bingSuggestions.length > 0)) {
      if (bookmarks.length === 0) {
        if (histories.length === 0) {
          appendFirst(bingSuggestions);
        } else if (bingSuggestions.length === 0) {
          appendFirst(histories);
        } else {
          appendFirst((histories[0]?.relevance ?? 0) > (bingSuggestions[0]?.relevance ?? 0) ? histories : bingSuggestions);
        }
      } else if (histories.length === 0) {
        if (bookmarks.length === 0) {
          appendFirst(bingSuggestions);
        } else if (bingSuggestions.length === 0) {
          appendFirst(bookmarks);
        } else {
          appendFirst((bookmarks[0]?.relevance ?? 0) > (bingSuggestions[0]?.relevance ?? 0) ? bookmarks : bingSuggestions);
        }
      } else if (bingSuggestions.length === 0) {
        appendFirst((bookmarks[0]?.relevance ?? 0) > (histories[0]?.relevance ?? 0) ? bookmarks : histories);
      } else {
        const maxRelevance = Math.max(bookmarks[0]?.relevance ?? 0, histories[0]?.relevance ?? 0, bingSuggestions[0]?.relevance ?? 0);
        if (maxRelevance === bookmarks[0]?.relevance) {
          appendFirst(bookmarks);
        } else if (maxRelevance === histories[0]?.relevance) {
          appendFirst(histories);
        } else {
          appendFirst(bingSuggestions);
        }
      }
    }

    // 计算用户相关性
    const suggestionsWithUserRelevance = await calculateUserRelevance(results);

    // 重新排序，使用 userRelevance 而不是 relevance
    suggestionsWithUserRelevance.sort((a, b) => (b.userRelevance ?? b.relevance) - (a.userRelevance ?? a.relevance));

    return suggestionsWithUserRelevance;
  }

  const USER_BEHAVIOR_KEY = 'userSearchBehavior';

  // 在文件顶部定义 MAX_BEHAVIOR_ENTRIES
  const MAX_BEHAVIOR_ENTRIES = 1000; // 你可以根据需要调整这个值

  // 获取用户行为数据
  async function getUserBehavior(): Promise<SearchBehaviorMap> {
    return new Promise(resolve => {
      chrome.storage.local.get(USER_BEHAVIOR_KEY, (rawResult: unknown) => {
        const rawBehavior = isUnknownRecord(rawResult) ? rawResult[USER_BEHAVIOR_KEY] : undefined;
        const behavior: SearchBehaviorMap = {};
        if (typeof rawBehavior === 'object' && rawBehavior !== null) {
          for (const [key, value] of Object.entries(rawBehavior)) {
            if (typeof value === 'object' && value !== null && 'count' in value && 'lastUsed' in value &&
                typeof value.count === 'number' && typeof value.lastUsed === 'number') {
              behavior[key] = { count: value.count, lastUsed: value.lastUsed };
            }
          }
        }
        resolve(behavior); // 直接返回行为数据，不进行清理
      });
    });
  }

  // 保存用户行为数据
  async function saveUserBehavior(key: string, increment = 1) {
    const behavior = await getUserBehavior();
    const now = Date.now();

    if (!behavior[key]) {
      behavior[key] = { count: 0, lastUsed: now };
    }

    behavior[key].count += increment; // 增加计数
    behavior[key].lastUsed = now; // 更新最后用时间

    // 检查条目数并清理
    if (Object.keys(behavior).length > MAX_BEHAVIOR_ENTRIES) {
      const sortedEntries = Object.entries(behavior)
        .sort(([, a], [, b]) => a.lastUsed - b.lastUsed); // 按最后使用时间排序
      sortedEntries.slice(0, sortedEntries.length - MAX_BEHAVIOR_ENTRIES).forEach(([key]) => {
        delete behavior[key]; // 删除最旧的条目
      });
    }

    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [USER_BEHAVIOR_KEY]: behavior }, () => resolve()); // 直接保存行为数据
    });
  }

  // 计算用户相关性
  async function calculateUserRelevance(suggestions: SearchSuggestion[]) {
    const behavior = await getUserBehavior();
    const now = Date.now();

    return suggestions.map(suggestion => {
      const key = suggestion.url || suggestion.text;
      const behaviorData = behavior[key];

      if (!behaviorData) return { ...suggestion, userRelevance: suggestion.relevance };

      const daysSinceLastUse = (now - behaviorData.lastUsed) / (1000 * 60 * 60 * 24);
      const recencyFactor = Math.exp(-daysSinceLastUse / 30); // 30天的半衰期
      const behaviorScore = behaviorData.count * recencyFactor;

      return {
        ...suggestion,
        userRelevance: suggestion.relevance * (1 + behaviorScore * 0.1) // 增加最多10%的权重
      };
    });
  }

  let allSuggestions: SearchSuggestion[] = [];
  let displayedSuggestions = 0;
  const suggestionsPerLoad = 10; // 每次加载10个建议
    void suggestionsPerLoad;

  let isScrollListenerAttached = false;

  function showSuggestions(suggestions: SearchSuggestion[]) {
    if (suggestions.length === 0) {
      hideSuggestions();
      return;
    }

    allSuggestions = suggestions;
    displayedSuggestions = 0;
    searchSuggestions.innerHTML = '';

    const searchForm = requireElement(document.querySelector('.search-form'), HTMLElement, '.search-form');
    searchForm.classList.add('focused-with-suggestions');

    const suggestionsWrapper = document.querySelector<HTMLElement>('.search-suggestions-wrapper');
    if (suggestionsWrapper) {
      suggestionsWrapper.style.display = 'block';
    }
    searchSuggestions.style.display = 'block';

    // 显示 line-container
    const lineContainer = requireElement(document.getElementById('line-container'), HTMLElement, '#line-container');
    lineContainer.style.display = 'block'; // 显示线条

    // Set a fixed height for the suggestions container
    searchSuggestions.style.maxHeight = '390px'; // Adjust this value as needed
    searchSuggestions.style.overflowY = 'auto';

    loadMoreSuggestions();

    if (!isScrollListenerAttached) {
      searchSuggestions.addEventListener('scroll', throttledHandleScroll);
      isScrollListenerAttached = true;
    }
    setTimeout(() => {
    }, 0);
  }

  function loadMoreSuggestions() {
    if (!Array.isArray(allSuggestions) || allSuggestions.length === 0) {
      return;
    }

    const remainingSuggestions = allSuggestions.length - displayedSuggestions;
    const suggestionsToAdd = Math.min(remainingSuggestions, 10);

    if (suggestionsToAdd <= 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let i = displayedSuggestions; i < displayedSuggestions + suggestionsToAdd; i++) {
      const suggestion = allSuggestions[i];
      if (suggestion === undefined) continue;
      const li = createSuggestionElement(suggestion);
      fragment.appendChild(li);
    }

    searchSuggestions.appendChild(fragment);
    displayedSuggestions += suggestionsToAdd;

  }

  function throttle<TArgs extends unknown[]>(func: (...args: TArgs) => void, limit: number) {
    let inThrottle = false;
    return function(this: unknown, ...args: TArgs) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  const throttledHandleScroll = throttle(function() {
    const scrollPosition = searchSuggestions.scrollTop + searchSuggestions.clientHeight;
    const scrollHeight = searchSuggestions.scrollHeight;
    if (scrollPosition >= scrollHeight - 20 && displayedSuggestions < allSuggestions.length) {
      loadMoreSuggestions();
    }
  }, 200);  // 限制为每200毫秒最多执行一次


  // 修改创建建议元素的函数
  function createSuggestionElement(suggestion: SearchSuggestion) {
    const li = document.createElement('li');
    const displayUrl = suggestion.url ? formatUrl(suggestion.url) : '';
    li.setAttribute('data-type', suggestion.type);
    if (suggestion.url) {
      li.setAttribute('data-url', suggestion.url);
    }
    const searchSvgIcon = `<svg class="suggestion-icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
  <path d="M466.624 890.432a423.296 423.296 0 0 1-423.936-423.04C42.688 233.728 231.936 42.624 466.56 42.624a423.68 423.68 0 0 1 423.936 424.64 437.952 437.952 0 0 1-56.32 213.12 47.872 47.872 0 0 1-64.128 17.28 48 48 0 0 1-17.216-64.256c29.76-50.176 43.84-106.56 43.84-166.144-1.6-183.36-148.608-330.624-330.112-330.624a330.432 330.432 0 0 0-330.112 330.624 329.408 329.408 0 0 0 330.112 330.688c57.92 0 115.776-15.68 165.824-43.904a47.872 47.872 0 0 1 64.128 17.28 48 48 0 0 1-17.152 64.192 443.584 443.584 0 0 1-212.8 54.848z" fill="#334155"></path>
  <path d="M466.624 890.432a423.296 423.296 0 0 1-423.936-423.04c0-75.264 20.288-148.928 56.32-213.12a47.872 47.872 0 0 1 64.128-17.28 48 48 0 0 1 17.216 64.256 342.08 342.08 0 0 0-43.84 166.08c0 181.76 147.072 330.688 330.112 330.688a329.408 329.408 0 0 0 330.112-330.688A330.432 330.432 0 0 0 466.56 136.704c-57.856 0-115.776 15.68-165.824 43.84a47.872 47.872 0 0 1-64.128-17.216 48 48 0 0 1 17.216-64.256A436.032 436.032 0 0 1 466.56 42.688c233.088 0 422.4 189.568 422.4 424.64a422.016 422.016 0 0 1-422.4 423.104z" fill="#334155"></path>
  <path d="M934.4 981.312a44.992 44.992 0 0 1-32.832-14.08l-198.72-199.04c-18.752-18.816-18.752-48.576 0-65.792 18.752-18.816 48.512-18.816 65.728 0l198.656 199.04c18.816 18.752 18.816 48.576 0 65.792a47.68 47.68 0 0 1-32.832 14.08z" fill="#334155"></path>
</svg>`;
    // 限制建议文本的长度
    const maxTextLength = 20; // 你可以根据需要调整这个值
    const truncatedText = suggestion.text.length > maxTextLength 
      ? suggestion.text.substring(0, maxTextLength) + '...' 
      : suggestion.text;

    li.innerHTML = `
    ${suggestion.type === 'search' ? searchSvgIcon : '<span class="material-icons suggestion-icon"></span>'}
    <div class="suggestion-content">
      <span class="suggestion-text" title="${suggestion.text}">${truncatedText}</span>
      ${displayUrl ? `<span class="suggestion-dash">-</span><span class="suggestion-url">${displayUrl}</span>` : ''}
    </div>
    <span class="suggestion-type">${suggestion.type}</span>
  `;

    if (suggestion.url && suggestion.type !== 'search') {
      getFavicon(suggestion.url, (faviconUrl: string) => {
        const iconSpan = li.querySelector<HTMLElement>('.suggestion-icon');
        if (iconSpan) iconSpan.innerHTML = `<img src="${faviconUrl}" alt="" class="favicon">`;
      });
    }

    li.addEventListener('click', async () => {
      if (suggestion.url) {
        const suggestionUrl = suggestion.url;
        // 根据设置决定打开方式
        chrome.storage.sync.get('openSearchInNewTab', (rawResult: unknown) => {
          const openInNewTab = getBooleanProperty(rawResult, 'openSearchInNewTab') !== false; // 默认为 true
          
          if (openInNewTab) {
            window.open(suggestionUrl, '_blank');
          } else {
            window.location.href = suggestionUrl;
          }
        });
        
        await saveUserBehavior(suggestionUrl);
      } else {
        searchInput.value = suggestion.text;
        searchInput.focus();
        queueSearch();
        await saveUserBehavior(suggestion.text);
      }
      hideSuggestions();
    });

    return li;
  }

  function formatUrl(url: string) {
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;

      // 移除 'www.' 前缀（如果存在）
      domain = domain.replace(/^www\./, '');

      // 如果路径不只是 '/'
      let path = urlObj.pathname;
      if (path && path !== '/') {
        // 截断长路径
        path = path.length > 10 ? path.substring(0, 10) + '...' : path;
        domain += path;
      }

      return domain;
    } catch {
      // 如果 URL 解析失败，返回空字符串
      return '';
    }
  }


  // Add this function to fetch favicons
  function getFavicon(url: string, callback: (faviconUrl: string) => void) {
    const faviconURL = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    const img = new Image();
    img.onload = function () {
      callback(faviconURL);
    };
    img.onerror = function () {
      callback(''); // Return an empty string if favicon is not found
    };
    img.src = faviconURL;
  }

  // Add this function to fetch favicon online as a fallback


  // Add this function to cache favicons


  async function showDefaultSuggestions() {
    // 首先检查设置
    const settings = await new Promise<Record<string, unknown>>(resolve => {
      chrome.storage.sync.get(
        ['showHistorySuggestions', 'showBookmarkSuggestions'],
        (rawResult: unknown) => resolve(isUnknownRecord(rawResult) ? rawResult : {})
      );
    });

    let suggestions: SearchSuggestion[] = [];

    // 只有在启用了历史记录建议时才获取历史记录
    if (settings['showHistorySuggestions'] !== false) {
      const recentHistory = await getRecentHistory(20);
      suggestions = suggestions.concat(recentHistory.map((item): SearchSuggestion => ({
        text: item.text,
        url: item.url,
        type: 'history',
        relevance: item.relevance
      })));
    } else {
      // 如果历史记录已关闭且没有搜索词，不显示任何建议
      if (!searchInput.value.trim()) {
        hideSuggestions();
        return;
      }
    }

    // 如果启用了书签建议，可以在这里添加最近的书签
    if (settings['showBookmarkSuggestions'] !== false) {
      const recentBookmarks = await new Promise<BookmarkNode[]>(resolve => {
        chrome.bookmarks.getRecent(10, resolve);
      });
      
      suggestions = suggestions.concat(recentBookmarks.filter((item): item is BookmarkNode & { url: string } => typeof item.url === 'string').map(item => ({
        text: item.title,
        url: item.url,
        type: 'bookmark',
        relevance: 1
      })));
    }

    // 如果没有任何建议，则不显示建议列表
    if (suggestions.length === 0) {
      hideSuggestions();
      return;
    }

    showSuggestions(suggestions);
  }

  // 修改 handleInput 函数
  const handleInput = debounce(async () => {
    const query = searchInput.value.trim();
    showLoadingIndicator();
    
    if (query) {
      const suggestions = await getSuggestions(query);
      hideLoadingIndicator();
      // 移除 length > 1 的判断，因为我们总是想显示搜索建议
      showSuggestions(suggestions);
    } else {
      hideLoadingIndicator();
      showDefaultSuggestions();
    }
    updateSubmitButtonState();
  }, 300);

  // 同样修改 focus 事件监听器
  searchInput.addEventListener('focus', async () => {
    const searchForm = requireElement(document.querySelector('.search-form'), HTMLElement, '.search-form');
    searchForm.classList.add('focused');
    
    if (searchInput.value.trim() === '') {
      await showDefaultSuggestions();
    } else {
      const suggestions = await getSuggestions(searchInput.value.trim());
      // 移除 length > 1 的判断
      showSuggestions(suggestions);
    }
  });

  // 处理输入事件
  searchInput.addEventListener('input', () => {
    handleInput();
    updateSubmitButtonState();
    if (searchInput.value.trim() === '') {
      showDefaultSuggestions();
    }
  });

  // 处理键盘导航
  searchInput.addEventListener('keydown', (e) => {
    const items = searchSuggestions.querySelectorAll<HTMLElement>('li');
    let index = Array.from(items).findIndex(item => item.classList.contains('keyboard-selected'));

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (index < items.length - 1) index++;
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index > 0) index--;
        break;
      case 'Enter':
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          // 处理 Cmd/Ctrl + Enter
          const query = searchInput.value.trim();
          if (query) {
            openAllSearchEngines(query);
          }
        } else if (index !== -1) {
          e.stopPropagation(); // 阻止事件冒泡
          const selectedItem = items[index];
          if (selectedItem === undefined) return;
          const suggestionType = selectedItem.getAttribute('data-type');
          if (suggestionType === 'history' || suggestionType === 'bookmark') {
            const url = selectedItem.getAttribute('data-url');
            if (url) {
              window.open(url, '_blank');
              hideSuggestions();
              return;
            }
          }
          selectedItem.click();
        } else {
          performSearch(searchInput.value.trim());
        }
        return;
      default:
        return;
    }

    items.forEach(item => item.classList.remove('keyboard-selected'));
    if (index !== -1) {
      const selectedItem = items[index];
      if (!selectedItem) return;
      selectedItem.classList.add('keyboard-selected');
      // 只在选择搜索建议时更新输入框的值
      const suggestionType = selectedItem.getAttribute('data-type');
      if (suggestionType === 'search') {
        const suggestionText = selectedItem.querySelector<HTMLElement>('.suggestion-text')?.textContent;
        if (searchInput instanceof HTMLInputElement && suggestionText !== null && suggestionText !== undefined) {
          searchInput.value = suggestionText;
        }
      }
    }
  })

  // 添加防抖函数
  function debounce<TArgs extends unknown[]>(func: (...args: TArgs) => void, wait: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    return function executedFunction(...args: TArgs) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }



  function hideSuggestions() {
    if (isChangingSearchEngine) {
      return; // 如果正在切换搜索引擎，不隐藏建议列表
    }
    const searchForm = requireElement(document.querySelector('.search-form'), HTMLElement, '.search-form');
    searchForm.classList.remove('focused-with-suggestions');

    const suggestionsWrapper = document.querySelector<HTMLElement>('.search-suggestions-wrapper');
    if (suggestionsWrapper) {
      suggestionsWrapper.style.display = 'none';
    }
    if (searchSuggestions) {
      searchSuggestions.style.display = 'none';
      searchSuggestions.innerHTML = ''; // Clear the suggestions
    }

    // 隐藏 line-container
    const lineContainer = requireElement(document.getElementById('line-container'), HTMLElement, '#line-container');
    lineContainer.style.display = 'none'; // 隐藏线条

    if (isScrollListenerAttached) {
      searchSuggestions.removeEventListener('scroll', throttledHandleScroll);
      isScrollListenerAttached = false;
    }

    // Reset suggestions-related variables
    allSuggestions = [];
    displayedSuggestions = 0;
  }

  function showLoadingIndicator() {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
    <svg class="loading-spinner" viewBox="0 0 50 50">
      <circle class="spinner-path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
    </svg>
  `;
    searchSuggestions.appendChild(loadingIndicator);
  }

  function hideLoadingIndicator() {
    const loadingIndicator = searchSuggestions.querySelector<HTMLElement>('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }


  // 修改这个函数
  function openAllSearchEngines(query: string) {
    const enabledEngines = SearchEngineManager.getEnabledEngines();

    const urls = enabledEngines
      .map(engine => getSearchUrl(engine.name, query));

    if (urls.length > 0) {
      window.lastSearchTrigger = 'cmdCtrlEnter';

      chrome.runtime.sendMessage({
        action: 'openMultipleTabsAndGroup',
        urls: urls,
        groupName: query
      }, function (rawResponse: unknown) {
        const response = getOpenMultipleTabsResponse(rawResponse);
        if (!response?.success) {
          console.error('打开多个标签页或创建标签组失败:', response?.error ?? '未知错误');
        }
      });
    } else {
      console.log('没有启用的搜索引擎');
    }
  }
});



// 确保在 DOMContentLoaded 时调用创建函数
document.addEventListener('DOMContentLoaded', function() {
  createSearchEngineDropdown();
  // ... 其他初始化代码 ...
});






  // 在适当时机调用此函数
  document.addEventListener('DOMContentLoaded', setVersionNumber);

  // 修改文档点击事件监听器，同时处理书签和文件夹的上下文菜单
  document.addEventListener('click', function (_event) {
    // 关闭书签上下文菜单
    if (contextMenu) {
      contextMenu.style.display = 'none';
      currentBookmark = null;
    }
    
    // 关闭文件夹上下文菜单
    if (bookmarkFolderContextMenu) {
      bookmarkFolderContextMenu.style.display = 'none';
      currentBookmarkFolder = null;
    }
  });

  // 为上下文菜单添加阻止冒泡，防止点击菜单本身时关闭
  const activeContextMenu = document.querySelector<HTMLElement>('.custom-context-menu');
  if (activeContextMenu) {
    activeContextMenu.addEventListener('click', function(event: Event) {
      event.stopPropagation();
    });
  }

  const activeFolderContextMenu = document.querySelector<HTMLElement>('.bookmark-folder-context-menu');
  if (activeFolderContextMenu) {
    activeFolderContextMenu.addEventListener('click', function(event: Event) {
      event.stopPropagation();
    });
  }

  // 添加一个全局函数用于更新快捷链接显示状态
  function updateQuickLinksVisibility() {
    chrome.storage.sync.get(['enableQuickLinks'], function(rawResult: unknown) {
      const enableQuickLinks = getBooleanProperty(rawResult, 'enableQuickLinks');
      const quickLinksWrapper = document.querySelector<HTMLElement>('.quick-links-wrapper');
      if (quickLinksWrapper) {
        quickLinksWrapper.style.display = enableQuickLinks !== false ? 'flex' : 'none';
      }
    });
  }

  // 监听存储变化
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && changes["enableQuickLinks"]) {
      updateQuickLinksVisibility();
    }
  });

  // 添加搜索引擎变更事件监听
  document.addEventListener('defaultSearchEngineChanged', (event) => {
    if (!(event instanceof CustomEvent) || !isUnknownRecord(event.detail)) return;
    const engine = event.detail['engine'];
    if (typeof engine !== 'string') return;
    console.log('[Search] Default engine changed:', engine);
    // 可以在这里添加其他需要响应搜索引擎变更的逻辑
    createTemporarySearchTabs(); // 添加这行以更新临时搜索标签
  });


  // 新增辅助函数


  async function toggleDefaultFolder(folder: HTMLElement) {
    if (!folder?.dataset?.["id"]) {
      console.error('Invalid folder object:', folder);
      return;
    }

    const folderId = folder.dataset["id"];
    // 根据不同的文件夹元素结构获取文件夹名称
    let folderName;
    if (folder.classList.contains('bookmark-folder')) {
        // 主内容区的文件夹卡片
        folderName = folder.querySelector<HTMLElement>('.card-title')?.textContent;
    } else {
        // 侧边栏的文件夹
        folderName = folder.dataset["title"] || folder.textContent.trim();
    }
    
    console.log('Toggle default folder:', {
        folderId,
        folderName,
        element: folder
    });

    if (!folderName) {
        console.error('Could not find folder name');
        return;
    }

    try {
        const data = await chrome.storage.local.get('defaultFolders');
        let defaultFolders = getDefaultFolders(data["defaultFolders"]);
        const isDefault = defaultFolders.some(f => f.id === folderId);

        if (isDefault) {
            defaultFolders = defaultFolders.filter(f => f.id !== folderId);
            defaultFolders = defaultFolders.map((f, index: number) => ({
                ...f,
                order: index
            }));
            showToast(chrome.i18n.getMessage("removedFromDefaultFolders", [folderName]));
        } else {
            if (defaultFolders.length >= 8) {
                showToast(chrome.i18n.getMessage("maxDefaultFoldersReached"));
                return;
            }
            defaultFolders.push({
                id: folderId,
                name: folderName,
                order: defaultFolders.length
            });
            showToast(chrome.i18n.getMessage("addedToDefaultFolders", [folderName]));
        }

        await chrome.storage.local.set({
            defaultFolders: {
                items: defaultFolders,
                lastUpdated: Date.now()
            }
        });

        // 立即更新UI
        await initDefaultFoldersTabs();

        // 如果是新添加的默认文件夹，自动切换到该文件夹
        if (!isDefault) {
            await switchToFolder(folderId);
        }

        // 触发更新事件
        document.dispatchEvent(new CustomEvent('defaultFoldersChanged', {
            detail: { folders: defaultFolders }
        }));

    } catch (error) {
        console.error('Error toggling default folder:', error instanceof Error ? error : String(error));
        showToast('操作失败，请重试');
    }
  }





  // 监听默认文件夹变化
  document.addEventListener('defaultFoldersChanged', async (_event) => {
    await initDefaultFoldersTabs();
  });

  // 在文档加载完成后初始化
  document.addEventListener('DOMContentLoaded', async () => {
    await initDefaultFoldersTabs();
  });



// 获取版本号并设置
function setVersionNumber() {
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.querySelector<HTMLElement>('.about-version');

  if (versionElement && manifest) {
    // 移除 data-i18n 属性，因为我们要直接设置完整的本地化文本
    versionElement.removeAttribute('data-i18n');
    
    // 获取本地化的版本号文本并设置
    const versionText = chrome.i18n.getMessage('version', [manifest.version]);
    versionElement.textContent = versionText;
  }
}

// 确保在 DOM 加载完成后调用
document.addEventListener('DOMContentLoaded', () => {
  // 延迟一小段时间执行，确保其他初始化完成
  setTimeout(setVersionNumber, 100);
});

function updateDefaultFoldersTabsVisibility() {
  const defaultFoldersTabs = document.querySelector<HTMLElement>('.default-folders-tabs');
  const sidebarContainer = document.getElementById('sidebar-container');
  const tabsContainer = document.querySelector<HTMLElement>('.tabs-container');

  if (!defaultFoldersTabs || !tabsContainer) return;

  // 检查标签数量
  const folderTabs = tabsContainer.querySelectorAll<HTMLElement>('.folder-tab');
  defaultFoldersTabs.classList.toggle('show', folderTabs.length > 1);

  // 处理侧边栏状态
  if (sidebarContainer) {
    defaultFoldersTabs.classList.toggle('sidebar-expanded', !sidebarContainer.classList.contains('collapsed'));
    defaultFoldersTabs.classList.toggle('sidebar-collapsed', sidebarContainer.classList.contains('collapsed'));
  }
}

// 监听侧边栏状态变化
document.addEventListener('DOMContentLoaded', () => {
  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) {
    const observer = new MutationObserver(updateDefaultFoldersTabsVisibility);
    observer.observe(sidebarContainer, { attributes: true, attributeFilter: ['class'] });
  }

  // 初始化状态
  updateDefaultFoldersTabsVisibility();
});

// 在标签更新时调用
document.addEventListener('defaultFoldersChanged', updateDefaultFoldersTabsVisibility);

// 在适当位置添加或修改
function openSettingsModal() {
  // 修改为打开侧边栏
  const settingsSidebar = document.getElementById('settings-sidebar');
  const settingsOverlay = document.getElementById('settings-overlay');
  
  if (settingsSidebar && settingsOverlay) {
    settingsSidebar.classList.add('open');
    settingsOverlay.classList.add('open');
    document.body.style.overflow = 'hidden'; // 防止背景滚动
  } else {
    console.error('Settings sidebar not found');
  }
}

// 确保在 DOMContentLoaded 事件中初始化设置图标点击事件
document.addEventListener('DOMContentLoaded', function() {
  // ... 其他初始化代码 ...
  
  // 设置图标点击事件
  const settingsIcon = document.querySelector<HTMLElement>('.settings-icon a');
  if (settingsIcon) {
    settingsIcon.addEventListener('click', function(e) {
      e.preventDefault();
      openSettingsModal();
    });
  }
  
  // 关闭按钮点击事件
  const closeButton = document.querySelector<HTMLElement>('.settings-sidebar-close');
  if (closeButton) {
    closeButton.addEventListener('click', function() {
      const settingsSidebar = document.getElementById('settings-sidebar');
      const settingsOverlay = document.getElementById('settings-overlay');
      
      settingsSidebar?.classList.remove('open');
      settingsOverlay?.classList.remove('open');
      document.body.style.overflow = ''; // 恢复背景滚动
    });
  }
  
  // 遮罩层点击事件
  const settingsOverlay = document.getElementById('settings-overlay');
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', function() {
      const settingsSidebar = document.getElementById('settings-sidebar');
      
      settingsSidebar?.classList.remove('open');
      settingsOverlay.classList.remove('open');
      document.body.style.overflow = ''; // 恢复背景滚动
    });
  }
});

// 添加滚动指示器功能
function initScrollIndicator() {
  const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
  const bookmarksList = requireElement(document.getElementById('bookmarks-list'), HTMLElement, '#bookmarks-list');
  
  if (!bookmarksContainer) return;
  
  // 创建滚动指示器
  const scrollIndicator = document.createElement('div');
  scrollIndicator.className = 'scroll-indicator';
  scrollIndicator.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="7 13 12 18 17 13"></polyline>
      <polyline points="7 6 12 11 17 6"></polyline>
    </svg>
  `;
  bookmarksContainer.appendChild(scrollIndicator);
  
  // 滚动状态变量
  let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
  let isScrolling = false;
  
  // 检查是否需要滚动
  function checkScrollable() {
    const isScrollable = bookmarksList.scrollHeight > bookmarksList.clientHeight;
    
    if (isScrollable) {
      scrollIndicator.style.display = 'flex';
      // 添加动画类
      if (!scrollIndicator.classList.contains('animate')) {
        scrollIndicator.classList.add('animate');
        // 5秒后移除动画
        setTimeout(() => {
          scrollIndicator.classList.remove('animate');
        }, 5000);
      }
    } else {
      scrollIndicator.style.display = 'none';
    }
  }
  
  // 监听滚动事件
  bookmarksList.addEventListener('scroll', () => {
    // 如果已经滚动到底部，隐藏指示器
    const isAtBottom = bookmarksList.scrollHeight - bookmarksList.scrollTop <= bookmarksList.clientHeight + 10;
    if (isAtBottom) {
      scrollIndicator.style.opacity = '0';
    } else {
      scrollIndicator.style.opacity = '';
    }
    
    // 添加滚动中的类
    if (!isScrolling) {
      isScrolling = true;
      bookmarksList.classList.add('scrolling');
    }
    
    // 清除之前的定时器
    clearTimeout(scrollTimeout);
    
    // 设置新的定时器，滚动停止1.5秒后移除滚动中的类
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
      bookmarksList.classList.remove('scrolling');
    }, 1500);
  });
  
  // 鼠标进入书签列表时，如果可滚动，添加滚动中的类
  bookmarksList.addEventListener('mouseenter', () => {
    if (bookmarksList.scrollHeight > bookmarksList.clientHeight) {
      bookmarksList.classList.add('scrolling');
      
      // 鼠标离开时，如果不在滚动，移除滚动中的类
      const handleMouseLeave = () => {
        if (!isScrolling) {
          bookmarksList.classList.remove('scrolling');
        }
        bookmarksList.removeEventListener('mouseleave', handleMouseLeave);
      };
      
      bookmarksList.addEventListener('mouseleave', handleMouseLeave);
    }
  });
  
  // 初始检查和窗口大小变化时重新检查
  checkScrollable();
  window.addEventListener('resize', debounce({ delay: 200 }, checkScrollable));
  
  // 当书签列表内容变化时重新检查
  const observer = new MutationObserver(debounce({ delay: 200 }, checkScrollable));
  observer.observe(bookmarksList, { childList: true, subtree: true });
  
  // 点击指示器滚动到下一屏
  scrollIndicator.addEventListener('click', () => {
    const currentScroll = bookmarksList.scrollTop;
    const nextScroll = currentScroll + bookmarksList.clientHeight * 0.8;
    bookmarksList.scrollTo({
      top: nextScroll,
      behavior: 'smooth'
    });
    
    // 点击时添加滚动中的类
    bookmarksList.classList.add('scrolling');
    isScrolling = true;
    
    // 清除之前的定时器
    clearTimeout(scrollTimeout);
    
    // 设置新的定时器
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
      bookmarksList.classList.remove('scrolling');
    }, 1500);
  });

  // 监听触摸事件，支持触摸设备
  bookmarksList.addEventListener('touchstart', () => {
    bookmarksList.classList.add('scrolling');
    isScrolling = true;
    
    // 清除之前的定时器
    clearTimeout(scrollTimeout);
  });
  
  bookmarksList.addEventListener('touchend', () => {
    // 设置新的定时器，触摸结束后1.5秒移除滚动中的类
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
      bookmarksList.classList.remove('scrolling');
    }, 1500);
  });
  
  // 初始检查和窗口大小变化时重新检查
}

// 在DOMContentLoaded事件中调用
document.addEventListener('DOMContentLoaded', function() {
  // 初始化虚拟滚动
  initVirtualScroll();
  
  // 初始化滚动指示器
  initScrollIndicator();
  
  // 其他初始化代码...
  startPeriodicSync();
});
