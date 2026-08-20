// allow: SIZE_OK — behavior-preserving migration of the legacy wallpaper controller; structural split is outside this task.
type WallpaperPreset = {
    readonly url: string;
    readonly title: string;
};

type UserWallpaper = WallpaperPreset & {
    readonly timestamp: number;
};

type BingWallpaper = {
    readonly url: string;
    readonly title: string;
    readonly copyright: string;
    readonly date: string;
};

type OnlineWallpaper = {
    readonly url: string;
    readonly thumbnail: string;
};

type ScreenResolution = {
    readonly width: number;
    readonly height: number;
};

declare global {
    interface Window {
        WallpaperManager: typeof WallpaperManager;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 检查 WelcomeManager 是否已经加载
    if (!window.WelcomeManager) {
        console.error('WelcomeManager not found. Make sure welcome.ts is loaded before wallpaper.ts');
    }
    new WallpaperManager();
});

// WallpaperManager 类用于处理所有壁纸相关的操作
export class WallpaperManager {
    private readonly uploadInput: HTMLInputElement | null;
    private readonly mainElement: HTMLElement | null;
    private presetWallpapers: readonly WallpaperPreset[] = [];
    private readonly preloadQueue = new Set<string>();
    private readonly preloadedImages = new Map<string, HTMLImageElement>();
    private userWallpapers: UserWallpaper[] = [];
    private bingWallpapers: readonly BingWallpaper[] = [];
    private wallpaperCache: HTMLImageElement | null = null;
    private readonly onlineWallpapers: readonly OnlineWallpaper[] = [];

    constructor() {
        // 首先初始化所有必要的属性
        this.uploadInput = document.querySelector<HTMLInputElement>('#upload-wallpaper');
        this.mainElement = document.querySelector<HTMLElement>('main');

        // 初始化预设壁纸列表
        this.initializePresetWallpapers();

        // 加载用户壁纸
        this.loadUserWallpapers();

        // 初始化事件监听和其他设置
        this.initializeEventListeners();
        this.initialize();

        // 初始化必应壁纸
        this.initBingWallpapers();
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
        if (Array.isArray(this.presetWallpapers)) {
            this.presetWallpapers.forEach(preset => {
                const option = this.createWallpaperOption(preset.url, preset.title);
                wallpaperContainer.appendChild(option);
            });
        }

        // 添加用户上传的壁纸
        if (Array.isArray(this.userWallpapers)) {
            this.userWallpapers.forEach(wallpaper => {
                const option = this.createWallpaperOption(
                    wallpaper.url,
                    chrome.i18n.getMessage('uploadedWallpaperBadge'),
                    true
                );
                wallpaperContainer.appendChild(option);
            });
        }
    }

