// 导入所需的依赖
import { ICONS } from '../../shared/icons';

type Dimension = string | number;

function getInput(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
}

function getSelect(id: string): HTMLSelectElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLSelectElement ? element : null;
}

function getStoredBoolean(
  result: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = result[key];
  return typeof value === 'boolean' ? value : defaultValue;
}

function getStoredDimension(
  result: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number,
): Dimension {
  const value = result[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && value !== 0) return value;
  return defaultValue;
}

// 设置管理器类
// allow: SIZE_OK — 行为保持型 TypeScript 迁移保留既有单一设置控制器，拆分会扩大本任务的回归面。
class SettingsManager {
  private readonly settingsSidebar: HTMLElement | null;
  private readonly settingsIcon: HTMLAnchorElement | null;
  private readonly closeButton: HTMLElement | null;
  private readonly tabButtons: NodeListOf<HTMLElement>;
  private readonly tabContents: NodeListOf<HTMLElement>;
  private readonly bgOptions: NodeListOf<HTMLElement>;
  private readonly enableQuickLinksCheckbox: HTMLInputElement | null;
  private readonly openInNewTabCheckbox: HTMLInputElement | null;
  private widthSlider: HTMLInputElement | null;
  private widthValue: HTMLElement | null;
  private widthPreviewCount: HTMLElement | null;
  private showHistorySuggestionsCheckbox: HTMLInputElement | null;
  private showBookmarkSuggestionsCheckbox: HTMLInputElement | null;
  private readonly enableWheelSwitchingCheckbox: HTMLInputElement | null;
  private openSearchInNewTabCheckbox: HTMLInputElement | null;
  private heightSlider: HTMLInputElement | null = null;
  private heightValue: HTMLElement | null = null;
  private containerWidthSlider: HTMLInputElement | null = null;
  private containerWidthValue: HTMLElement | null = null;
  private showSearchBoxCheckbox: HTMLInputElement | null = null;
  private showWelcomeMessageCheckbox: HTMLInputElement | null = null;
  private showFooterCheckbox: HTMLInputElement | null = null;
  private showHistoryLinkCheckbox: HTMLInputElement | null = null;
  private showDownloadsLinkCheckbox: HTMLInputElement | null = null;
  private showPasswordsLinkCheckbox: HTMLInputElement | null = null;
  private showExtensionsLinkCheckbox: HTMLInputElement | null = null;

  constructor() {
    this.settingsSidebar = document.getElementById('settings-sidebar');
    this.settingsIcon = document.querySelector<HTMLAnchorElement>('.settings-icon a');
    this.closeButton = document.querySelector('.settings-sidebar-close');
    this.tabButtons = document.querySelectorAll<HTMLElement>('.settings-tab-button');
    this.tabContents = document.querySelectorAll<HTMLElement>('.settings-tab-content');
    this.bgOptions = document.querySelectorAll<HTMLElement>('.settings-bg-option');
    this.enableQuickLinksCheckbox = getInput('enable-quick-links');
    this.openInNewTabCheckbox = getInput('open-in-new-tab');

    this.widthSlider = getInput('width-slider');
    this.widthValue = document.getElementById('width-value');
    this.widthPreviewCount = document.getElementById('width-preview-count');
    this.showHistorySuggestionsCheckbox = getInput('show-history-suggestions');
    this.showBookmarkSuggestionsCheckbox = getInput('show-bookmark-suggestions');
    this.enableWheelSwitchingCheckbox = getInput('enable-wheel-switching');
    this.openSearchInNewTabCheckbox = getInput('open-search-in-new-tab');
    this.init();
  }

