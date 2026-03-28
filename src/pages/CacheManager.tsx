import React, { useEffect, useState } from 'react';
import { Database, Trash2, RefreshCw } from 'lucide-react';
import { cacheService, CacheSummary } from '../services/cacheService';
import { contentCacheService, CachedItemSummary } from '../services/contentCacheService';
import { bookshelfService } from '../services/bookshelfService';
import { mediaItemService } from '../services/mediaItemService';
import { sourceService } from '../services/sourceService';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export const CacheManager: React.FC = () => {
  const [summary, setSummary] = useState<CacheSummary>({ searchEntries: 0, detailsEntries: 0 });
  const [offlineItems, setOfflineItems] = useState<CachedItemSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      setSummary(cacheService.getSummary());
      setOfflineItems(await contentCacheService.listCachedItems());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const clearOfflineItem = async (itemId: string) => {
    await contentCacheService.clearItemCache(itemId);
    await refresh();
  };

  const clearAllCache = async () => {
    cacheService.clearAll();
    await contentCacheService.clearAll();
    await refresh();
  };

  const resolveItemLabel = (itemId: string, sourceId: string) => {
    const shelfItem = bookshelfService.getBookshelf().find((item) => item.id === itemId);
    const lastOpenedItem = mediaItemService.getLastOpenedItem(itemId);
    const item = shelfItem || lastOpenedItem;
    const source = sourceService.getSources().find((currentSource) => currentSource.id === sourceId);

    return {
      title: item?.title || itemId,
      sourceName: source?.name || sourceId,
    };
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">缓存管理</h2>
          <p className="text-zinc-500">管理搜索、详情和离线章节缓存</p>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-zinc-200 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          刷新
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">搜索缓存</p>
          <p className="mt-2 text-3xl font-bold">{summary.searchEntries}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">详情缓存</p>
          <p className="mt-2 text-3xl font-bold">{summary.detailsEntries}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">离线作品</p>
          <p className="mt-2 text-3xl font-bold">{offlineItems.length}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Database size={20} />
            离线章节缓存
          </h3>
          <button
            onClick={clearAllCache}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100"
          >
            <Trash2 size={16} />
            清空全部缓存
          </button>
        </div>

        <div className="grid gap-3">
          {offlineItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-zinc-500">
              还没有离线缓存的作品
            </div>
          ) : (
            offlineItems.map((entry) => {
              const item = resolveItemLabel(entry.itemId, entry.sourceId);
              return (
                <div
                  key={entry.itemId}
                  className="flex items-center justify-between rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.title}</p>
                    <p className="text-sm text-zinc-500 truncate">
                      {item.sourceName} · 已缓存 {entry.chapterCount} 章 · {formatTime(entry.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => clearOfflineItem(entry.itemId)}
                    className="p-2 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
