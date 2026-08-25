// allow: SIZE_OK — behavior-preserving migration of the legacy wallpaper controller; structural split is outside this task.
import { decodeDataUrl, deleteWallpaperBlob, getWallpaperBlob, putWallpaperBlob } from './blob-store';
import { blobIdFromStorageKey, isIdbStorageKey, toStorageKey } from './storage-keys';

type WallpaperPreset = {
    readonly url: string;
    readonly title: string;
};

type UserWallpaperRef = {
    // storageKey 为 toStorageKey(id) 生成的 'idb:<id>' 引用；其余为直接可用的 URL（预设/在线）
    readonly storageKey: string;
    readonly title: string;
    readonly timestamp: number;
};

type BingWallpaper = {
    // UHD 原图，仅在用户设为壁纸时使用
    readonly url: string;
    // 低分辨率缩略图，设置面板网格展示使用
    readonly thumbnail: string;
    readonly title: string;
    readonly copyright: string;
    readonly date: string;
};

declare global {
    interface Window {
        WallpaperManager: typeof WallpaperManager;
    }
}

// 必应壁纸元数据按日缓存与失败退避所用的存储键与时间参数
const BING_WALLPAPERS_CACHE_KEY = 'bingWallpapersCache';
const BING_FETCH_FAILURE_KEY = 'bingWallpaperFetchFailedAt';
const BING_FETCH_TIMEOUT_MS = 8000;
const BING_FETCH_RETRY_INTERVAL_MS = 30 * 60 * 1000;

