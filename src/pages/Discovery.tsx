import React, { useEffect, useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MediaItem } from '../types';
import { imageService } from '../services/imageService';
import { parserService } from '../services/parserService';
import { mediaItemService } from '../services/mediaItemService';
import { sourceService } from '../services/sourceService';

const DISCOVERY_CACHE_KEY = 'app_discovery_cache';
const DISCOVERY_REFRESH_ONCE_KEY = 'app_discovery_refresh_once';

/**
 * 推荐页和搜索页分开维护，避免两类请求和结果在同一页里互相干扰。
 */
export const Discovery: React.FC = () => {
  const [discoveryItems, setDiscoveryItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const cachedDiscovery = localStorage.getItem(DISCOVERY_CACHE_KEY);
    const hasRefreshedInSession = sessionStorage.getItem(DISCOVERY_REFRESH_ONCE_KEY) === '1';

    if (cachedDiscovery) {
      try {
        const parsed = JSON.parse(cachedDiscovery) as MediaItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDiscoveryItems(parsed);
          setIsLoading(false);
        }
      } catch (error) {
        console.warn('Failed to restore discovery cache:', error);
      }
    }

    const fetchDiscovery = async () => {
      if (hasRefreshedInSession) {
        return;
      }

      // 推荐流只在本次会话首次进入时后台刷新，避免来回切页时重复打源。
      setIsLoading((currentValue) => currentValue && discoveryItems.length === 0);
      const sources = sourceService.getSources();
      const items = await parserService.getDiscovery(sources, { signal: controller.signal });

      if (controller.signal.aborted) {
        return;
      }

      if (items.length > 0) {
        setDiscoveryItems(items);
        localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(items));
      }

      sessionStorage.setItem(DISCOVERY_REFRESH_ONCE_KEY, '1');
      setIsLoading(false);
    };

    fetchDiscovery();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-blue-600" size={22} />
          <h2 className="text-3xl font-bold tracking-tight">推荐发现</h2>
        </div>
        <p className="text-zinc-500">单独加载推荐流，避免和搜索页的多源请求互相打架</p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[3/4] bg-zinc-200 rounded-xl" />
              <div className="h-4 bg-zinc-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : discoveryItems.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {discoveryItems.map((item) => (
            <Link
              key={item.id}
              to={`/details/${item.id}`}
              onClick={() => mediaItemService.saveLastOpenedItem(item)}
              className="space-y-2 group"
            >
              <div className="aspect-[3/4] bg-zinc-100 rounded-xl overflow-hidden relative shadow-sm border border-zinc-100">
                <img
                  src={imageService.toProxyUrl(item.cover || `https://picsum.photos/seed/${item.id}/300/400`)}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-[10px] text-white font-medium truncate">{item.author}</span>
                </div>
              </div>
              <p className="text-xs font-semibold line-clamp-2 group-hover:text-blue-600 transition-colors">{item.title}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-10 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 text-zinc-400 space-y-3">
          <p>暂无推荐，请先在设置中导入并启用推荐源</p>
          <Link to="/settings" className="inline-flex items-center gap-1 text-blue-600 font-medium">
            前往设置 <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
};
