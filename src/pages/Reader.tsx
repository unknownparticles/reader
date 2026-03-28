import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Settings, List, Sun, Moon, Play, Pause, Type, Palette } from 'lucide-react';
import { parserService } from '../services/parserService';
import { readingSessionService } from '../services/readingSessionService';
import { sourceService } from '../services/sourceService';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const THEMES = [
  { id: 'parchment', name: '羊皮纸', bg: 'bg-[#f4ecd8]', text: 'text-zinc-800' },
  { id: 'white', name: '纯白', bg: 'bg-white', text: 'text-zinc-900' },
  { id: 'green', name: '护眼', bg: 'bg-[#c7edcc]', text: 'text-zinc-800' },
  { id: 'dark', name: '深色', bg: 'bg-zinc-900', text: 'text-zinc-300' },
  { id: 'black', name: '纯黑', bg: 'bg-black', text: 'text-zinc-400' },
];

const FONTS = [
  { id: 'sans', name: '黑体', family: 'font-sans' },
  { id: 'serif', name: '宋体', family: 'font-serif' },
  { id: 'mono', name: '等宽', family: 'font-mono' },
];

export const Reader: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const chapterIndex = Math.max(0, Number(searchParams.get('chapter') || 0));
  
  const [content, setContent] = useState<string>('');
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [activeTheme, setActiveTheme] = useState(THEMES[0]);
  const [activeFont, setActiveFont] = useState(FONTS[0]);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('正文');
  const [chapterCount, setChapterCount] = useState(0);
  
  // Auto-scroll state
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1); // 1-10
  const scrollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchReaderContent = async () => {
      const item = readingSessionService.getItem(id);
      const sourceId = item?.sourceId || id.split('-')[0] || 'demo';
      const source = sourceService.getSources().find((currentSource) => currentSource.id === sourceId);
      let chapters = readingSessionService.getChapters(id);

      if (item && source && chapters.length === 0) {
        const details = await parserService.getDetails(item, source);
        chapters = details.chapters;
        readingSessionService.saveChapters(item.id, chapters);
      }

      const currentChapter = chapters[chapterIndex];

      setChapterCount(chapters.length);
      setChapterTitle(currentChapter?.title || '正文');

      if (!currentChapter || !source) {
        setContent('未找到章节内容，请先从详情页进入阅读。');
        return;
      }

      const chapterContent = await parserService.getContent(currentChapter, source);
      setContent(chapterContent);
    };

    fetchReaderContent();
  }, [chapterIndex, id]);

  // Auto-scroll logic
  useEffect(() => {
    if (isAutoScrolling) {
      scrollIntervalRef.current = window.setInterval(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop += scrollSpeed;
        }
      }, 50);
    } else {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    }
    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [isAutoScrolling, scrollSpeed]);

  const toggleAutoScroll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAutoScrolling(!isAutoScrolling);
  };

  const goToChapter = (offset: number) => {
    const nextIndex = chapterIndex + offset;
    if (!id || nextIndex < 0 || nextIndex >= chapterCount) return;
    navigate(`/reader/${id}?chapter=${nextIndex}`);
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
    <div 
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-[100] overflow-y-auto transition-colors duration-300 no-scrollbar",
        activeTheme.bg,
        activeTheme.text,
        activeFont.family
      )}
    >
      {/* Top Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            className="fixed top-0 left-0 right-0 h-14 bg-black/80 backdrop-blur-md text-white flex items-center justify-between px-4 z-[110]"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
            <h1 className="font-medium truncate max-w-[200px]">{chapterTitle}</h1>
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleAutoScroll}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isAutoScrolling ? "text-blue-400 bg-blue-400/10" : "hover:bg-white/10"
                )}
              >
                {isAutoScrolling ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Settings size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div 
        className="max-w-2xl mx-auto px-6 py-24"
        style={{ 
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          textAlign: 'justify'
        }}
        onClick={() => {
          setShowControls(!showControls);
          if (showSettings) setShowSettings(false);
          if (isAutoScrolling) setIsAutoScrolling(false);
        }}
      >
        <h2 className="text-3xl font-bold mb-12 border-b border-zinc-200/20 pb-4">{chapterTitle}</h2>
        <div
          className="space-y-8 whitespace-pre-wrap"
          style={{ textIndent: '2em' }}
        >
          {content || '加载中...'}
        </div>
        
        <div className="mt-20 flex justify-between items-center py-10 border-t border-zinc-200/20">
          <button
            onClick={() => goToChapter(-1)}
            disabled={chapterIndex <= 0}
            className="flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
          >
            <ChevronLeft size={16} /> 上一章
          </button>
          <button
            onClick={() => goToChapter(1)}
            disabled={chapterIndex >= chapterCount - 1}
            className="flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
          >
            下一章 <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ y: 300 }}
            animate={{ y: 0 }}
            exit={{ y: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 p-6 z-[120] rounded-t-[2.5rem] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Font Size & Line Height */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">字号</span>
                    <span className="text-sm font-mono">{fontSize}</span>
                  </div>
                  <div className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                    <button onClick={() => setFontSize(Math.max(12, fontSize - 1))} className="flex-1 py-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg transition-all">A-</button>
                    <button onClick={() => setFontSize(Math.min(36, fontSize + 1))} className="flex-1 py-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg transition-all">A+</button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">行高</span>
                    <span className="text-sm font-mono">{lineHeight.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                    <button onClick={() => setLineHeight(Math.max(1, lineHeight - 0.2))} className="flex-1 py-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg transition-all">T-</button>
                    <button onClick={() => setLineHeight(Math.min(3, lineHeight + 0.2))} className="flex-1 py-2 hover:bg-white dark:hover:bg-zinc-700 rounded-lg transition-all">T+</button>
                  </div>
                </div>
              </div>

              {/* Auto Scroll Speed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">自动阅读速度</span>
                  <span className="text-sm font-mono">{scrollSpeed}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  step="1"
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Themes */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">背景主题</span>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTheme(t)}
                      className={cn(
                        "flex-shrink-0 w-12 h-12 rounded-full border-2 transition-all",
                        t.bg,
                        activeTheme.id === t.id ? "border-blue-600 scale-110" : "border-transparent"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Fonts */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">字体</span>
                <div className="flex gap-2">
                  {FONTS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setActiveFont(f)}
                      className={cn(
                        "flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                        activeFont.id === f.id ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600" : "border-zinc-100 dark:border-zinc-800 text-zinc-500"
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav (Simplified) */}
      <AnimatePresence>
        {showControls && !showSettings && (
          <motion.div 
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 60 }}
            className="fixed bottom-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-md text-white flex items-center justify-around px-4 z-50"
          >
            <button className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100">
              <List size={20} />
              <span className="text-[10px]">目录</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
              className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100"
            >
              <Type size={20} />
              <span className="text-[10px]">排版</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setActiveTheme(activeTheme.id === 'dark' ? THEMES[0] : THEMES[3]); }}
              className="flex flex-col items-center gap-1 opacity-70 hover:opacity-100"
            >
              {activeTheme.id === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              <span className="text-[10px]">{activeTheme.id === 'dark' ? '日间' : '夜间'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