  init() {
    this.loadSavedSettings();
    this.initEventListeners();
    this.initTheme();
    
    // 只在相关元素存在时才调用各个初始化方法
    if (this.enableQuickLinksCheckbox) {
      this.initQuickLinksSettings();
    }
    
    if (this.openInNewTabCheckbox) {
      this.initLinkOpeningSettings();
    }
    
    // 检查宽度设置相关元素
    if (this.widthSlider && this.widthValue) {
      this.initBookmarkWidthSettings();
    }
    
    // 检查高度设置相关元素
    const heightSlider = getInput('height-slider');
    const heightValue = document.getElementById('height-value');
    if (heightSlider && heightValue) {
      this.initCardHeightSettings();
    }
    
    // 检查容器宽度设置相关元素
    const containerWidthSlider = getInput('container-width-slider');
    if (containerWidthSlider) {
      this.initContainerWidthSettings();
    }
    
    // 检查布局设置相关元素
    const showSearchBoxCheckbox = getInput('show-search-box');
    const showWelcomeMessageCheckbox = getInput('show-welcome-message');
    const showFooterCheckbox = getInput('show-footer');
    if (showSearchBoxCheckbox || showWelcomeMessageCheckbox || showFooterCheckbox) {
      this.initLayoutSettings();
    }
    
    // 检查搜索建议设置相关元素
    if (this.showHistorySuggestionsCheckbox || this.showBookmarkSuggestionsCheckbox) {
      this.initSearchSuggestionsSettings();
    }
    
    // 检查滚轮切换设置相关元素
    if (this.enableWheelSwitchingCheckbox) {
      this.initWheelSwitchingTab();
    }
    
  }