function localDateStamp(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

// 缓存条目按 unknown 读回，逐字段窄化后再进入内存
function normalizeCachedBingWallpaper(entry: unknown): BingWallpaper | null {
    if (typeof entry !== 'object' || entry === null) return null;
    if (!('url' in entry) || typeof entry.url !== 'string') return null;
    if (!('thumbnail' in entry) || typeof entry.thumbnail !== 'string') return null;
    if (!('title' in entry) || typeof entry.title !== 'string') return null;
    if (!('copyright' in entry) || typeof entry.copyright !== 'string') return null;
    if (!('date' in entry) || typeof entry.date !== 'string') return null;
    return {
        url: entry.url,
        thumbnail: entry.thumbnail,
        title: entry.title,
        copyright: entry.copyright,
        date: entry.date
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // 检查 WelcomeManager 是否已经加载
    if (!window.WelcomeManager) {
        console.error('WelcomeManager not found. Make sure the onboarding module loads before the wallpaper module');
    }
    new WallpaperManager();
});

// WallpaperManager 类用于处理所有壁纸相关的操作
export class WallpaperManager {
    private readonly uploadInput: HTMLInputElement | null;
    private presetWallpapers: readonly WallpaperPreset[] = [];
    private userWallpaperRefs: UserWallpaperRef[] = [];
    private readonly objectUrls = new Map<string, string>();
    private bingWallpapers: readonly BingWallpaper[] = [];
    private readonly userWallpapersReady: Promise<void>;
    // 数据级选中值：启动路径只记录，设置面板网格真正构建时再应用高亮
    private selectedWallpaperKey: string | null = null;
    private settingsGridPromise: Promise<void> | null = null;

    constructor() {
        // 首先初始化所有必要的属性
        this.uploadInput = document.querySelector<HTMLInputElement>('#upload-wallpaper');

        // 用户壁纸元数据加载与壁纸恢复并行执行；设置面板网格构建前必须等待其完成
        this.userWallpapersReady = this.loadUserWallpapers();

        // 初始化预设壁纸列表与事件监听
        this.initializePresetWallpapers();
        this.initializeEventListeners();
        this.setupLazySettingsGrid();

        // 壁纸恢复依赖 IndexedDB，异步执行
        void this.bootstrap();
    }

    // 壁纸恢复只依赖 localStorage 与单次 IndexedDB 读取，与用户壁纸元数据加载并行执行
    private async bootstrap(): Promise<void> {
        await Promise.all([this.userWallpapersReady, this.initializeWallpaper()]);
    }

    // 新增方法：初始化预设壁纸列表
    private initializePresetWallpapers(): void {
        this.presetWallpapers = [
            {
                url: './../images/wallpapers/wallpaper-1.jpg',
                title: 'Foggy Forest'
            },
            {
                url: './../images/wallpapers/wallpaper-2.jpg',
                title: 'Mountain Lake'
            },
            {
                url: './../images/wallpapers/wallpaper-3.jpg',
                title: 'Sunset Beach'
            },
            {
                url: '../images/wallpapers/wallpaper-4.jpg',
                title: 'City Night'
            },
            {
                url: './../images/wallpapers/wallpaper-5.jpg',
                title: 'Aurora'
            },
            {
                url: './../images/wallpapers/wallpaper-6.jpg',
                title: 'Desert Dunes'
            },
            {
                url: './../images/wallpapers/wallpaper-7.jpg',
                title: 'Mountain View'
            },
            {
                url: './../images/wallpapers/wallpaper-8.jpg',
                title: 'Forest Lake'
            },
            {
                url: './../images/wallpapers/wallpaper-9.jpg',
                title: 'Sunset Hills'
            },
            {
                url: './../images/wallpapers/wallpaper-10.jpg',
                title: 'Ocean View'
            }
        ];
    }

    // 修改 loadPresetWallpapers 方法，添加错误处理
    private async loadPresetWallpapers(): Promise<void> {
        const wallpaperContainer = document.querySelector('.wallpaper-options');
        if (!wallpaperContainer) {
            console.error('Wallpaper container not found');
            return;
        }

        wallpaperContainer.innerHTML = '';

        // 添加预设壁纸
        for (const preset of this.presetWallpapers) {
            wallpaperContainer.appendChild(this.createWallpaperOption(preset.url, preset.title));
        }

        // 添加用户上传的壁纸；IndexedDB 引用并行解析，单条失败跳过且不打断其余渲染
        const uploadedOptions = await Promise.all(
            this.userWallpaperRefs.map(async (ref) => {
                try {
                    const displayUrl = await this.resolveDisplayUrl(ref.storageKey);
                    return this.createWallpaperOption(
                        displayUrl,
                        chrome.i18n.getMessage('uploadedWallpaperBadge'),
                        true,
                        ref.storageKey,
                    );
                } catch (error) {
                    console.warn('跳过无法加载的用户壁纸:', error instanceof Error ? error : String(error));
                    return null;
                }
            })
        );
        for (const option of uploadedOptions) {
            if (option) {
                wallpaperContainer.appendChild(option);
            }
        }
    }

    // 设置侧栏有两个打开入口：设置图标点击与 markstart:open-settings 事件；首次触发时才构建壁纸网格
    private setupLazySettingsGrid(): void {
        const build = (): void => {
            document.removeEventListener('click', onSettingsLinkClick, true);
            document.removeEventListener('markstart:open-settings', onOpenSettingsEvent);
            void this.buildSettingsWallpaperGrids();
        };
        const onSettingsLinkClick = (event: Event): void => {
            if (event.target instanceof Element && event.target.closest('#settings-link')) {
                build();
            }
        };
        const onOpenSettingsEvent = (): void => {
            build();
        };
        // capture 阶段监听，确保先于设置模块在链接元素上的 stopPropagation 执行
        document.addEventListener('click', onSettingsLinkClick, true);
        document.addEventListener('markstart:open-settings', onOpenSettingsEvent);
    }

    // 一次性构建设置面板的预设壁纸网格与必应壁纸网格
    private buildSettingsWallpaperGrids(): Promise<void> {
        if (!this.settingsGridPromise) {
            this.settingsGridPromise = (async () => {
                await this.userWallpapersReady;
                await this.loadPresetWallpapers();
                this.highlightSelectedWallpaperOption();
                await this.initBingWallpapers();
            })();
        }
        return this.settingsGridPromise;
    }

    private initializeEventListeners(): void {
        // 初始化上传事件监听
        this.uploadInput?.addEventListener('change', (event) => this.handleFileUpload(event));

        // 初始化重置按钮事件监听
        const resetButton = document.getElementById('reset-wallpaper');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetWallpaper());
        }

        // 添加图片加载错误处理
        window.addEventListener('error', (e) => this.handleImageError(e), true);

        // 纯色背景选项的点击事件
        document.querySelectorAll('.settings-bg-option').forEach(option => {
            option.addEventListener('click', () => {
                this.handleBackgroundOptionClick(option);
            });
        });
    }

    private handleBackgroundOptionClick(option: Element): void {
        // 移除所有选项的 active 状态
        this.clearAllActiveStates();

        // 设置当前选项为 active
        option.classList.add('active');
        // 应用纯色背景
        const bgClass = option.getAttribute('data-bg');
        if (!bgClass) {
            return;
        }
        // 检查是否为暗黑模式
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDarkMode) {
            // 在暗黑模式下保持暗色背景
            document.documentElement.className = bgClass;
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.className = bgClass;
        }

        // 清除壁纸
        this.clearWallpaper();
        localStorage.setItem('useDefaultBackground', 'true');

        // 更新欢迎消息颜色
        const welcomeElement = document.getElementById('welcome-message');
        if (welcomeElement && window.WelcomeManager) {
            window.WelcomeManager.adjustTextColor(welcomeElement);
        }
    }

    private async handleWallpaperOptionClick(option: Element): Promise<void> {
        const wallpaperUrl = option.getAttribute('data-wallpaper-url');
        // 壁纸验证并提交成功后再切换选中状态，失败时保持当前背景与选中不变
        if (!(await this.setWallpaper(wallpaperUrl))) {
            return;
        }
        this.clearAllActiveStates();
        option.classList.add('active');
    }

    private clearAllActiveStates(): void {
        // 清除所有纯色背景选项的 active 状态
        document.querySelectorAll('.settings-bg-option').forEach(option => {
            option.classList.remove('active');
        });

        // 清除所有壁纸选项的 active 状态
        document.querySelectorAll('.wallpaper-option').forEach(option => {
            option.classList.remove('active');
        });
        // 清除所有必应壁纸选项的 active 状态
        document.querySelectorAll('.bing-wallpaper-item').forEach(option => {
            option.classList.remove('active');
        });
    }

    // 初始化壁纸状态
    private async initializeWallpaper(): Promise<void> {
        let savedWallpaper = localStorage.getItem('originalWallpaper');
        const useDefaultBackground = localStorage.getItem('useDefaultBackground');
        const savedBg = localStorage.getItem('selectedBackground');
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

        // 清除所有选中状态
        this.clearAllActiveStates();

        if (useDefaultBackground === 'true') {
            // 如果使用纯色背景，激活对应的选项
            const bgClass = savedBg || 'gradient-background-7';
            const bgOption = document.querySelector(`.settings-bg-option[data-bg="${bgClass}"]`);

            if (bgOption) {
                bgOption.classList.add('active');
                // 在暗黑模式下保持暗色背景
                if (isDarkMode) {
                    document.documentElement.className = bgClass;
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.className = bgClass;
                }
            }
            return;
        }

        if (savedWallpaper) {
            // 旧版把 dataURL 整串写进 localStorage，首次启动时迁移为 IndexedDB Blob 引用
            savedWallpaper = await this.migrateLegacyStoredWallpaper(savedWallpaper);

            // 记录数据级选中值，网格真正构建时再对比预设列表与用户壁纸引用应用高亮；
            // 启动路径不为高亮强制构建网格
            this.selectedWallpaperKey = savedWallpaper;

            try {
                const displayUrl = await this.resolveDisplayUrl(savedWallpaper);
                await this.waitForImage(displayUrl);
                await this.applyWallpaper(displayUrl);
            } catch (error) {
                console.warn('恢复壁纸失败，清除失效引用并回退默认背景:', error instanceof Error ? error : String(error));
                localStorage.removeItem('originalWallpaper');
                this.clearWallpaper();
                this.applyDefaultBackground();
            }
        } else {
            // 如果没有保存的壁纸和背景，使用默认背景
            this.applyDefaultBackground();
        }
    }

    private applyDefaultBackground(): void {
        this.selectedWallpaperKey = null;
        const defaultBgOption = document.querySelector('.settings-bg-option[data-bg="gradient-background-7"]');
        if (defaultBgOption) {
            defaultBgOption.classList.add('active');
            document.documentElement.className = 'gradient-background-7';
            localStorage.setItem('useDefaultBackground', 'true');
            localStorage.setItem('selectedBackground', 'gradient-background-7');
        }
    }

    // 重置壁纸
    private resetWallpaper(): void {
        // 清除所有选中状态
        this.clearAllActiveStates();
        this.clearWallpaper();

        // 设置默认背景
        const defaultBgOption = document.querySelector('.settings-bg-option[data-bg="gradient-background-7"]');
        if (defaultBgOption) {
            defaultBgOption.classList.add('active');
            document.documentElement.className = 'gradient-background-7';
            // 保存默认背景设置
            localStorage.setItem('useDefaultBackground', 'true');
            localStorage.setItem('selectedBackground', 'gradient-background-7');
        }

        // 使用本地化的成功提示
        alert(chrome.i18n.getMessage('wallpaperResetSuccess'));
    }

    // 清除壁纸样式；单一绘制层只需清理 body
    private clearWallpaper(): void {
        this.selectedWallpaperKey = null;
        document.body.classList.remove('has-wallpaper');
        document.body.style.removeProperty('--wallpaper-image');
        document.body.style.backgroundImage = 'none';
    }

    // 修改应用壁纸方法：壁纸只绘制在 body 一层（浅色走 body inline，深色由 CSS 变量规则绘制）
    private async applyWallpaper(url: string): Promise<void> {
        const backgroundStyle = {
            backgroundImage: `url("${url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed'
        };

        // 使用 requestAnimationFrame 确保样式更新在下一帧执行
        requestAnimationFrame(() => {
            document.body.classList.add('has-wallpaper');
            document.body.style.setProperty('--wallpaper-image', `url("${url}")`);
            Object.assign(document.body.style, backgroundStyle);

            // 更新欢迎消息颜色
            const welcomeElement = document.getElementById('welcome-message');
            if (welcomeElement && window.WelcomeManager) {
                window.WelcomeManager.adjustTextColor(welcomeElement);
            }
        });
    }

    // 设置新壁纸；返回是否成功，失败时由调用方保持原有背景状态
    private async setWallpaper(url: string | null): Promise<boolean> {
        if (!url) return false;

        try {
            // 如果是 Unsplash 图片，添加优化参数
            if (url.includes('images.unsplash.com')) {
                url = `${url}?q=80&w=1920&auto=format&fit=crop`;
            }

            await this.applyAndSaveWallpaper(url);
            return true;
        } catch (error) {
            console.error('设置壁纸失败:', error instanceof Error ? error : String(error));
            alert('设置壁纸失败，请重试');
            return false;
        }
    }

    private async applyAndSaveWallpaper(source: string): Promise<void> {
        // 先完成解析与图片加载，成功后再提交持久化与界面状态，避免失败丢失旧壁纸偏好
        const displayUrl = source.startsWith('idb:') ? await this.resolveDisplayUrl(source) : source;
        await this.waitForImage(displayUrl);

        const previousReference = localStorage.getItem('originalWallpaper');

        // 先写入新值再清理旧键，写入失败时旧引用保持不变
        localStorage.setItem('originalWallpaper', source);
        this.selectedWallpaperKey = source;
        localStorage.removeItem('selectedWallpaper');
        localStorage.removeItem('wallpaperThumbnail');
        localStorage.removeItem('useDefaultBackground');
        document.querySelectorAll('.settings-bg-option').forEach(option => {
            option.classList.remove('active');
        });
        document.documentElement.className = '';

        // 用户上传的壁纸从 IndexedDB 读取 Blob 显示；其余直接使用来源 URL
        await this.applyWallpaper(displayUrl);

        await this.pruneReplacedWallpaper(previousReference, source);
    }

    private async migrateLegacyStoredWallpaper(value: string): Promise<string> {
        if (!value.startsWith('data:')) return value;

        try {
            const blob = await decodeDataUrl(value);
            const id = `wallpaper-${Date.now()}`;
            await putWallpaperBlob(id, blob);
            const storageKey = toStorageKey(id);
            localStorage.setItem('originalWallpaper', storageKey);
            return storageKey;
        } catch (error) {
            console.warn('迁移旧壁纸数据失败，继续使用原有数据:', error instanceof Error ? error : String(error));
            return value;
        }
    }

    private async pruneReplacedWallpaper(previousReference: string | null, currentSource: string): Promise<void> {
        if (!previousReference || !previousReference.startsWith('idb:') || previousReference === currentSource) {
            return;
        }
        // 仍被用户壁纸列表引用的 Blob 与其 Object URL 都要保留（选择器缩略图正在使用）
        if (this.userWallpaperRefs.some((ref) => ref.storageKey === previousReference)) {
            return;
        }
        try {
            await deleteWallpaperBlob(previousReference.slice(4));
            this.revokeObjectUrl(previousReference);
        } catch {
            // 遗留 Blob 清理失败不影响新壁纸展示
        }
    }

    private revokeObjectUrl(storageKey: string): void {
        const objectUrl = this.objectUrls.get(storageKey);
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            this.objectUrls.delete(storageKey);
        }
    }

    private async resolveDisplayUrl(storageKey: string): Promise<string> {
        const cached = this.objectUrls.get(storageKey);
        if (cached) return cached;
        if (!isIdbStorageKey(storageKey)) return storageKey;

        const blob = await getWallpaperBlob(blobIdFromStorageKey(storageKey));
        if (!blob) {
            throw new Error(`Wallpaper blob not found: ${storageKey}`);
        }
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.set(storageKey, objectUrl);
        return objectUrl;
    }

    private waitForImage(src: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Wallpaper image failed to load'));
            img.src = src;
        });
    }

    // 压缩图片为 JPEG Blob 存入 IndexedDB；质量 0.8 与其他压缩路径保持一致
    private async compressImageToBlob(src: string): Promise<Blob> {
        return new Promise<Blob>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 计算压缩后的尺寸，最大宽度1920px
                const maxWidth = 1920;
                const scale = Math.min(1, maxWidth / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                if (!ctx) {
                    reject(new DOMException('Canvas 2D context unavailable', 'InvalidStateError'));
                    return;
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new DOMException('Wallpaper image failed to encode', 'EncodingError'));
                    }
                }, 'image/jpeg', 0.8);
            };
            img.onerror = () => reject(new DOMException('Wallpaper image failed to load', 'EncodingError'));
            img.src = src;
        });
    }

    // 处理文件上传：直接用 objectURL 交给压缩管线，避免 base64 中转带来双份内存开销
    private handleFileUpload(event: Event): void {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }
        const file = target.files?.[0];
        if (!this.validateFile(file)) return;

        const objectUrl = URL.createObjectURL(file);
        // 成功与失败（含图片解码 onerror）路径都释放 objectURL
        void this.processUploadedWallpaper(objectUrl)
            .finally(() => URL.revokeObjectURL(objectUrl));

        target.value = '';
    }

    private async processUploadedWallpaper(objectUrl: string): Promise<void> {
        try {
            // 图片二进制以 Blob 存入 IndexedDB，localStorage 只保留引用与元数据
            const blob = await this.compressImageToBlob(objectUrl);
            const id = `upload-${Date.now()}`;
            await putWallpaperBlob(id, blob);

            this.userWallpaperRefs.unshift({
                storageKey: toStorageKey(id),
                title: '自定义壁纸',
                timestamp: Date.now()
            });

            // 超出上限的旧引用只从列表移除，Blob 延迟到新壁纸提交成功后再删除
            const evictedKeys: string[] = [];
            const MAX_WALLPAPERS = 1;
            if (this.userWallpaperRefs.length > MAX_WALLPAPERS) {
                for (const ref of this.userWallpaperRefs.splice(MAX_WALLPAPERS)) {
                    evictedKeys.push(ref.storageKey);
                }
            }

            // 保存轻量元数据
            try {
                localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpaperRefs));
            } catch {
                console.warn('Storage quota exceeded, removing oldest wallpapers');
                // 如果存储失败，继续收缩列表直到能够存储为止
                while (this.userWallpaperRefs.length > 1) {
                    const removed = this.userWallpaperRefs.pop();
                    if (removed) {
                        evictedKeys.push(removed.storageKey);
                    }
                    try {
                        localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpaperRefs));
                        break;
                    } catch {
                        continue;
                    }
                }
            }

            await this.loadPresetWallpapers();
            await this.setWallpaper(toStorageKey(id));

            // 新壁纸已提交；仍被 originalWallpaper 引用的旧 Blob 需保留，避免应用失败后旧壁纸无法回退
            const activeReference = localStorage.getItem('originalWallpaper');
            for (const key of evictedKeys) {
                if (key !== activeReference) {
                    await this.removeUserWallpaper(key);
                }
            }

        } catch (error) {
            console.error('处理壁纸时出错:', error instanceof Error ? error : String(error));
            alert('设置壁纸失败，请重试');
        }
    }

    // 验证上传的文件
    private validateFile(file: File | undefined): file is File {
        if (!file) return false;
        if (!file.type.startsWith('image/')) {
            alert(chrome.i18n.getMessage('pleaseUploadImage'));
            return false;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert(chrome.i18n.getMessage('imageSizeExceeded'));
            return false;
        }
        return true;
    }

    // 处理图片加载错误
    private handleImageError(event: Event): void {
        if (event.target instanceof HTMLImageElement) {
            console.error('图片加载失败:', this.describeImageSource(event.target.src));
        }
    }

    // dataURL 可能极大，只输出长度摘要避免整段二进制刷屏控制台
    private describeImageSource(src: string): string {
        return src.startsWith('data:') ? `data:<${src.length} chars>` : src;
    }

    // 创建壁纸选项元素；selectorKey 用于稳定标识用户上传壁纸（如 idb:<id>）
    private createWallpaperOption(url: string, title: string, isUploaded = false, selectorKey?: string): HTMLDivElement {
        const option = document.createElement('div');
        option.className = 'wallpaper-option';
        option.dataset['wallpaperUrl'] = selectorKey ?? url;
        option.title = title;
        option.style.backgroundImage = `url('${url}')`;

        // 如果是上传的壁纸，添加标识
        if (isUploaded) {
            const badge = document.createElement('span');
            badge.className = 'uploaded-wallpaper-badge';
            badge.textContent = chrome.i18n.getMessage('uploadedWallpaperBadge');
            option.appendChild(badge);
        }

        option.addEventListener('click', async () => {
            // 壁纸验证并提交成功后再切换选中状态，失败时保持当前背景与选中不变
            if (!(await this.setWallpaper(selectorKey ?? url))) {
                return;
            }
            document.querySelectorAll('.settings-bg-option').forEach(opt => {
                opt.classList.remove('active');
            });
            document.querySelectorAll('.wallpaper-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
        });

        return option;
    }

    // 网格构建完成后应用选中态高亮：数据级对比 localStorage 选中值与预设列表、用户壁纸引用
    private highlightSelectedWallpaperOption(): void {
        const key = this.selectedWallpaperKey;
        if (!key) return;
        const isKnownWallpaper = this.presetWallpapers.some((preset) => preset.url === key)
            || this.userWallpaperRefs.some((ref) => ref.storageKey === key);
        if (!isKnownWallpaper) return;
        const option = document.querySelector(`.wallpaper-option[data-wallpaper-url="${CSS.escape(key)}"]`);
        if (option) {
            option.classList.add('active');
        }
    }

    // 加载用户壁纸元数据；旧版内嵌 dataURL 的条目迁移为 IndexedDB Blob
    private async loadUserWallpapers(): Promise<void> {
        try {
            const savedWallpapers = localStorage.getItem('userWallpapers');
            if (!savedWallpapers) return;

            const parsed: unknown = JSON.parse(savedWallpapers);
            const refs: UserWallpaperRef[] = [];
            if (Array.isArray(parsed)) {
                for (const [index, entry] of parsed.entries()) {
                    const ref = await this.normalizeUserWallpaperEntry(entry, index);
                    if (ref) {
                        refs.push(ref);
                    }
                }
            }
            this.userWallpaperRefs = refs;
            // 仍有 dataURL 条目未迁移成功时保留原持久化内容，仅本次会话内存读取，下次启动重试
            if (refs.some((ref) => ref.storageKey.startsWith('data:'))) {
                return;
            }
            try {
                localStorage.setItem('userWallpapers', JSON.stringify(refs));
            } catch (error) {
                console.warn('持久化用户壁纸元数据失败，下次启动重试:', error instanceof Error ? error : String(error));
            }
        } catch (error) {
            console.error('Failed to load user wallpapers:', error instanceof Error ? error : String(error));
            this.userWallpaperRefs = [];
        }
    }

    // dataURL 迁移为 IndexedDB Blob 引用；失败返回 null，由调用方决定回退方式
    private async migrateDataUrlEntry(url: string, title: string, timestamp: number, index: number): Promise<UserWallpaperRef | null> {
        try {
            const blob = await decodeDataUrl(url);
            const id = `user-${timestamp}-${index}`;
            await putWallpaperBlob(id, blob);
            return { storageKey: toStorageKey(id), title, timestamp };
        } catch (error) {
            console.warn('迁移用户壁纸失败，保留原数据待下次重试:', error instanceof Error ? error : String(error));
            return null;
        }
    }

    private async normalizeUserWallpaperEntry(entry: unknown, index: number): Promise<UserWallpaperRef | null> {
        if (typeof entry !== 'object' || entry === null) {
            return null;
        }
        const title = 'title' in entry && typeof entry.title === 'string'
            ? entry.title
            : '自定义壁纸';
        const timestamp = 'timestamp' in entry && typeof entry.timestamp === 'number'
            ? entry.timestamp
            : 0;

        // 新格式：IndexedDB 引用；此前迁移失败保留的 dataURL 在此重试
        if ('storageKey' in entry) {
            const { storageKey } = entry;
            if (typeof storageKey !== 'string') return null;
            if (storageKey.startsWith('data:')) {
                return (await this.migrateDataUrlEntry(storageKey, title, timestamp, index))
                    ?? { storageKey, title, timestamp };
            }
            return { storageKey, title, timestamp };
        }

        if (!('url' in entry)) return null;
        const url = entry.url;
        if (typeof url !== 'string') return null;

        // 旧格式：内嵌 dataURL，迁移失败时保留原条目避免丢数据
        if (url.startsWith('data:')) {
            return (await this.migrateDataUrlEntry(url, title, timestamp, index))
                ?? { storageKey: url, title, timestamp };
        }

        // 上次会话遗留的 Object URL 已失效，直接丢弃
        if (url.startsWith('blob:')) return null;
        return { storageKey: url, title, timestamp };
    }

    private async removeUserWallpaper(storageKey: string): Promise<void> {
        this.revokeObjectUrl(storageKey);
        if (!storageKey.startsWith('idb:')) return;
        try {
            await deleteWallpaperBlob(storageKey.slice(4));
        } catch (error) {
            console.warn('清理用户壁纸 Blob 失败:', error instanceof Error ? error : String(error));
        }
    }

    // 初始化必应壁纸；设置面板首次打开时才调用
    private async initBingWallpapers(): Promise<void> {
        try {
            this.bingWallpapers = await this.loadBingWallpapers();
            this.renderBingWallpapers();
        } catch (error) {
            console.error(
                'Failed to initialize Bing wallpapers:',
                error instanceof Error ? error : String(error)
            );
        }
    }

    // 优先读取按日缓存的元数据（当天命中不再请求）；失败退避期内跳过请求
    private async loadBingWallpapers(): Promise<readonly BingWallpaper[]> {
        const cached = this.readCachedBingWallpapers();
        if (cached) {
            return cached;
        }
        if (this.isBingFetchInBackoff()) {
            return [];
        }
        try {
            // 获取最近 4 张必应壁纸
            const wallpapers = await this.fetchBingWallpapers(4);
            if (wallpapers.length > 0) {
                this.writeCachedBingWallpapers(wallpapers);
            }
            return wallpapers;
        } catch (error) {
            // 记录失败时间戳，30 分钟内不再重试
            localStorage.setItem(BING_FETCH_FAILURE_KEY, String(Date.now()));
            throw error;
        }
    }

    private readCachedBingWallpapers(): BingWallpaper[] | null {
        try {
            const raw = localStorage.getItem(BING_WALLPAPERS_CACHE_KEY);
            if (!raw) return null;
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) return null;
            if (!('date' in parsed) || typeof parsed.date !== 'string') return null;
            if (parsed.date !== localDateStamp()) return null;
            if (!('wallpapers' in parsed) || !Array.isArray(parsed.wallpapers)) return null;
            const wallpapers: BingWallpaper[] = [];
            for (const entry of parsed.wallpapers) {
                const wallpaper = normalizeCachedBingWallpaper(entry);
                if (wallpaper) {
                    wallpapers.push(wallpaper);
                }
            }
            return wallpapers;
        } catch {
            return null;
        }
    }

    private writeCachedBingWallpapers(wallpapers: readonly BingWallpaper[]): void {
        try {
            localStorage.setItem(BING_WALLPAPERS_CACHE_KEY, JSON.stringify({
                date: localDateStamp(),
                wallpapers
            }));
        } catch (error) {
            console.warn('缓存必应壁纸元数据失败:', error instanceof Error ? error : String(error));
        }
    }

    private isBingFetchInBackoff(): boolean {
        const failedAt = Number(localStorage.getItem(BING_FETCH_FAILURE_KEY));
        return Number.isFinite(failedAt) && Date.now() - failedAt < BING_FETCH_RETRY_INTERVAL_MS;
    }

    // 获取必应壁纸；网络失败、超时或响应结构异常时抛错，由调用方执行退避
    private async fetchBingWallpapers(count = 4): Promise<readonly BingWallpaper[]> {
        // 使用中国的必应 API，添加 UHD 参数获取高清壁纸；8 秒超时避免请求悬挂
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), BING_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(
                `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=zh-CN&uhd=1&uhdwidth=3840&uhdheight=2160`,
                { signal: controller.signal }
            );
            if (!response.ok) {
                throw new Error(`Bing wallpapers request failed: ${response.status}`);
            }
            const data: unknown = await response.json();

            if (
                typeof data !== 'object' ||
                data === null ||
                !('images' in data) ||
                !Array.isArray(data.images)
            ) {
                throw new Error('No images data in response');
            }

            return data.images.flatMap((image): BingWallpaper[] => {
                if (
                    typeof image !== 'object' ||
                    image === null ||
                    !('url' in image) ||
                    typeof image.url !== 'string' ||
                    !('startdate' in image) ||
                    typeof image.startdate !== 'string'
                ) {
                    return [];
                }
                const copyright = 'copyright' in image && typeof image.copyright === 'string'
                    ? image.copyright
                    : '';
                const title = 'title' in image && typeof image.title === 'string' && image.title
                    ? image.title
                    : copyright.split('(')[0]?.trim() || 'Bing Wallpaper';
                const url = `https://cn.bing.com${image.url}`;
                // 网格缩略图用低分辨率版本，点击设为壁纸时才使用 UHD 原图
                const urlbase = 'urlbase' in image && typeof image.urlbase === 'string'
                    ? image.urlbase
                    : null;
                const thumbnail = urlbase ? `https://cn.bing.com${urlbase}_800x480.jpg` : url;
                return [{
                    url,
                    thumbnail,
                    title,
                    copyright,
                    date: image.startdate
                }];
            });
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    // 渲染必应壁纸
    private renderBingWallpapers(): void {
        const container = document.querySelector('.bing-wallpapers-grid');
        if (!container) return;

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        this.bingWallpapers.forEach(wallpaper =>
            fragment.appendChild(this.createBingWallpaperElement(wallpaper))
        );
        container.appendChild(fragment);
    }

    // 创建必应壁纸元素
    private createBingWallpaperElement(wallpaper: BingWallpaper): HTMLDivElement {
        const { url, thumbnail, title, date } = wallpaper;
        const element = document.createElement('div');
        element.className = 'bing-wallpaper-item';
        // 点击设为壁纸时使用 UHD 原图
        element.setAttribute('data-wallpaper-url', url);
        element.title = title;
        const thumbnailElement = document.createElement('div');
        thumbnailElement.className = 'bing-wallpaper-thumbnail';
        thumbnailElement.style.backgroundImage = `url("${thumbnail}")`;
        const info = document.createElement('div');
        info.className = 'bing-wallpaper-info';
        const titleElement = document.createElement('div');
        titleElement.className = 'bing-wallpaper-title';
        titleElement.textContent = title;
        const dateElement = document.createElement('div');
        dateElement.className = 'bing-wallpaper-date';
        dateElement.textContent = this.formatDate(date);
        info.append(titleElement, dateElement);
        element.append(thumbnailElement, info);

        // 修改点击事件，使用 handleWallpaperOptionClick
        element.addEventListener('click', () => {
            void this.handleWallpaperOptionClick(element);
        });

        return element;
    }

    // 格式化日期
    private formatDate(dateStr: string): string {
        const month = Number.parseInt(dateStr.slice(4, 6));
        const day = Number.parseInt(dateStr.slice(6, 8));
        return Number.isNaN(month) || Number.isNaN(day) ? dateStr : `${month}月${day}日`;
    }
}

window.WallpaperManager = WallpaperManager;
