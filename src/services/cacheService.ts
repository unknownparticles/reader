import { Chapter, MediaItem } from '../types';

const SEARCH_CACHE_KEY = 'app_search_result_cache';
const DETAILS_CACHE_KEY = 'app_details_cache';
const SEARCH_CACHE_TTL = 1000 * 60 * 30;
const DETAILS_CACHE_TTL = 1000 * 60 * 60 * 12;

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

type SearchCacheValue = {
  query: string;
  sourceIds: string[];
  results: MediaItem[];
};

type DetailsCacheValue = {
  itemId: string;
  sourceId: string;
  detailUrl: string;
  description: string;
  chapters: Chapter[];
};

export type CacheSummary = {
  searchEntries: number;
  detailsEntries: number;
};

function readCacheMap<T>(storageKey: string) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return {} as Record<string, CacheEntry<T>>;

  try {
    return JSON.parse(raw) as Record<string, CacheEntry<T>>;
  } catch (error) {
    console.warn(`Failed to parse cache for ${storageKey}:`, error);
    return {} as Record<string, CacheEntry<T>>;
  }
}

function writeCacheMap<T>(storageKey: string, value: Record<string, CacheEntry<T>>) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function getValidCacheEntry<T>(storageKey: string, cacheKey: string, ttl: number) {
  const cache = readCacheMap<T>(storageKey);
  const entry = cache[cacheKey];
  if (!entry) return null;

  if (Date.now() - entry.updatedAt > ttl) {
    delete cache[cacheKey];
    writeCacheMap(storageKey, cache);
    return null;
  }

  return entry.value;
}

function setCacheEntry<T>(storageKey: string, cacheKey: string, value: T) {
  const cache = readCacheMap<T>(storageKey);
  cache[cacheKey] = {
    value,
    updatedAt: Date.now(),
  };
  writeCacheMap(storageKey, cache);
}

function createSearchCacheKey(query: string, sourceIds: string[]) {
  return JSON.stringify({
    query: query.trim().toLowerCase(),
    sourceIds: [...sourceIds].sort(),
  });
}

function createDetailsCacheKey(itemId: string, sourceId: string, detailUrl: string) {
  return JSON.stringify({
    itemId,
    sourceId,
    detailUrl,
  });
}

export const cacheService = {
  getSearchResults(query: string, sourceIds: string[]) {
    return getValidCacheEntry<SearchCacheValue>(
      SEARCH_CACHE_KEY,
      createSearchCacheKey(query, sourceIds),
      SEARCH_CACHE_TTL,
    );
  },

  saveSearchResults(query: string, sourceIds: string[], results: MediaItem[]) {
    setCacheEntry<SearchCacheValue>(
      SEARCH_CACHE_KEY,
      createSearchCacheKey(query, sourceIds),
      {
        query,
        sourceIds,
        results,
      },
    );
  },

  getDetails(itemId: string, sourceId: string, detailUrl: string) {
    return getValidCacheEntry<DetailsCacheValue>(
      DETAILS_CACHE_KEY,
      createDetailsCacheKey(itemId, sourceId, detailUrl),
      DETAILS_CACHE_TTL,
    );
  },

  saveDetails(itemId: string, sourceId: string, detailUrl: string, description: string, chapters: Chapter[]) {
    setCacheEntry<DetailsCacheValue>(
      DETAILS_CACHE_KEY,
      createDetailsCacheKey(itemId, sourceId, detailUrl),
      {
        itemId,
        sourceId,
        detailUrl,
        description,
        chapters,
      },
    );
  },

  getSummary(): CacheSummary {
    return {
      searchEntries: Object.keys(readCacheMap<SearchCacheValue>(SEARCH_CACHE_KEY)).length,
      detailsEntries: Object.keys(readCacheMap<DetailsCacheValue>(DETAILS_CACHE_KEY)).length,
    };
  },

  clearSearchCache() {
    localStorage.removeItem(SEARCH_CACHE_KEY);
  },

  clearDetailsCache() {
    localStorage.removeItem(DETAILS_CACHE_KEY);
  },

  clearAll() {
    this.clearSearchCache();
    this.clearDetailsCache();
  },
};