    private initialize(): void {
        this.preloadWallpapers();
        this.loadPresetWallpapers();
        this.initializeWallpaper().then(() => {
            document.documentElement.classList.remove('loading-wallpaper');
        });
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

        // 壁纸选项的点击事件
        document.querySelectorAll('.wallpaper-option').forEach(option => {
            option.addEventListener('click', () => {
                this.handleWallpaperOptionClick(option);
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

    private handleWallpaperOptionClick(option: Element): void {
        // 移除所有选项的 active 状态
        this.clearAllActiveStates();

        // 设置当前选项为 active
        option.classList.add('active');
        // 应用壁纸
        const wallpaperUrl = option.getAttribute('data-wallpaper-url');
        this.setWallpaper(wallpaperUrl);

        // 清除纯色背景
        document.documentElement.className = '';
        localStorage.removeItem('useDefaultBackground');
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

    // 优化预加载方法
    private preloadWallpapers(): void {
        this.presetWallpapers.forEach(preset => {
            if (!this.preloadedImages.has(preset.url)) {
                const img = new Image();
                img.src = preset.url;
                this.preloadQueue.add(preset.url);

                img.onload = () => {
                    this.preloadedImages.set(preset.url, img);
                    this.preloadQueue.delete(preset.url);
                };
            }
        });
    }

    // 初始化壁纸状态
    private async initializeWallpaper(): Promise<void> {
        const savedWallpaper = localStorage.getItem('originalWallpaper');
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
            // 如果使用壁纸，查找对应的选项（包括用户上传的壁纸）
            let wallpaperOption = document.querySelector(`.wallpaper-option[data-wallpaper-url="${savedWallpaper}"]`);

            // 如果找不到对应选项，可能是用户上传的壁纸
            if (!wallpaperOption) {
                // 重新加载壁纸选项
                await this.loadPresetWallpapers();
                wallpaperOption = document.querySelector(`.wallpaper-option[data-wallpaper-url="${savedWallpaper}"]`);
            }

            if (wallpaperOption) {
                wallpaperOption.classList.add('active');
            }

            await new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    this.applyWallpaper(savedWallpaper);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = savedWallpaper;
            });
        } else {
            // 如果没有保存的壁纸和背景，使用默认背景
            const defaultBgOption = document.querySelector('.settings-bg-option[data-bg="gradient-background-7"]');
            if (defaultBgOption) {
                defaultBgOption.classList.add('active');
                document.documentElement.className = 'gradient-background-7';
                localStorage.setItem('useDefaultBackground', 'true');
                localStorage.setItem('selectedBackground', 'gradient-background-7');
            }
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

    // 清除壁纸样式
    private clearWallpaper(): void {
        document.body.classList.remove('has-wallpaper');
        document.body.style.removeProperty('--wallpaper-image');
        document.body.style.backgroundImage = 'none';
        if (this.mainElement) {
            this.mainElement.style.backgroundImage = 'none';
        }
    }

    // 修改应用壁纸方法
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
            if (this.mainElement) {
                Object.assign(this.mainElement.style, backgroundStyle);
            }
            Object.assign(document.body.style, backgroundStyle);

            // 更新欢迎消息颜色
            const welcomeElement = document.getElementById('welcome-message');
            if (welcomeElement && window.WelcomeManager) {
                window.WelcomeManager.adjustTextColor(welcomeElement);
            }
        });
    }

    // 设置新壁纸
    private async setWallpaper(url: string | null): Promise<void> {
        if (!url) return;

        try {
            // 如果是 Unsplash 图片，添加优化参数
            if (url.includes('images.unsplash.com')) {
                url = `${url}?q=80&w=1920&auto=format&fit=crop`;
            }

            localStorage.removeItem('useDefaultBackground');
            document.querySelectorAll('.settings-bg-option').forEach(option => {
                option.classList.remove('active');
            });
            document.documentElement.className = '';
            await this.applyAndSaveWallpaper(url);
        } catch (error) {
            console.error('设置壁纸失败:', error instanceof Error ? error : String(error));
            alert('设置壁纸失败，请重试');
        }
    }

    // 修改 applyAndSaveWallpaper 方法
    private async applyAndSaveWallpaper(dataUrl: string): Promise<void> {
        try {
            // 在保存新壁纸前，先清除所有相关的存储
            this.clearWallpaperCache();

            // 压缩图片数据以减少存储大小
            const compressedDataUrl = await this.compressImageForStorage(dataUrl);

            try {
                // 尝试保存压缩后的数据
                localStorage.setItem('originalWallpaper', compressedDataUrl);
            } catch {
                console.warn('无法保存壁纸到本地存储，将只保存在内存中');
            }

            // 更新内存缓存
            if (this.wallpaperCache) {
                URL.revokeObjectURL(this.wallpaperCache.src);
                this.wallpaperCache.src = '';
            }
            this.wallpaperCache = new Image();
            this.wallpaperCache.src = dataUrl;

            // 应用壁纸
            await this.applyWallpaper(dataUrl);
        } catch (error) {
            console.error('Failed to save wallpaper:', error instanceof Error ? error : String(error));
            alert('设置壁纸失败，请重试');
        }
    }

    // 添加新方法：压缩图片数据
    private async compressImageForStorage(dataUrl: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
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

                // 使用较低的质量来减少数据大小
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 1);

                // 清理内存
                URL.revokeObjectURL(img.src);
                resolve(compressedDataUrl);
            };
            img.onerror = () => reject(new DOMException('Wallpaper image failed to load', 'EncodingError'));
            img.src = dataUrl;
        });
    }

    // 创建缩略图
    createThumbnail(dataUrl: string, callback: (thumbnailDataUrl: string) => void): void {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const thumbnailSize = { width: 200, height: 200 };

            canvas.width = thumbnailSize.width;
            canvas.height = thumbnailSize.height;
            if (!ctx) {
                return;
            }
            ctx.drawImage(img, 0, 0, thumbnailSize.width, thumbnailSize.height);

            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            callback(thumbnailDataUrl);
        };
        img.src = dataUrl;
    }

    // 处理文件上传
    private handleFileUpload(event: Event): void {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }
        const file = target.files?.[0];
        if (!this.validateFile(file)) return;

        const reader = new FileReader();

        reader.onload = async () => {
            try {
                if (typeof reader.result !== 'string') {
                    alert(chrome.i18n.getMessage('fileReadError'));
                    return;
                }
                const compressedDataUrl = await this.compressImageForStorage(reader.result);

                // 保存到用户壁纸列表
                this.userWallpapers.unshift({
                    url: compressedDataUrl,
                    title: '自定义壁纸',
                    timestamp: Date.now()
                });

                // 修改限制数量，比如改为10张
                const MAX_WALLPAPERS = 1;
                if (this.userWallpapers.length > MAX_WALLPAPERS) {
                    // 删除最旧的壁纸
                    const removedWallpapers = this.userWallpapers.splice(MAX_WALLPAPERS);
                    // 清理被删除壁纸的资源
                    removedWallpapers.forEach(wallpaper => {
                        if (wallpaper.url) {
                            URL.revokeObjectURL(wallpaper.url);
                        }
                    });
                }

                // 保存到localStorage
                try {
                    localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpapers));
                } catch {
                    console.warn('Storage quota exceeded, removing oldest wallpapers');
                    // 如果存储失败，继续删除旧壁纸直到能够存储为止
                    while (this.userWallpapers.length > 1) {
                        this.userWallpapers.pop();
                        try {
                            localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpapers));
                            break;
                        } catch {
                            continue;
                        }
                    }
                }

                await this.loadPresetWallpapers();
                await this.setWallpaper(compressedDataUrl);

            } catch (error) {
                console.error('处理壁纸时出错:', error instanceof Error ? error : String(error));
                alert('设置壁纸失败，请重试');
            }
        };
        reader.onerror = () => alert(chrome.i18n.getMessage('fileReadError'));
        reader.readAsDataURL(file);

        target.value = '';
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

    // 获取最大屏幕分辨率
    private getMaxScreenResolution(): ScreenResolution {
        const pixelRatio = window.devicePixelRatio || 1;
        let maxWidth = window.screen.width;
        let maxHeight = window.screen.height;

        // 设置基准分辨率为1920x1080
        const baseWidth = 1920;
        const baseHeight = 1080;

        // 如果是高分屏，适当提高分辨率，但不超过2K
        if (pixelRatio > 1) {
            maxWidth = Math.min(maxWidth * pixelRatio, 2560);
            maxHeight = Math.min(maxHeight * pixelRatio, 1440);
        }

        // 返回较小的值：实际分辨率或基准分辨率
        return {
            width: Math.min(maxWidth, baseWidth),
            height: Math.min(maxHeight, baseHeight)
        };
    }

    // 计算最大文件大小
    calculateMaxFileSize(): number {
        const maxResolution = this.getMaxScreenResolution();
        const pixelCount = maxResolution.width * maxResolution.height;
        const baseSize = pixelCount * 4; // 4 bytes per pixel (RGBA)

        // 简化压缩比率
        let compressionRatio = 0.7; // 默认70%质量
        if (pixelCount > 1920 * 1080) {
            compressionRatio = 0.5; // 更高分辨率使用50%质量
        }

        // 限制最终文件大小在2MB到5MB之间
        const maxSize = Math.round(baseSize * compressionRatio);
        return Math.min(Math.max(maxSize, 2 * 1024 * 1024), 5 * 1024 * 1024);
    }

    // 压缩并设置壁纸
    private compressAndSetWallpaper(img: HTMLImageElement, maxResolution: ScreenResolution): void {
        // 先生成并显示低质量预览
        const previewCanvas = document.createElement('canvas');
        const previewCtx = previewCanvas.getContext('2d');
        const previewWidth = Math.round(img.width * 0.1);
        const previewHeight = Math.round(img.height * 0.1);

        previewCanvas.width = previewWidth;
        previewCanvas.height = previewHeight;
        if (!previewCtx) {
            return;
        }
        previewCtx.drawImage(img, 0, 0, previewWidth, previewHeight);

        // 显示模糊预览
        const previewUrl = previewCanvas.toDataURL('image/jpeg', 0.5);
        this.setWallpaper(previewUrl);

        // 然后异步处理高质量版本
        requestAnimationFrame(() => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 保持图片比例
            const ratio = Math.min(
                maxResolution.width / img.width,
                maxResolution.height / img.height
            );

            const width = Math.round(img.width * ratio);
            const height = Math.round(img.height * ratio);

            canvas.width = width;
            canvas.height = height;

            // 使用更好的图像平滑算法
            if (!ctx) {
                return;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);

            // 使用较高的压缩质量
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            this.setWallpaper(compressedDataUrl);
        });
    }

    // 处理图片加载错误
    private handleImageError(event: Event): void {
        if (event.target instanceof HTMLImageElement) {
            console.error('图片加载失败:', event.target.src);
        }
    }

    // 添加新方法：创建壁纸选项元素
    private createWallpaperOption(url: string, title: string, isUploaded = false): HTMLDivElement {
        const option = document.createElement('div');
        option.className = 'wallpaper-option';
        option.dataset['wallpaperUrl'] = url;
        option.title = title;
        option.style.backgroundImage = `url('${url}')`;

        // 如果是上传的壁纸，添加标识
        if (isUploaded) {
            const badge = document.createElement('span');
            badge.className = 'uploaded-wallpaper-badge';
            badge.textContent = chrome.i18n.getMessage('uploadedWallpaperBadge');
            option.appendChild(badge);
        }

        option.addEventListener('click', () => {
            document.querySelectorAll('.settings-bg-option').forEach(opt => {
                opt.classList.remove('active');
            });
            document.querySelectorAll('.wallpaper-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
            document.documentElement.className = '';
            this.setWallpaper(url);
        });

        return option;
    }

    // 新增：生成缩略图方法
    generateThumbnail(imageUrl: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 计算合适的缩略图尺寸
                const maxSize = 150; // 更小的缩略图尺寸
                const ratio = Math.min(maxSize / img.width, maxSize / img.height);
                const width = Math.round(img.width * ratio);
                const height = Math.round(img.height * ratio);

                canvas.width = width;
                canvas.height = height;
                if (!ctx) {
                    reject(new DOMException('Canvas 2D context unavailable', 'InvalidStateError'));
                    return;
                }
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // 使用webp格式（如果浏览器支持）
                if (this.supportsWebP()) {
                    resolve(canvas.toDataURL('image/webp', 0.8));
                } else {
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                }
            };

            img.onerror = () => reject(new DOMException('Wallpaper image failed to load', 'EncodingError'));
            img.src = imageUrl;
        });
    }

    // 检查WebP支持
    private supportsWebP(): boolean {
        const canvas = document.createElement('canvas');
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }

    // 添加清理缓存的方法
    private clearWallpaperCache(): void {
        if (this.wallpaperCache) {
            URL.revokeObjectURL(this.wallpaperCache.src);
            this.wallpaperCache.src = '';
            this.wallpaperCache = null;
        }

        localStorage.removeItem('originalWallpaper');
        localStorage.removeItem('selectedWallpaper');
        localStorage.removeItem('wallpaperThumbnail');
        // 不要清除用户壁纸列表
        // localStorage.removeItem('userWallpapers');
    }

    // 添加加载在线壁纸的方法
    loadOnlineWallpapers(): void {
        const container = document.querySelector('.wallpaper-options-container');
        if (!container) return;

        this.onlineWallpapers.forEach(wallpaper => {
            const option = document.createElement('div');
            option.className = 'wallpaper-option';
            option.setAttribute('data-wallpaper-url', wallpaper.url);

            // 创建缩略图
            const img = document.createElement('img');
            img.src = wallpaper.thumbnail;
            img.alt = 'Online Wallpaper';
            img.className = 'wallpaper-thumbnail';

            option.appendChild(img);
            container.appendChild(option);

            // 添加点击事件
            option.addEventListener('click', () => {
                this.setWallpaper(wallpaper.url);
            });
        });
    }

    // 添加新方法：加载用户壁纸
    private loadUserWallpapers(): void {
        try {
            const savedWallpapers = localStorage.getItem('userWallpapers');
            if (savedWallpapers) {
                const parsed: unknown = JSON.parse(savedWallpapers);
                this.userWallpapers = Array.isArray(parsed)
                    ? parsed.flatMap((wallpaper): UserWallpaper[] => {
                        if (
                            typeof wallpaper !== 'object' ||
                            wallpaper === null ||
                            !('url' in wallpaper) ||
                            typeof wallpaper.url !== 'string'
                        ) {
                            return [];
                        }
                        const title = 'title' in wallpaper && typeof wallpaper.title === 'string'
                            ? wallpaper.title
                            : '自定义壁纸';
                        const timestamp = 'timestamp' in wallpaper && typeof wallpaper.timestamp === 'number'
                            ? wallpaper.timestamp
                            : 0;
                        return [{ url: wallpaper.url, title, timestamp }];
                    })
                    : [];
                // 更新localStorage
                localStorage.setItem('userWallpapers', JSON.stringify(this.userWallpapers));
            }
        } catch (error) {
            console.error('Failed to load user wallpapers:', error instanceof Error ? error : String(error));
            this.userWallpapers = [];
        }
    }

    // 修改 getLocalizedMessage 方法以支持参数
    private getLocalizedMessage(key: string, fallback: string, substitutions: readonly string[] = []): string {
        try {
            const message = chrome.i18n.getMessage(key, [...substitutions]);
            return message || fallback;
        } catch (error) {
            console.warn(
                `Failed to get localized message for key: ${key}`,
                error instanceof Error ? error : String(error)
            );
            if (substitutions.length > 0) {
                // 如果有替换参数，手动替换fallback中的占位符
                return fallback.replace(/\$1/g, substitutions[0] ?? '')
                             .replace(/\$2/g, substitutions[1] ?? '');
            }
            return fallback;
        }
    }

    // 修改显示分辨率警告的代码
    handleFileRead(event: ProgressEvent<FileReader>, file: File, maxSize: number): void {
        const result = event.target?.result;
        if (typeof result !== 'string') {
            alert(this.getLocalizedMessage('fileReadError', '文件读取失败，请重试'));
            return;
        }
        const img = new Image();
        img.onload = () => {
            const maxResolution = this.getMaxScreenResolution();

            if (img.width < maxResolution.width || img.height < maxResolution.height) {
                // 传递分辨率参数
                const warning = this.getLocalizedMessage(
                    'lowResolutionWarning',
                    `图片分辨率过低，建议使用至少 ${maxResolution.width}x${maxResolution.height} 的图片以获得最佳效果`,
                    [maxResolution.width.toString(), maxResolution.height.toString()]
                );
                alert(warning);
            }

            try {
                if (file.size <= maxSize) {
                    this.setWallpaper(result);
                } else {
                    this.compressAndSetWallpaper(img, maxResolution);
                }
            } catch (error) {
                console.error('处理壁纸时出错:', error instanceof Error ? error : String(error));
                alert(this.getLocalizedMessage('wallpaperSetError', '设置壁纸失败，请重试'));
            } finally {
                URL.revokeObjectURL(img.src);
            }
        };
        img.onerror = () => {
            alert(this.getLocalizedMessage('imageLoadError', '图片加载失败，请尝试其他图片'));
            URL.revokeObjectURL(img.src);
        };
        img.src = result;
    }

    // 初始化必应壁纸
    private async initBingWallpapers(): Promise<void> {
        try {
            // 获取8天的必应壁纸
            const wallpapers = await this.fetchBingWallpapers(4);
            this.bingWallpapers = wallpapers;

            // 渲染壁纸
            this.renderBingWallpapers();
        } catch (error) {
            console.error(
                'Failed to initialize Bing wallpapers:',
                error instanceof Error ? error : String(error)
            );
        }
    }

    // 获取必应壁纸
    private async fetchBingWallpapers(count = 4): Promise<readonly BingWallpaper[]> {
        try {
            // 使用中国的必应 API，添加 UHD 参数获取高清壁纸
            const response = await fetch(
                `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=zh-CN&uhd=1&uhdwidth=3840&uhdheight=2160`
            );
            const data: unknown = await response.json();

            if (
                typeof data !== 'object' ||
                data === null ||
                !('images' in data) ||
                !Array.isArray(data.images)
            ) {
                console.error('No images data in response');
                return [];
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
                return [{
                    url: `https://cn.bing.com${image.url}`,
                    title,
                    copyright,
                    date: image.startdate
                }];
            });
        } catch (error) {
            console.error('Failed to fetch Bing wallpapers:', error instanceof Error ? error : String(error));
            return [];
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
        const { url, title, date } = wallpaper;
        const element = document.createElement('div');
        element.className = 'bing-wallpaper-item';
        element.setAttribute('data-wallpaper-url', url);
        element.title = title;
        const thumbnail = document.createElement('div');
        thumbnail.className = 'bing-wallpaper-thumbnail';
        thumbnail.style.backgroundImage = `url("${url}")`;
        const info = document.createElement('div');
        info.className = 'bing-wallpaper-info';
        const titleElement = document.createElement('div');
        titleElement.className = 'bing-wallpaper-title';
        titleElement.textContent = title;
        const dateElement = document.createElement('div');
        dateElement.className = 'bing-wallpaper-date';
        dateElement.textContent = this.formatDate(date);
        info.append(titleElement, dateElement);
        element.append(thumbnail, info);

        // 修改点击事件，使用 handleWallpaperOptionClick
        element.addEventListener('click', () => {
            this.handleWallpaperOptionClick(element);
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
