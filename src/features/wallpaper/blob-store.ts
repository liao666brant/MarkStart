// 壁纸二进制数据的 IndexedDB 存储层；localStorage 仅保留 'idb:<id>' 形式的键引用。
const DATABASE_NAME = 'markstart-wallpapers';
const STORE_NAME = 'wallpapers';
const DATABASE_VERSION = 1;

function openWallpaperDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open wallpaper database'));
  });
}

export async function putWallpaperBlob(id: string, blob: Blob): Promise<void> {
  const database = await openWallpaperDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(blob, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Failed to store wallpaper blob'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Wallpaper store transaction aborted'));
    });
  } finally {
    database.close();
  }
}

export async function getWallpaperBlob(id: string): Promise<Blob | null> {
  const database = await openWallpaperDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(id);
      transaction.oncomplete = () => {
        const result: unknown = request.result;
        resolve(result instanceof Blob ? result : null);
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Failed to read wallpaper blob'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Wallpaper store transaction aborted'));
    });
  } finally {
    database.close();
  }
}

export async function deleteWallpaperBlob(id: string): Promise<void> {
  const database = await openWallpaperDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Failed to delete wallpaper blob'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Wallpaper store transaction aborted'));
    });
  } finally {
    database.close();
  }
}

// dataURL → Blob（旧 localStorage 数据迁移用）
export async function decodeDataUrl(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Failed to decode wallpaper data: ${response.status}`);
  }
  return response.blob();
}
