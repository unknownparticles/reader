import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, BookOpen, Heart, Share2, Info, Download, Loader2 } from 'lucide-react';
import { parserService } from '../services/parserService';
import { bookshelfService } from '../services/bookshelfService';
import { mediaItemService } from '../services/mediaItemService';
import { imageService } from '../services/imageService';
import { readingSessionService } from '../services/readingSessionService';
import { sourceService } from '../services/sourceService';
import { cacheService } from '../services/cacheService';
import { MediaItem, Chapter, Source } from '../types';
import { cn } from '../lib/utils';

function inferItemTypeFromDetailUrl(detailUrl: string, fallbackType: MediaItem['type']) {
  const normalizedUrl = (detailUrl || '').toLowerCase();

  if (/(?:\/|^)(comic|manhua|manga)(?:\/|$)/i.test(normalizedUrl)) {
    return 'comic';
  }

  if (/(?:\/|^)(video|movie|tv|play)(?:\/|$)/i.test(normalizedUrl)) {
    return 'video';
  }

  if (/(?:\/|^)(audio|tingshu|listen)(?:\/|$)/i.test(normalizedUrl)) {
    return 'audio';
  }

  return fallbackType;
}

export const Details: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [details, setDetails] = useState<{ description: string, chapters: Chapter[] } | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCaching, setIsCaching] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{ completed: number; total: number } | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      // Try to find in bookshelf first
      let mediaItem = bookshelfService.getBookshelf().find(i => i.id === id);
      const lastOpenedItem = mediaItemService.getLastOpenedItem(id);
      
      // If not in bookshelf, we need to reconstruct it or get it from search results (mocked for now)
      if (!mediaItem) {
        if (lastOpenedItem) {
          mediaItem = lastOpenedItem;
        }
      }

      if (!mediaItem) {
        // In a real app, we'd fetch this from a global state or API
        // For this demo, we'll try to parse the sourceId from the id if it follows our pattern
        const sourceId = id.split('-')[0];
        const allSources = sourceService.getSources();
        const foundSource = allSources.find(s => s.id === sourceId);
        
        mediaItem = {
          id,
          sourceId: sourceId || 'demo',
          title: '正在加载...',
          author: '...',
          cover: `https://picsum.photos/seed/${id}/300/400`,
          detailUrl: '', // This would ideally be passed in
          type: foundSource?.type || 'book'
        };
      }

      const normalizedMediaItem: MediaItem = {
        ...mediaItem,
        type: inferItemTypeFromDetailUrl(mediaItem.detailUrl, mediaItem.type),
      };

      setItem(normalizedMediaItem);
      mediaItemService.saveLastOpenedItem(normalizedMediaItem);
      setIsBookmarked(bookshelfService.isBookmarked(normalizedMediaItem.id));

      const allSources = sourceService.getSources();
      const foundSource = allSources.find(s => s.id === normalizedMediaItem?.sourceId);
      setSource(foundSource || null);
      console.info('[details-page] source selected:', JSON.stringify({
        itemId: normalizedMediaItem.id,
        title: normalizedMediaItem.title,
        itemType: normalizedMediaItem.type,
        sourceId: normalizedMediaItem.sourceId,
        sourceName: foundSource?.name || null,
        sourceType: foundSource?.type || null,
        detailUrl: normalizedMediaItem.detailUrl,
      }, null, 2));

      try {
        const cachedDetails = foundSource
          ? cacheService.getDetails(normalizedMediaItem.id, foundSource.id, normalizedMediaItem.detailUrl)
          : null;

        if (cachedDetails) {
          const cachedResult = {
            description: cachedDetails.description,
            chapters: cachedDetails.chapters,
          };
          setDetails(cachedResult);
          readingSessionService.saveItem(normalizedMediaItem);
          readingSessionService.saveChapters(normalizedMediaItem.id, cachedResult.chapters);
          setIsLoading(false);
          return;
        }

        const result = await parserService.getDetails(normalizedMediaItem, foundSource || undefined);
        setDetails(result);
        readingSessionService.saveItem(normalizedMediaItem);
        readingSessionService.saveChapters(normalizedMediaItem.id, result.chapters);
        if (foundSource && normalizedMediaItem.detailUrl) {
          cacheService.saveDetails(
            normalizedMediaItem.id,
            foundSource.id,
            normalizedMediaItem.detailUrl,
            result.description,
            result.chapters,
          );
        }
      } catch (error) {
        console.error('Failed to fetch details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-zinc-500 font-medium">正在解析源数据...</p>
    </div>
  );

  if (!item || !details) return (
    <div className="p-8 text-center space-y-4">
      <Info className="mx-auto text-zinc-300" size={48} />
      <p className="text-zinc-500">无法加载作品详情</p>
      <button onClick={() => navigate(-1)} className="text-blue-600 font-medium">返回重试</button>
    </div>
  );

  const toggleBookmark = () => {
    if (isBookmarked) {
      bookshelfService.removeFromBookshelf(item.id);
    } else {
      bookshelfService.addToBookshelf(item);
    }
    setIsBookmarked(!isBookmarked);
  };

  const handleChapterClick = (chapter: Chapter, index: number) => {
    if (item) {
      readingSessionService.saveItem(item);
      readingSessionService.saveChapters(item.id, details?.chapters || []);
    }

    // Save progress or just navigate
    if (item.type === 'book') navigate(`/reader/${item.id}?chapter=${index}`);
    else if (item.type === 'comic') navigate(`/comic/${item.id}?chapter=${index}`);
    else navigate(`/player/${item.id}?chapter=${index}`);
  };

  const handleCacheAllContent = async () => {
    if (!item || !source || !details || details.chapters.length === 0) {
      return;
    }

    setIsCaching(true);
    setCacheProgress({ completed: 0, total: details.chapters.length });

    try {
      await parserService.cacheAllContent(item, source, details.chapters, {
        concurrency: item.type === 'comic' ? 2 : 3,
        onProgress: (completed, total) => setCacheProgress({ completed, total }),
      });
    } catch (error) {
      console.error('Failed to cache all content:', error);
    } finally {
      setIsCaching(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900 transition-colors">
        <ChevronLeft size={20} />
        返回
      </button>

      <div className="flex flex-col sm:flex-row gap-6">
        <div className="w-40 sm:w-48 aspect-[3/4] bg-zinc-200 rounded-2xl overflow-hidden shadow-lg self-center sm:self-start border border-zinc-100">
          <img src={imageService.toProxyUrl(item.cover)} alt={item.title} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 space-y-4 text-center sm:text-left">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">{item.title}</h2>
            <p className="text-lg text-zinc-500 font-medium">{item.author}</p>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-start gap-2">
            <span className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-bold uppercase tracking-wider">
              {item.type === 'book' ? '小说' : item.type === 'comic' ? '漫画' : item.type === 'audio' ? '音频' : '视频'}
            </span>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold truncate max-w-[150px]">
              源: {source?.name || '未知源'}
            </span>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-start gap-3 pt-2">
            <button 
              onClick={() => handleChapterClick(details.chapters[0], 0)}
              disabled={details.chapters.length === 0}
              className={cn(
                "px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95",
                details.chapters.length > 0
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200"
                  : "bg-zinc-200 text-zinc-500 shadow-transparent cursor-not-allowed"
              )}
            >
              {item.type === 'book' || item.type === 'comic' ? <BookOpen size={20} /> : <Play size={20} />}
              {details.chapters.length > 0 ? '立即开始' : '暂无可读章节'}
            </button>
            <button 
              onClick={toggleBookmark}
              className={cn(
                "p-3 rounded-full border transition-all active:scale-95",
                isBookmarked ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              )}
            >
              <Heart size={20} fill={isBookmarked ? "currentColor" : "none"} />
            </button>
            <button className="p-3 rounded-full bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-all active:scale-95">
              <Share2 size={20} />
            </button>
            <button
              onClick={handleCacheAllContent}
              disabled={isCaching || details.chapters.length === 0}
              className={cn(
                "px-4 py-3 rounded-full border transition-all active:scale-95 flex items-center gap-2",
                isCaching
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {isCaching ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {isCaching && cacheProgress
                ? `缓存中 ${cacheProgress.completed}/${cacheProgress.total}`
                : item.type === 'comic' ? '缓存整部' : '缓存全书'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Info size={20} className="text-blue-600" />
          简介
        </h3>
        <p className="text-zinc-600 leading-relaxed text-sm sm:text-base whitespace-pre-wrap">{details.description}</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xl font-bold">目录</h3>
          <span className="text-sm text-zinc-500 font-medium">{details.chapters.length} 章节</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {details.chapters.map((chapter, idx) => (
            <button
              key={idx}
              onClick={() => handleChapterClick(chapter, idx)}
              className="p-4 bg-white border border-zinc-100 rounded-2xl text-left hover:border-blue-200 hover:bg-blue-50 transition-all group flex items-center justify-between"
            >
              <span className="text-sm font-medium group-hover:text-blue-600 truncate mr-2">{chapter.title}</span>
              <span className="text-[10px] text-zinc-400 font-mono shrink-0">#{idx + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
