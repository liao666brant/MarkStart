// 上次壁纸的低清预览：新标签页启动时先铺这张小图，避免远程/大图加载期间露出空白背景。
// 预览只在 source 与当前 originalWallpaper 引用一致时使用，换壁纸后会整体覆盖。
import { isIdbStorageKey } from './storage-keys';

export const WALLPAPER_PREVIEW_KEY = 'wallpaperPreview';

// 预览宽度上限（像素）：160 宽已足够铺底，编码后约数 KB
export const WALLPAPER_PREVIEW_WIDTH = 160;

// 内联图片数据长度上限：编码器回退到 PNG 时体积会明显变大，宁可不存
const MAX_DATA_URL_LENGTH = 40000;

// source 只可能是 'idb:<id>'、相对预设路径或在线地址；超长字符串（如旧版 dataURL）不写入
const MAX_SOURCE_LENGTH = 2048;

export type WallpaperPreview = {
  readonly source: string;
  readonly dataUrl: string;
};

// 在线地址需要下载、IndexedDB Blob 需要异步读回并解码，这两类来源在启动期无法立即绘制，
// 才需要低清预览铺底；本地预设图已由 startup-wallpaper.js 在首帧直接绘制
export function shouldUseStartupPreview(source: string): boolean {
  return source.startsWith('http') || isIdbStorageKey(source);
}

// 写入前的准入校验：来源可识别且是内联图片数据
export function toWallpaperPreview(source: string, dataUrl: string): WallpaperPreview | null {
  if (source.length === 0 || source.length > MAX_SOURCE_LENGTH) return null;
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_DATA_URL_LENGTH) return null;
  return { source, dataUrl };
}

// 存储值按 unknown 读回并逐字段窄化，损坏或超限的条目一律视为没有预览
export function parseWallpaperPreview(raw: string | null): WallpaperPreview | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('source' in parsed) || typeof parsed.source !== 'string') return null;
    if (!('dataUrl' in parsed) || typeof parsed.dataUrl !== 'string') return null;
    return toWallpaperPreview(parsed.source, parsed.dataUrl);
  } catch {
    return null;
  }
}
