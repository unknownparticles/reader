type CachedChapterContent = {
  key: string;
  itemId: string;
  sourceId: string;
  chapterUrl: string;
  content: string;
  updatedAt: number;
};

export type CachedItemSummary = {
  itemId: string;
  sourceId: string;
  chapterCount: number;
  updatedAt: number;
};

const DB_NAME = 'reader-offline-cache';
const DB_VERSION = 1;
const CHAPTER_STORE = 'chapter-content';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAPTER_STORE)) {
        const store = db.createObjectStore(CHAPTER_STORE, { keyPath: 'key' });
        store.createIndex('by-item', 'itemId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createChapterCacheKey(itemId: string, sourceId: string, chapterUrl: string) {
  return `${itemId}::${sourceId}::${chapterUrl}`;
}

export const contentCacheService = {
  async getChapterContent(itemId: string, sourceId: string, chapterUrl: string) {
    const db = await openDb();
    const tx = db.transaction(CHAPTER_STORE, 'readonly');
    const store = tx.objectStore(CHAPTER_STORE);
    const result = await requestToPromise(store.get(createChapterCacheKey(itemId, sourceId, chapterUrl)) as IDBRequest<CachedChapterContent | undefined>);
    return result?.content || null;
  },

  async saveChapterContent(itemId: string, sourceId: string, chapterUrl: string, content: string) {
    const db = await openDb();
    const tx = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = tx.objectStore(CHAPTER_STORE);

    await requestToPromise(
      store.put({
        key: createChapterCacheKey(itemId, sourceId, chapterUrl),
        itemId,
        sourceId,
        chapterUrl,
        content,
        updatedAt: Date.now(),
      } satisfies CachedChapterContent),
    );
  },

  async listCachedItems(): Promise<CachedItemSummary[]> {
    const db = await openDb();
    const tx = db.transaction(CHAPTER_STORE, 'readonly');
    const store = tx.objectStore(CHAPTER_STORE);
    const rows = await requestToPromise(store.getAll() as IDBRequest<CachedChapterContent[]>);
    const grouped = new Map<string, CachedItemSummary>();

    rows.forEach((row) => {
      const current = grouped.get(row.itemId);
      if (current) {
        current.chapterCount += 1;
        current.updatedAt = Math.max(current.updatedAt, row.updatedAt);
        return;
      }

      grouped.set(row.itemId, {
        itemId: row.itemId,
        sourceId: row.sourceId,
        chapterCount: 1,
        updatedAt: row.updatedAt,
      });
    });

    return Array.from(grouped.values()).sort((left, right) => right.updatedAt - left.updatedAt);
  },

  async clearItemCache(itemId: string) {
    const db = await openDb();
    const tx = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = tx.objectStore(CHAPTER_STORE);
    const index = store.index('by-item');
    const keys = await requestToPromise(index.getAllKeys(itemId));
    await Promise.all(keys.map((key) => requestToPromise(store.delete(key))));
  },

  async clearAll() {
    const db = await openDb();
    const tx = db.transaction(CHAPTER_STORE, 'readwrite');
    const store = tx.objectStore(CHAPTER_STORE);
    await requestToPromise(store.clear());
  },
};
