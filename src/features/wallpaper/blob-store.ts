// 壁纸二进制数据的 IndexedDB 存储层；localStorage 仅保留 'idb:<id>' 形式的键引用。
const DATABASE_NAME = 'markstart-wallpapers';
const STORE_NAME = 'wallpapers';
const DATABASE_VERSION = 1;

// 模块级连接单例：open 成功后缓存，后续读写复用同一连接，不再每次操作重开数据库
let databasePromise: Promise<IDBDatabase> | null = null;
let cachedDatabase: IDBDatabase | null = null;

function forgetCachedDatabase(database: IDBDatabase): void {
  if (cachedDatabase === database) {
    cachedDatabase = null;
    databasePromise = null;
  }
}

function openWallpaperDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      cachedDatabase = database;
      // 连接异常关闭或事务出错时只失效缓存，不破坏状态；下次调用自动重开
      database.onclose = () => forgetCachedDatabase(database);
      database.onerror = () => forgetCachedDatabase(database);
      // 其他上下文请求升级版本时主动让出连接
      database.onversionchange = () => {
        database.close();
        forgetCachedDatabase(database);
      };
      resolve(database);
    };
    request.onerror = () => {
      // open 失败不保留坏缓存，调用方可直接重试
      if (databasePromise === pending) {
        databasePromise = null;
      }
      reject(request.error ?? new Error('Failed to open wallpaper database'));
    };
  });
  databasePromise = pending;
  return pending;
}

export async function putWallpaperBlob(id: string, blob: Blob): Promise<void> {
  const database = await openWallpaperDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to store wallpaper blob'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Wallpaper store transaction aborted'));
  });
}

export async function getWallpaperBlob(id: string): Promise<Blob | null> {
  const database = await openWallpaperDatabase();
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
}

export async function deleteWallpaperBlob(id: string): Promise<void> {
  const database = await openWallpaperDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to delete wallpaper blob'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Wallpaper store transaction aborted'));
  });
}

// dataURL → Blob（旧 localStorage 数据迁移用）
export async function decodeDataUrl(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Failed to decode wallpaper data: ${response.status}`);
  }
  return response.blob();
}
