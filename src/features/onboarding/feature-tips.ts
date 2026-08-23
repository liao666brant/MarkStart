import { ICONS } from '../../shared/icons';

type FeatureTip = {
    readonly featureKey: string;
    readonly storageKey: string;
};

// 新功能提示管理类
// allow: SIZE_OK — 本任务仅迁移既有提示状态机，结构拆分会扩大行为变更面。
class FeatureTips {
    private readonly fadeOutDuration: number;
    private readonly tipQueue: FeatureTip[];
    private isShowingTip: boolean;
    private tipsInitialized: boolean;
    private isProcessing: boolean;
    private checkTimeout: ReturnType<typeof setTimeout> | null;
    private hasCheckedSettingsTip: boolean;
    private domReady: boolean;
    private pageLoaded: boolean;
    private initStarted: boolean;
    private currentVersion: string;
    private hideStyleElement: HTMLStyleElement | null;

    constructor() {
        this.fadeOutDuration = 300; // 淡出动画时长(毫秒)
        this.tipQueue = []; // 提示队列，用于顺序显示提示
        this.isShowingTip = false; // 是否正在显示提示
        this.tipsInitialized = false; // 标记提示是否已初始化
        this.isProcessing = false; // 防止重复处理
        this.checkTimeout = null; // 用于防抖处理
        this.hasCheckedSettingsTip = false; // 标记是否已检查过设置提示
        this.domReady = false; // 标记DOM是否已准备好
        this.pageLoaded = false; // 标记页面是否已完全加载
        this.initStarted = false; // 标记初始化是否已开始
        this.currentVersion = chrome.runtime.getManifest().version;
        this.hideStyleElement = null; // 隐藏样式元素缓存，仅创建一次并复用

        // 立即隐藏所有提示，防止闪烁
        this.hideAllTipsImmediately();

        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.domReady = true;
                this.hideAllTipsImmediately();
                this.startInit();
            });
        } else {
            this.domReady = true;
            this.startInit();
        }

        // 监听页面完全加载
        window.addEventListener('load', () => {
            this.pageLoaded = true;
            this.startInit();
        });
    }

    // 开始初始化流程
    private startInit(): void {
        if (this.initStarted || !this.domReady || !this.pageLoaded) {
            return;
        }
        this.initStarted = true;
        void this.init();
    }

    // 立即隐藏所有提示
    private hideAllTipsImmediately(): void {
        // 使用 style 标签立即隐藏提示，避免 CSS 加载延迟导致的闪烁；样式元素仅创建一次并复用
        if (!this.hideStyleElement) {
            const style = document.createElement('style');
            style.textContent = `
                .settings-update-tip {
                    display: none !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                }
            `;
            style.id = 'feature-tips-style';
            this.hideStyleElement = style;
        }

        // resetTipStyle 展示提示时会把样式元素移出文档，这里按需重新挂载
        if (!this.hideStyleElement.isConnected) {
            document.head.appendChild(this.hideStyleElement);
        }
    }

    // 重置提示样式
    private resetTipStyle(tipContainer: HTMLElement): void {
        // 移除内联样式和之前添加的类
        tipContainer.style.cssText = '';
        tipContainer.classList.remove('tip-fade-out');
        
        // 移除 !important 样式的影响
        const style = document.getElementById('feature-tips-style');
        if (style) {
            style.remove();
        }

        // 设置初始样式
        tipContainer.style.display = 'block';
        tipContainer.style.opacity = '0';
        tipContainer.style.visibility = 'visible';
        
        // 强制重排以确保样式生效
        void tipContainer.offsetHeight;
    }

    // 初始化
    private async init(): Promise<void> {
        try {
            // 获取当前版本号
            this.currentVersion = await this.getExtensionVersion();
            console.log('[FeatureTips] 当前版本:', this.currentVersion);
            
            // 检查版本更新
            await this.checkVersionUpdate();
            
            // 开始处理提示队列
            setTimeout(() => {
                this.processNextTip();
            }, 1000);
        } catch (error) { // no-excuse-ok: catch — top-level UI initialization boundary
            console.error('[FeatureTips] 初始化错误:', error);
        }
    }

    // 获取扩展版本号
    private async getExtensionVersion(): Promise<string> {
        const manifest = chrome.runtime.getManifest();
        return manifest.version;
    }

    // 检查版本更新
    private async checkVersionUpdate(): Promise<void> {
        const lastVersion = localStorage.getItem('lastVersion');
        console.log('[FeatureTips] 当前版本:', this.currentVersion, '上一版本:', lastVersion);

        if (!lastVersion || this.isNewerVersion(this.currentVersion, lastVersion)) {
            // 获取该版本的所有新功能提示
            const features = await this.getVersionFeatures(lastVersion, this.currentVersion);
            console.log('[FeatureTips] 新功能列表:', features);

            // 将新功能提示添加到队列
            for (const feature of features) {
                this.queueShowTips(feature);
            }

            // 更新存储的版本号
            localStorage.setItem('lastVersion', this.currentVersion);
        }
    }

    // 比较版本号
    private isNewerVersion(current: string, last: string | null): boolean {
        if (!last) return true;

        const currentParts = current.split('.').map(Number);
        const lastParts = last.split('.').map(Number);

        for (let i = 0; i < currentParts.length; i++) {
            const currentPart = currentParts[i] ?? 0;
            const lastPart = lastParts[i] ?? 0;
            if (currentPart > lastPart) return true;
            if (currentPart < lastPart) return false;
        }
        return false;
    }

    // 获取版本之间的新功能
    private getVersionFeatures(lastVersion: string | null, currentVersion: string): readonly string[] {
        // 版本功能映射表
        const versionFeatures: Readonly<Record<string, readonly string[]>> = {
            '1.241': ['searchEngineUpdate'],
            '1.243': ['customTab'],
            '1.244': ['shortcuts'],
            '1.245': ['searchSuggestions'],
        };

        const features: string[] = [];

        // 如果是新安装（lastVersion 为 null），只显示当前版本的功能
        if (!lastVersion) {
            const currentFeatures = versionFeatures[currentVersion];
            return currentFeatures ? currentFeatures : [];
        }

        // 获取版本之间的所有新功能
        for (const [version, featureList] of Object.entries(versionFeatures)) {
            if (this.isNewerVersion(version, lastVersion) &&
                !this.isNewerVersion(version, currentVersion)) {
                features.push(...featureList);
            }
        }

        return features;
    }

    // 将提示添加到队列
    private queueShowTips(featureKey: string): void {
        const storageKey = `hasShown${featureKey}Tips`;
        const hasShownTips = localStorage.getItem(storageKey);

        console.log('[FeatureTips] 检查提示:', featureKey, '已显示:', hasShownTips);

        if (!hasShownTips) {
            this.tipQueue.push({
                featureKey,
                storageKey
            });
        }
    }

    // 处理队列中的下一个提示
    private processNextTip(): void {
        // 正在处理中，或队列已空且设置提示已检查过时直接返回。
        // 注意：设置提示检查完成后若队列仍有待显示提示，必须放行继续处理，
        // 否则 closeTips 的续驱调用会被 hasCheckedSettingsTip 短路，队列永久滞留。
        if (this.isProcessing || (this.tipQueue.length === 0 && this.hasCheckedSettingsTip)) {
            return;
        }

        console.log('[FeatureTips] 处理下一个提示, 队列长度:', this.tipQueue.length, '是否正在显示:', this.isShowingTip);
        
        if (this.isShowingTip || this.tipQueue.length === 0) {
            // 如果没有新功能提示或已经显示完，检查是否需要显示设置提示
            if (!this.isShowingTip && this.tipQueue.length === 0 && !this.hasCheckedSettingsTip) {
                console.log('[FeatureTips] 新功能提示队列为空，检查设置提示');
                this.isProcessing = true;
                this.checkSettingsTip();
            }
            return;
        }

        this.isProcessing = true;
        const nextTip = this.tipQueue.shift();
        if (nextTip === undefined) {
            this.isProcessing = false;
            return;
        }
        const { featureKey, storageKey } = nextTip;
        this.isShowingTip = true;

        // 页面不可见时 requestAnimationFrame 永不触发，会让状态机卡死，改用 setTimeout(0)
        setTimeout(() => {
            this.showTips(featureKey);
            localStorage.setItem(storageKey, 'true');
        }, 0);
    }

    // 检查是否需要显示设置提示
    private checkSettingsTip(): void {
        if (this.checkTimeout) {
            clearTimeout(this.checkTimeout);
        }

        // 如果已经检查过设置提示，直接返回
        if (this.hasCheckedSettingsTip && localStorage.getItem('settingsUpdateTipShown') === 'true') {
            this.isProcessing = false;
            return;
        }

        this.hasCheckedSettingsTip = true;
        this.checkTimeout = setTimeout(() => {
            const settingsTipShown = localStorage.getItem('settingsUpdateTipShown') === 'true';
            if (!settingsTipShown) {
                console.log('[FeatureTips] 显示设置提示');
                this.showSettingsUpdateTip();
            } else {
                this.isProcessing = false;
            }
        }, 100);
    }

    // 显示新功能提示
    private showTips(featureKey: string): void {
        console.log('[FeatureTips] 显示提示:', featureKey);

        const tipsElement = document.createElement('div');
        tipsElement.className = 'feature-tips';

        const content = document.createElement('div');
        content.className = 'feature-tips-content';

        const tipContent = document.createElement('div');
        tipContent.className = 'tip-content';

        // 图标为受信静态 SVG 常量，仅在此处注入
        tipContent.innerHTML = ICONS['info'];

        const tipText = document.createElement('div');
        tipText.className = 'tip-text';

        const title = document.createElement('div');
        title.className = 'feature-tips-title';
        title.textContent = chrome.i18n.getMessage('newFeatureTitle');

        // 消息文本中的 \n 转换为 <br> 元素，等价于原 innerHTML 模板
        const description = document.createElement('div');
        description.className = 'feature-description';
        const messageLines = chrome.i18n.getMessage(featureKey + 'Feature').split('\n');
        messageLines.forEach((line, index) => {
            if (index > 0) {
                description.appendChild(document.createElement('br'));
            }
            description.appendChild(document.createTextNode(line));
        });

        tipText.append(title, description);

        const closeButton = document.createElement('button');
        closeButton.className = 'tip-close';
        closeButton.setAttribute('aria-label', '关闭提示');
        closeButton.innerHTML = ICONS['close'];

        tipContent.append(tipText, closeButton);
        content.appendChild(tipContent);
        tipsElement.appendChild(content);

        document.body.appendChild(tipsElement);

        // 添加关闭按钮事件监听
        closeButton.addEventListener('click', () => {
            this.closeTips(tipsElement);
        });
    }

    // 关闭提示
    private closeTips(tipsElement: HTMLElement): void {
        tipsElement.style.opacity = '0';
        setTimeout(() => {
            tipsElement.remove();
            this.isShowingTip = false;
            this.isProcessing = false; // 重置处理状态
            // 处理队列中的下一个提示
            this.processNextTip();
        }, this.fadeOutDuration);
    }

    // 初始化所有提示
    initAllTips(): void {
        // 防止重复初始化
        if (this.tipsInitialized) {
            return;
        }
        this.tipsInitialized = true;
        
        // 重置检查状态
        this.hasCheckedSettingsTip = false;
        
        // 确保DOM已完全加载
        if (!this.domReady || !this.pageLoaded) {
            return;
        }

        // 预先隐藏所有提示
        this.hideAllTipsImmediately();
        
        // 开始检查提示
        this.startTipsCheck();
    }

    // 显示设置更新提示
    private showSettingsUpdateTip(): void {
        if (this.isShowingTip || !this.domReady || !this.pageLoaded) {
            return;
        }
        
        // 检查localStorage，如果已经显示过，直接返回
        if (localStorage.getItem('settingsUpdateTipShown') === 'true') {
            this.isShowingTip = false;
            this.isProcessing = false;
            return;
        }
        
        this.isShowingTip = true;
        const tipContainer = document.querySelector<HTMLElement>('.settings-update-tip');
        if (tipContainer) {
            console.log('[FeatureTips] 显示设置更新提示');
            
            // 重置提示样式
            this.resetTipStyle(tipContainer);
            
            // 使用 requestAnimationFrame 和 setTimeout 确保动画平滑
            requestAnimationFrame(() => {
                setTimeout(() => {
                    tipContainer.style.opacity = '1';
                }, 50);
            });

            const closeButton = tipContainer.querySelector<HTMLElement>('.tip-close');
            if (closeButton) {
                const newCloseButton = closeButton.cloneNode(true);
                closeButton.replaceWith(newCloseButton);
                
                newCloseButton.addEventListener('click', () => {
                    tipContainer.classList.add('tip-fade-out');
                    tipContainer.style.opacity = '0';
                    setTimeout(() => {
                        tipContainer.style.display = 'none';
                        localStorage.setItem('settingsUpdateTipShown', 'true');
                        this.isShowingTip = false;
                        this.isProcessing = false;
                    }, 300);
                });
            } else {
                console.warn('[FeatureTips] 设置提示关闭按钮未找到');
                this.isShowingTip = false;
                this.isProcessing = false;
            }
        } else {
            console.warn('[FeatureTips] 设置提示容器未找到');
            this.isShowingTip = false;
            this.isProcessing = false;
        }
    }

    // 开始检查提示
    private startTipsCheck(): void {
        if (this.checkTimeout) {
            clearTimeout(this.checkTimeout);
        }

        // 确保页面和DOM都已加载完成
        if (!this.domReady || !this.pageLoaded) {
            return;
        }

        this.checkTimeout = setTimeout(() => {
            if (this.tipQueue.length === 0 && !this.isShowingTip && !this.isProcessing) {
                this.processNextTip();
            }
        }, 1000);
    }
}

// 导出单例实例
export const featureTips = new FeatureTips();
