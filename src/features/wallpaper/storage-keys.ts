// 用户上传壁纸在 localStorage 中的引用格式：'idb:<blobId>' 指向 IndexedDB 中的 Blob。
export const IDB_STORAGE_PREFIX = 'idb:';

export function toStorageKey(blobId: string): string {
  return `${IDB_STORAGE_PREFIX}${blobId}`;
}

export function isIdbStorageKey(storageKey: string): boolean {
  return storageKey.startsWith(IDB_STORAGE_PREFIX);
}

export function blobIdFromStorageKey(storageKey: string): string {
  // 非 idb 引用（预设/在线 URL）原样返回，调用方无需先行判别
  return isIdbStorageKey(storageKey)
    ? storageKey.slice(IDB_STORAGE_PREFIX.length)
    : storageKey;
}