  initEventListeners(): void {
    const settingsIcon = this.settingsIcon;
    const settingsSidebar = this.settingsSidebar;
    if (!settingsIcon || !settingsSidebar) return;

    // 打开设置侧边栏
    settingsIcon.addEventListener('click', (e) => {
      e.preventDefault();
      this.openSettingsSidebar();
    });

    // 关闭设置侧边栏
    if (this.closeButton) {
      this.closeButton.addEventListener('click', () => {
        this.closeSettingsSidebar();
        
        // 关闭侧边栏时更新欢迎消息
        if (window.WelcomeManager) {
          window.WelcomeManager.updateWelcomeMessage();
        }
      });
    }

    // 标签切换
    this.tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });

    // 背景颜色选择
    this.bgOptions.forEach(option => {
      option.addEventListener('click', () => this.handleBackgroundChange(option));
    });

    // 添加键盘事件监听，按ESC关闭侧边栏
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.settingsSidebar && this.settingsSidebar.classList.contains('open')) {
        this.closeSettingsSidebar();
      }
    });

    // 添加点击侧边栏外部关闭功能
    document.addEventListener('click', (e) => {
      // 如果侧边栏已打开，且点击的不是侧边栏内部元素
      if (this.settingsSidebar && 
          this.settingsSidebar.classList.contains('open') && 
          e.target instanceof Node &&
          !settingsSidebar.contains(e.target) &&
          !settingsIcon.contains(e.target)) {
        this.closeSettingsSidebar();
        
        // 关闭侧边栏时更新欢迎消息
        if (window.WelcomeManager) {
          window.WelcomeManager.updateWelcomeMessage();
        }
      }
    });
    
    // 阻止侧边栏内部点击事件冒泡到文档
    settingsSidebar.addEventListener('click', (e) => {
      // 如果点击的是链接，不阻止事件冒泡
      if (e.target instanceof Element && (e.target.tagName === 'A' || e.target.closest('a'))) {
        return; // 允许链接点击事件正常传播
      }
      e.stopPropagation();
    });
    
    // 阻止设置图标点击事件冒泡到文档
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 打开设置侧边栏
  openSettingsSidebar(): void {
    if (this.settingsSidebar) {
      this.settingsSidebar.classList.add('open');
      document.getElementById('settings-overlay')?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }
  
  // 关闭设置侧边栏
  closeSettingsSidebar(): void {
    if (this.settingsSidebar) {
      this.settingsSidebar.classList.remove('open');
      document.getElementById('settings-overlay')?.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  switchTab(tabName: string | null): void {
    if (!tabName) return;
    // 移除所有标签的 active 类
    this.tabButtons.forEach(button => {
      button.classList.remove('active');
    });
    
    // 移除所有内容的 active 类
    this.tabContents.forEach(content => {
      content.classList.remove('active');
    });
    
    // 添加当前标签的 active 类
    const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
    const selectedContent = document.getElementById(`${tabName}-settings`);
    
    if (selectedButton && selectedContent) {
      selectedButton.classList.add('active');
      selectedContent.classList.add('active');
      // 更新 UI 语言
      window.updateUILanguage();
      
      // 确保欢迎消息也被更新
      if (window.WelcomeManager) {
        window.WelcomeManager.updateWelcomeMessage();
      }
    }
  }

  handleBackgroundChange(option: HTMLElement): void {
    const bgClass = option.getAttribute('data-bg');
    if (!bgClass) return;
    
    // 移除所有背景选项的 active 状态
    this.bgOptions.forEach(opt => opt.classList.remove('active'));
    
    // 添加当前选项的 active 状态
    option.classList.add('active');
    
    document.documentElement.className = bgClass;
    localStorage.setItem('selectedBackground', bgClass);
    localStorage.setItem('useDefaultBackground', 'true');
    
    // 清除壁纸相关的状态
    this.clearWallpaper();
    
    // 更新欢迎消息
    if (window.WelcomeManager) {
      window.WelcomeManager.updateWelcomeMessage();
    }
  }

  clearWallpaper(): void {
    document.querySelectorAll<HTMLElement>('.wallpaper-option').forEach(opt => {
      opt.classList.remove('active');
    });

    const mainElement = document.querySelector<HTMLElement>('main');
    if (mainElement) {
      mainElement.style.backgroundImage = 'none';
      document.body.style.backgroundImage = 'none';
    }
    localStorage.removeItem('originalWallpaper');

    // 更新欢迎消息颜色
    const welcomeElement = document.getElementById('welcome-message');
    if (welcomeElement && window.WelcomeManager) {
      window.WelcomeManager.adjustTextColor(welcomeElement);
    }
  }

  loadSavedSettings(): void {
    // 加载背景设置
    const savedBg = localStorage.getItem('selectedBackground');
    if (savedBg) {
      document.documentElement.className = savedBg;
      this.bgOptions.forEach(option => {
        if (option.getAttribute('data-bg') === savedBg) {
          option.classList.add('active');
        }
      });
    }
  }

  initTheme(): void {
    const themeSelect = getSelect('theme-select');
    if (!themeSelect) return;
    const savedTheme = localStorage.getItem('theme') || 'auto';
    
    // 设置下拉菜单的初始值
    themeSelect.value = savedTheme;
    
    // 如果是自动模式，根据系统主题设置初始主题
    if (savedTheme === 'auto') {
      this.setThemeBasedOnSystem();
    } else {
      document.documentElement.setAttribute('data-theme', savedTheme);
      this.updateThemeIcon(savedTheme === 'dark');
    }

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
      if (localStorage.getItem('theme') === 'auto') {
        const isDark = e.matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        this.updateThemeIcon(isDark);
      }
    });

    // 监听主题选择变化
    themeSelect.addEventListener('change', () => {
      const selectedTheme = themeSelect.value;
      localStorage.setItem('theme', selectedTheme);
      
      if (selectedTheme === 'auto') {
        this.setThemeBasedOnSystem();
      } else {
        document.documentElement.setAttribute('data-theme', selectedTheme);
        this.updateThemeIcon(selectedTheme === 'dark');
      }
    });

    // 保留原有的主题切换按钮功能
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeSelect.value = newTheme;
        
        this.updateThemeIcon(newTheme === 'dark');
      });
    }
  }

  setThemeBasedOnSystem(): void {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = isDarkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeIcon(isDarkMode);
  }

  updateThemeIcon(isDark: boolean): void {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (!themeToggleBtn) return;
    
    themeToggleBtn.innerHTML = isDark ? ICONS.dark_mode : ICONS.light_mode;
  }

  initQuickLinksSettings(): void {
    const checkbox = this.enableQuickLinksCheckbox;
    if (!checkbox) return;

    // 加载快捷链接设置
    chrome.storage.sync.get(['enableQuickLinks'], (result) => {
      checkbox.checked = getStoredBoolean(result, 'enableQuickLinks', true);
      this.toggleQuickLinksVisibility(checkbox.checked);
    });

    // 监听快捷链接设置变化
    checkbox.addEventListener('change', () => {
      const isEnabled = checkbox.checked;
      chrome.storage.sync.set({ enableQuickLinks: isEnabled }, () => {
        this.toggleQuickLinksVisibility(isEnabled);
      });
    });
  }

  toggleQuickLinksVisibility(show: boolean): void {
    const quickLinksWrapper = document.querySelector<HTMLElement>('.quick-links-wrapper');
    if (quickLinksWrapper) {
      quickLinksWrapper.style.display = show ? 'flex' : 'none';
    }
  }

  initLinkOpeningSettings(): void {
    // 检查元素是否存在
    const checkbox = this.openInNewTabCheckbox;
    if (!checkbox) {
      console.log('openInNewTabCheckbox not found, skipping settings initialization');
      return;
    }
    
    // 加载链接打开方式设置
    chrome.storage.sync.get(['openInNewTab'], (result) => {
      checkbox.checked = getStoredBoolean(result, 'openInNewTab', true);
    });

    // 监听设置变化
    checkbox.addEventListener('change', () => {
      const isEnabled = checkbox.checked;
      chrome.storage.sync.set({ openInNewTab: isEnabled });
    });
    
  }

  initWheelSwitchingTab(): void {
    const tabButton = document.querySelector('[data-tab="wheel-switching"]');
    if (tabButton) {
      tabButton.addEventListener('click', () => {
        this.switchTab('wheel-switching');
      });
    }
    
    // 加载保存的设置
    chrome.storage.sync.get({ enableWheelSwitching: false }, (result) => {
      const checkbox = this.enableWheelSwitchingCheckbox;
      if (checkbox) {
        checkbox.checked = getStoredBoolean(result, 'enableWheelSwitching', false);
        
        // 添加事件监听器
        checkbox.addEventListener('change', () => {
          const isEnabled = checkbox.checked;
          chrome.storage.sync.set({ enableWheelSwitching: isEnabled });
          
          // 触发自定义事件，通知滚轮切换状态变化
          document.dispatchEvent(new CustomEvent('wheelSwitchingChanged', {
            detail: { enabled: isEnabled }
          }));
        });
      }
    });
  }

  // 添加 debounce 方法来优化性能
  debounce(func: () => void, wait: number): () => void {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    return function executedFunction(): void {
      const later = () => {
        if (timeout !== undefined) clearTimeout(timeout);
        func();
      };
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  initBookmarkWidthSettings(): void {
    // 获取元素引用
    this.widthSlider = getInput('width-slider');
    this.widthValue = document.getElementById('width-value');
    this.widthPreviewCount = document.getElementById('width-preview-count');
    
    if (!this.widthSlider || !this.widthValue) {
      console.log('Width slider elements not found, skipping bookmark width settings initialization');
      return;
    }
    const slider = this.widthSlider;
    const valueElement = this.widthValue;
    
    // 从存储中获取保存的宽度值
    chrome.storage.sync.get(['bookmarkWidth'], (result) => {
      const savedWidth = getStoredDimension(result, 'bookmarkWidth', 190); // 默认190px
      slider.value = String(savedWidth);
      valueElement.textContent = String(savedWidth);
      this.updatePreviewCount(savedWidth);
      this.updateBookmarkWidth(savedWidth);
    });
    
    // 监听滑块的变化
    slider.addEventListener('input', () => {
      const width = slider.value;
      valueElement.textContent = width;
      this.updatePreviewCount(width);
      this.updateBookmarkWidth(width);
    });
      
    // 监听滑块的鼠标释放事件
    slider.addEventListener('mouseup', () => {
      // 保存设置
      chrome.storage.sync.set({ bookmarkWidth: slider.value });
    });
        
    // 添加窗口大小改变的监听
    const debouncedUpdate = this.debounce(() => {
      this.updatePreviewCount(slider.value);
    }, 250);
    window.addEventListener('resize', debouncedUpdate);
  }
  
  // 新增书签卡片高度设置函数
  initCardHeightSettings(): void {
    // 获取滑块和显示元素
    this.heightSlider = getInput('height-slider');
    this.heightValue = document.getElementById('height-value');
    
    if (!this.heightSlider || !this.heightValue) {
      console.log('Height slider elements not found, skipping card height settings initialization');
      return;
    }
    const slider = this.heightSlider;
    const valueElement = this.heightValue;
    
    // 从存储中获取保存的高度值
    chrome.storage.sync.get('bookmarkCardHeight', (result) => {
      const savedHeight = getStoredDimension(result, 'bookmarkCardHeight', 48); // 默认值为48px
      
      // 设置滑块和显示值
      slider.value = String(savedHeight);
      valueElement.textContent = String(savedHeight);
      
      // 应用高度设置
      this.updateCardHeight(savedHeight);
    });
    
    // 监听滑块的变化
    slider.addEventListener('input', () => {
      const height = slider.value;
      valueElement.textContent = height;
      this.updateCardHeight(height);
    });
    
    // 监听滑块的鼠标释放事件
    slider.addEventListener('mouseup', () => {
      // 保存设置
      chrome.storage.sync.set({ bookmarkCardHeight: slider.value });
    });
  }
  
  // 更新书签卡片高度
  updateCardHeight(height: Dimension): void {
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
        height: ${height}px !important;
      }
    `;
  }

  updatePreviewCount(width: Dimension): void {
    // 获取书签列表容器
    const bookmarksList = document.getElementById('bookmarks-list');
    if (!bookmarksList) return;

    // 确保容器可见
    const originalDisplay = bookmarksList.style.display;
    if (getComputedStyle(bookmarksList).display === 'none') {
      bookmarksList.style.display = 'grid';
    }

    // 获取容器的实际可用宽度
    const containerStyle = getComputedStyle(bookmarksList);
    const containerWidth = bookmarksList.offsetWidth 
      - parseFloat(containerStyle.paddingLeft) 
      - parseFloat(containerStyle.paddingRight);

    // 还原容器显示状态
    bookmarksList.style.display = originalDisplay;

    // 使用与 CSS Grid 相同的计算逻辑
    const gap = 16; // gap: 1rem
    const minWidth = parseInt(String(width), 10);
    
    // 计算一行能容纳的最大数量
    // 使用 Math.floor 确保不会超出容器宽度
    const count = Math.floor((containerWidth + gap) / (minWidth + gap));
    
    // 更新显示 - 使用本地化文本
    const previewText = chrome.i18n.getMessage("bookmarksPerRow", [String(count)]) || `${count} 个/行`;
    if (this.widthPreviewCount) this.widthPreviewCount.textContent = previewText;
  }

  updateBookmarkWidth(width: Dimension): void {
    // 更新CSS变量
    document.documentElement.style.setProperty('--bookmark-width', width + 'px');
    
    // 更新Grid布局
    const bookmarksList = document.getElementById('bookmarks-list');
    if (bookmarksList) {
      // 使用 minmax 确保最小宽度，但允许在空间足够时扩展
      bookmarksList.style.gridTemplateColumns = `repeat(auto-fit, minmax(${width}px, 1fr))`;
      // 设置 gap
      bookmarksList.style.gap = '1rem';
    }
  }

  initContainerWidthSettings(): void {
    // 获取元素引用
    this.containerWidthSlider = getInput('container-width-slider');
    this.containerWidthValue = document.getElementById('container-width-value');
    
    if (!this.containerWidthSlider || !this.containerWidthValue) {
      console.log('Container width slider elements not found, skipping container width settings initialization');
      return;
    }
    const slider = this.containerWidthSlider;
    const valueElement = this.containerWidthValue;
    
    // 从存储中获取保存的宽度值
    chrome.storage.sync.get(['bookmarkContainerWidth'], (result) => {
      const savedWidth = getStoredDimension(result, 'bookmarkContainerWidth', 85); // 默认85%
      slider.value = String(savedWidth);
      valueElement.textContent = String(savedWidth);
      this.updateContainerWidth(savedWidth);
    });
    
    // 监听滑块的变化
    slider.addEventListener('input', () => {
      const width = slider.value;
      valueElement.textContent = width;
      this.updateContainerWidth(width);
    });
    
    // 监听滑块的鼠标释放事件，保存设置
    slider.addEventListener('mouseup', () => {
      // 保存设置
      chrome.storage.sync.set({ bookmarkContainerWidth: slider.value });
    });
  }

  // 更新书签容器宽度的方法
  updateContainerWidth(widthPercent: Dimension): void {
    const bookmarksContainer = document.querySelector<HTMLElement>('.bookmarks-container');
    if (bookmarksContainer) {
      bookmarksContainer.style.width = `${widthPercent}%`;
    }
  }

  initLayoutSettings(): void {
    // 获取元素引用
    this.showSearchBoxCheckbox = getInput('show-search-box');
    this.showWelcomeMessageCheckbox = getInput('show-welcome-message');
    this.showFooterCheckbox = getInput('show-footer');

    // 添加快捷链接图标的设置
    this.showHistoryLinkCheckbox = getInput('show-history-link');
    this.showDownloadsLinkCheckbox = getInput('show-downloads-link');
    this.showPasswordsLinkCheckbox = getInput('show-passwords-link');
    this.showExtensionsLinkCheckbox = getInput('show-extensions-link');

    const showSearchBoxCheckbox = this.showSearchBoxCheckbox;
    const showWelcomeMessageCheckbox = this.showWelcomeMessageCheckbox;
    const showFooterCheckbox = this.showFooterCheckbox;
    const showHistoryLinkCheckbox = this.showHistoryLinkCheckbox;
    const showDownloadsLinkCheckbox = this.showDownloadsLinkCheckbox;
    const showPasswordsLinkCheckbox = this.showPasswordsLinkCheckbox;
    const showExtensionsLinkCheckbox = this.showExtensionsLinkCheckbox;
    if (
      !showSearchBoxCheckbox ||
      !showWelcomeMessageCheckbox ||
      !showFooterCheckbox ||
      !showHistoryLinkCheckbox ||
      !showDownloadsLinkCheckbox ||
      !showPasswordsLinkCheckbox ||
      !showExtensionsLinkCheckbox
    ) return;

    // 加载保存的设置
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
      (result) => {
        const showSearchBox = getStoredBoolean(result, 'showSearchBox', false);
        const showWelcomeMessage = getStoredBoolean(result, 'showWelcomeMessage', true);
        const showFooter = getStoredBoolean(result, 'showFooter', true);
        const showHistoryLink = getStoredBoolean(result, 'showHistoryLink', true);
        const showDownloadsLink = getStoredBoolean(result, 'showDownloadsLink', true);
        const showPasswordsLink = getStoredBoolean(result, 'showPasswordsLink', true);
        const showExtensionsLink = getStoredBoolean(result, 'showExtensionsLink', true);

        // 设置复选框状态 - 修改搜索框的默认值为 false
        showSearchBoxCheckbox.checked = showSearchBox; // 默认为 false
        showWelcomeMessageCheckbox.checked = showWelcomeMessage;
        showFooterCheckbox.checked = showFooter;
        
        // 设置快捷链接图标的状态
        showHistoryLinkCheckbox.checked = showHistoryLink;
        showDownloadsLinkCheckbox.checked = showDownloadsLink;
        showPasswordsLinkCheckbox.checked = showPasswordsLink;
        showExtensionsLinkCheckbox.checked = showExtensionsLink;
        
        // 应用设置到界面
        this.toggleElementVisibility('#history-link', showHistoryLink);
        this.toggleElementVisibility('#downloads-link', showDownloadsLink);
        this.toggleElementVisibility('#passwords-link', showPasswordsLink);
        this.toggleElementVisibility('#extensions-link', showExtensionsLink);

        // 检查是否所有链接都被隐藏
        const linksContainer = document.querySelector<HTMLElement>('.links-icons');
        if (linksContainer) {
          const allLinksHidden = 
            !showHistoryLink &&
            !showDownloadsLink &&
            !showPasswordsLink &&
            !showExtensionsLink;
          
          linksContainer.style.display = allLinksHidden ? 'none' : '';
        }
      }
    );

    // 监听设置变化
    showSearchBoxCheckbox.addEventListener('change', () => {
      const isVisible = showSearchBoxCheckbox.checked;
      chrome.storage.sync.set({ showSearchBox: isVisible });
      
      // 立即应用设置
      const searchContainer = document.querySelector<HTMLElement>('.search-container');
      if (searchContainer) {
        searchContainer.style.display = isVisible ? '' : 'none';
      }
      
      // 立即更新欢迎语显示
      if (window.WelcomeManager) {
        window.WelcomeManager.updateWelcomeMessage();
      }
    });

    showWelcomeMessageCheckbox.addEventListener('change', () => {
      const isVisible = showWelcomeMessageCheckbox.checked;
      chrome.storage.sync.set({ showWelcomeMessage: isVisible });
      
      // 立即应用设置
      const welcomeMessage = document.getElementById('welcome-message');
      if (welcomeMessage) {
        welcomeMessage.style.display = isVisible ? '' : 'none';
      }
    });

    showFooterCheckbox.addEventListener('change', () => {
      const isVisible = showFooterCheckbox.checked;
      chrome.storage.sync.set({ showFooter: isVisible });
      
      // 立即应用设置
      const footer = document.querySelector<HTMLElement>('footer');
      if (footer) {
        footer.style.display = isVisible ? '' : 'none';
      }
    });

    // 添加事件监听器
    showHistoryLinkCheckbox.addEventListener('change', () => {
      const isVisible = showHistoryLinkCheckbox.checked;
      chrome.storage.sync.set({ showHistoryLink: isVisible });
      this.toggleElementVisibility('#history-link', isVisible);
    });

    showDownloadsLinkCheckbox.addEventListener('change', () => {
      const isVisible = showDownloadsLinkCheckbox.checked;
      chrome.storage.sync.set({ showDownloadsLink: isVisible });
      this.toggleElementVisibility('#downloads-link', isVisible);
    });

    showPasswordsLinkCheckbox.addEventListener('change', () => {
      const isVisible = showPasswordsLinkCheckbox.checked;
      chrome.storage.sync.set({ showPasswordsLink: isVisible });
      this.toggleElementVisibility('#passwords-link', isVisible);
    });

    showExtensionsLinkCheckbox.addEventListener('change', () => {
      const isVisible = showExtensionsLinkCheckbox.checked;
      chrome.storage.sync.set({ showExtensionsLink: isVisible });
      this.toggleElementVisibility('#extensions-link', isVisible);
    });
  }

  // 辅助方法：切换元素可见性
  toggleElementVisibility(selector: string, isVisible: boolean): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.style.display = isVisible ? '' : 'none';
      
      // 特殊处理 links-icons 容器
      if (selector.includes('link')) {
        const linksContainer = document.querySelector<HTMLElement>('.links-icons');
        if (linksContainer) {
          // 检查是否所有链接都被隐藏
          const visibleLinks = Array.from(linksContainer.querySelectorAll<HTMLAnchorElement>('a')).filter(
            link => link.style.display !== 'none'
          ).length;
          
          linksContainer.style.display = visibleLinks === 0 ? 'none' : '';
        }
      }
    }
  }

  initSearchSuggestionsSettings(): void {
    // 获取元素引用
    this.showHistorySuggestionsCheckbox = getInput('show-history-suggestions');
    this.showBookmarkSuggestionsCheckbox = getInput('show-bookmark-suggestions');
    this.openSearchInNewTabCheckbox = getInput('open-search-in-new-tab');
    const historyCheckbox = this.showHistorySuggestionsCheckbox;
    const bookmarkCheckbox = this.showBookmarkSuggestionsCheckbox;
    const newTabCheckbox = this.openSearchInNewTabCheckbox;
    if (!historyCheckbox || !bookmarkCheckbox || !newTabCheckbox) return;
    
    // 加载搜索建议设置
    chrome.storage.sync.get(
      ['showHistorySuggestions', 'showBookmarkSuggestions', 'showSearchBox', 'openSearchInNewTab'], 
      (result) => {
        // 如果设置不存在(undefined)或者没有明确设置为 false,则默认为 true
        historyCheckbox.checked = getStoredBoolean(result, 'showHistorySuggestions', true);
        bookmarkCheckbox.checked = getStoredBoolean(result, 'showBookmarkSuggestions', true);
        newTabCheckbox.checked = getStoredBoolean(result, 'openSearchInNewTab', true);

        // 初始化时如果是新用户(设置不存在),则保存默认值
        if (!Object.hasOwn(result, 'showHistorySuggestions')) {
          chrome.storage.sync.set({ showHistorySuggestions: true });
        }
        if (!Object.hasOwn(result, 'showBookmarkSuggestions')) {
          chrome.storage.sync.set({ showBookmarkSuggestions: true });
        }
        if (!Object.hasOwn(result, 'showSearchBox')) {
          chrome.storage.sync.set({ showSearchBox: false });
        }
        if (!Object.hasOwn(result, 'openSearchInNewTab')) {
          chrome.storage.sync.set({ openSearchInNewTab: true });
        }
      }
    );

    // 监听设置变化
    historyCheckbox.addEventListener('change', () => {
      const isEnabled = historyCheckbox.checked;
      chrome.storage.sync.set({ showHistorySuggestions: isEnabled });
    });

    bookmarkCheckbox.addEventListener('change', () => {
      const isEnabled = bookmarkCheckbox.checked;
      chrome.storage.sync.set({ showBookmarkSuggestions: isEnabled });
    });
    
    newTabCheckbox.addEventListener('change', () => {
      const isEnabled = newTabCheckbox.checked;
      chrome.storage.sync.set({ openSearchInNewTab: isEnabled });
    });
  }

}

// 导出设置管理器实例
export const settingsManager = new SettingsManager();

document.addEventListener('markstart:open-settings', () => settingsManager.openSettingsSidebar());
