import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, List, Settings, Download } from 'lucide-react';
import { mediaItemService } from '../services/mediaItemService';
import { imageService } from '../services/imageService';
import { parserService } from '../services/parserService';
import { readingSessionService } from '../services/readingSessionService';
import { sourceService } from '../services/sourceService';
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { Chapter } from '../types';

export const ComicViewer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chapterIndex = Math.max(0, Number(searchParams.get('chapter') || 0));
  const [images, setImages] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(true);
  const [title, setTitle] = useState('漫画内容');
  const [chapterCount, setChapterCount] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchComicContent = async () => {
      const item = mediaItemService.getLastOpenedItem(id);
      const sourceId = item?.sourceId || id.split('-')[0] || 'demo';
      const source = sourceService.getSources().find((currentSource) => currentSource.id === sourceId);

      if (!item || !source) {
        setImages([]);
        setTitle('漫画内容');
        return;
      }

      setTitle(item.title);

      let chapters = readingSessionService.getChapters(id);
      if (chapters.length === 0) {
        const details = await parserService.getDetails(item, source);
        chapters = details.chapters;
        readingSessionService.saveChapters(item.id, chapters);
      }

      setChapters(chapters);
      setChapterCount(chapters.length);

      const currentChapter = chapters[chapterIndex];
      if (!currentChapter) {
        setImages([]);
        return;
      }

      const content = await parserService.getContent(currentChapter, source, { itemId: id });
      const comicImages = parserService.extractImageUrlsFromContent(content);
      setImages(comicImages);
    };

    fetchComicContent();
  }, [chapterIndex, id]);

  useEffect(() => {
    if (!id) return;

    const progress = readingSessionService.getProgress(id);
    if (!progress) return;

    if (progress.chapterIndex !== chapterIndex) {
      navigate(`/comic/${id}?chapter=${progress.chapterIndex}`, { replace: true });
    }
  }, [chapterIndex, id, navigate]);

  useEffect(() => {
    if (!id) return;

    readingSessionService.saveProgress({
      itemId: id,
      chapterIndex,
      scrollTop: 0,
      updatedAt: Date.now(),
    });
  }, [chapterIndex, id]);

  const goToChapter = (offset: number) => {
    const nextIndex = chapterIndex + offset;
    if (!id || nextIndex < 0 || nextIndex >= chapterCount) return;
    navigate(`/comic/${id}?chapter=${nextIndex}`, { replace: true });
  };

  const jumpToChapter = (nextIndex: number) => {
    if (!id || nextIndex < 0 || nextIndex >= chapterCount) return;
    setShowCatalog(false);
    navigate(`/comic/${id}?chapter=${nextIndex}`, { replace: true });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() || '';
      if (target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToChapter(-1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToChapter(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chapterCount, chapterIndex, id]);

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 overflow-y-auto no-scrollbar">
      {/* Top Bar */}
      <div className={cn(
        "fixed top-0 left-0 right-0 h-14 bg-black/80 text-white flex items-center justify-between px-4 transition-transform duration-300 z-[110]",
        !showControls && "-translate-y-full"
      )} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/details/${id}`)} className="p-2"><ChevronLeft size={24} /></button>
          <span className="font-medium truncate max-w-[150px]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2"><Download size={20} /></button>
          <button className="p-2"><Settings size={20} /></button>
        </div>
      </div>

      {/* Images List */}
      <div 
        className="flex flex-col items-center"
        onClick={() => setShowControls(!showControls)}
      >
        {images.length > 0 ? (
          images.map((src, idx) => (
            <div key={idx} className="w-full max-w-3xl relative">
              <img 
                src={imageService.toProxyUrl(src)} 
                alt={`Page ${idx + 1}`} 
                className="w-full h-auto"
                loading="lazy"
              />
              <div className="absolute bottom-4 right-4 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                {idx + 1} / {images.length}
              </div>
            </div>
          ))
        ) : (
          <div className="w-full max-w-3xl min-h-[50vh] flex items-center justify-center text-zinc-400 text-sm px-6 text-center">
            当前章节没有解析出漫画图片，可能这个源使用了更复杂的脚本规则。
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 bg-black/80 text-white p-4 transition-transform duration-300 z-[110]",
        !showControls && "translate-y-full"
      )} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button
            onClick={() => setShowCatalog(true)}
            className="flex flex-col items-center gap-1"
          >
            <List size={20} />
            <span className="text-[10px]">目录</span>
          </button>
          <div className="flex items-center gap-8">
            <button className="text-sm disabled:opacity-40" onClick={() => goToChapter(-1)} disabled={chapterIndex <= 0}>上一话</button>
            <div className="text-xs text-zinc-400">{Math.min(chapterIndex + 1, Math.max(chapterCount, 1))} / {Math.max(chapterCount, 1)}</div>
            <button className="text-sm disabled:opacity-40" onClick={() => goToChapter(1)} disabled={chapterIndex >= chapterCount - 1}>下一话</button>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>
      </div>

      <AnimatePresence>
        {showCatalog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCatalog(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="absolute inset-x-4 top-20 bottom-6 mx-auto max-w-2xl rounded-3xl bg-white text-zinc-900 shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
                <h3 className="text-lg font-bold">目录</h3>
                <button onClick={() => setShowCatalog(false)} className="text-sm text-zinc-500 hover:text-zinc-900">
                  关闭
                </button>
              </div>
              <div className="h-full overflow-y-auto p-4 pb-24 space-y-2">
                {chapters.length === 0 ? (
                  <div className="py-10 text-center text-zinc-400">暂无目录</div>
                ) : (
                  chapters.map((chapter, index) => (
                    <button
                      key={`${chapter.url}-${index}`}
                      onClick={() => jumpToChapter(index)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                        index === chapterIndex
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">{chapter.title || `第 ${index + 1} 话`}</span>
                        <span className="text-xs text-zinc-400 shrink-0">#{index + 1}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
