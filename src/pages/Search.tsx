import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Filter, ExternalLink, Globe } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaItem, Source, SourceType } from '../types';
import { mediaItemService } from '../services/mediaItemService';
import { imageService } from '../services/imageService';
import { parserService } from '../services/parserService';
import { sourceService } from '../services/sourceService';
import { cacheService } from '../services/cacheService';
import { cn } from '../lib/utils';

const SEARCH_SESSION_KEY = 'app_search_session';
const SEARCH_CACHE_KEY = 'app_search_cache';
let searchAbortController: AbortController | null = null;

type SearchSessionState = {
  query: string;
  results: MediaItem[];
  activeFilter: string;
  selectedSourceId: string | 'all';
};

const FILTER_LABELS = ['全部', '小说', '漫画', '音频', '视频'] as const;

const SEARCH_TYPE_TO_FILTER: Record<string, string> = {
  book: '小说',
  comic: '漫画',
  audio: '音频',
  video: '视频',
};

const FILTER_TO_SOURCE_TYPE: Record<string, SourceType | null> = {
  全部: null,
  小说: 'book',
  漫画: 'comic',
  音频: 'audio',
  视频: 'video',
};

export const Search: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeFilter, setActiveFilter] = useState('全部');
  const [selectedSourceId, setSelectedSourceId] = useState<string | 'all'>('all');

  const requestedFilter = SEARCH_TYPE_TO_FILTER[searchParams.get('type') || ''] || null;
  const currentSourceType = FILTER_TO_SOURCE_TYPE[activeFilter];
  const visibleSources = sources.filter((source) => {
    if (!source.enabled) {
      return false;
    }

    if (!currentSourceType) {
      return true;
    }

    return source.type === currentSourceType;
  });

  useEffect(() => {
    return () => {
      searchAbortController?.abort();
    };
  }, []);

  useEffect(() => {
    setSources(sourceService.getSources());

    const savedSession = sessionStorage.getItem(SEARCH_SESSION_KEY);
    const savedCache = localStorage.getItem(SEARCH_CACHE_KEY);
    const restoredState = savedSession || savedCache;
    if (!restoredState) {
      return;
    }

    try {
      const parsed = JSON.parse(restoredState) as SearchSessionState;
      setQuery(parsed.query || '');
      setResults(Array.isArray(parsed.results) ? parsed.results : []);
      setActiveFilter(requestedFilter || parsed.activeFilter || '全部');
      setSelectedSourceId(parsed.selectedSourceId || 'all');
    } catch (error) {
      console.warn('Failed to restore search session:', error);
    }
  }, [requestedFilter]);

  useEffect(() => {
    if (!requestedFilter) {
      return;
    }

    // 首页带着类型跳转时，优先用 URL 指定的 tab，避免回到旧会话里的其他类型。
    setActiveFilter(requestedFilter);
    setSelectedSourceId('all');
  }, [requestedFilter]);

  useEffect(() => {
    if (selectedSourceId === 'all') {
      return;
    }

    if (!visibleSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId('all');
    }
  }, [selectedSourceId, visibleSources]);

  useEffect(() => {
    const sessionState: SearchSessionState = {
      query,
      results,
      activeFilter,
      selectedSourceId,
    };

    sessionStorage.setItem(SEARCH_SESSION_KEY, JSON.stringify(sessionState));
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(sessionState));
  }, [query, results, activeFilter, selectedSourceId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    searchAbortController?.abort();
    searchAbortController = new AbortController();
    
    setIsSearching(true);
    try {
      const searchSources = selectedSourceId === 'all'
        ? visibleSources
        : visibleSources.filter(s => s.id === selectedSourceId);
      const sourceIds = searchSources.map((source) => source.id);
      const cachedSearch = cacheService.getSearchResults(query, sourceIds);

      if (cachedSearch?.results?.length) {
        setResults(cachedSearch.results);
        setIsSearching(false);
        return;
      }
        
      const searchResults = await parserService.search(query, searchSources, {
        signal: searchAbortController.signal,
        onResults: (partialResults) => {
          setResults([...partialResults]);
        }
      });

      if (searchAbortController.signal.aborted) {
        return;
      }

      cacheService.saveSearchResults(query, sourceIds, searchResults);

      // 只有真正拿到新结果时才覆盖旧结果，避免更新失败时页面变空。
      if (searchResults.length > 0 || results.length === 0) {
        setResults(searchResults);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      if (!searchAbortController.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const filteredResults = results.filter(item => {
    if (activeFilter === '全部') return true;
    if (activeFilter === '小说') return item.type === 'book';
    if (activeFilter === '漫画') return item.type === 'comic';
    if (activeFilter === '音频') return item.type === 'audio';
    if (activeFilter === '视频') return item.type === 'video';
    return true;
  });

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
        <input
          type="text"
          placeholder="搜索作品、作者、源..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </form>

      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {FILTER_LABELS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-all",
                activeFilter === filter 
                  ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200" 
                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              )}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setSelectedSourceId('all')}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
              selectedSourceId === 'all'
                ? "bg-zinc-800 border-zinc-800 text-white"
                : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            )}
          >
            <Globe size={14} />
            智能搜索
          </button>
          {visibleSources.map((source) => (
            <button
              key={source.id}
              onClick={() => setSelectedSourceId(source.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all",
                selectedSourceId === source.id
                  ? "bg-zinc-800 border-zinc-800 text-white"
                  : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              )}
            >
              {source.name}
            </button>
          ))}
        </div>
      </div>

      {filteredResults.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredResults.map((item) => (
            <Link 
              key={item.id} 
              to={`/details/${item.id}`}
              onClick={() => mediaItemService.saveLastOpenedItem(item)}
              className="flex gap-4 p-3 bg-white border border-zinc-100 rounded-2xl hover:border-blue-200 transition-all group"
            >
              <div className="w-24 aspect-[3/4] bg-zinc-200 rounded-xl overflow-hidden shrink-0">
                {item.cover ? (
                  <img src={imageService.toProxyUrl(item.cover)} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-[10px] text-zinc-400">
                    暂无封面
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-between py-1">
                <div className="space-y-1">
                  <h4 className="font-bold line-clamp-1 group-hover:text-blue-600 transition-colors">{item.title}</h4>
                  <p className="text-sm text-zinc-500">{item.author}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full font-medium uppercase">
                    {item.type === 'book' ? '小说' : item.type === 'comic' ? '漫画' : item.type}
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate max-w-[100px]">
                    来自: {sources.find(s => s.id === item.sourceId)?.name || '未知源'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : !isSearching && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-4">
          <SearchIcon size={48} strokeWidth={1} />
          <p>{query ? '未找到相关结果' : '输入关键词开始搜索'}</p>
        </div>
      )}
    </div>
  );
};
