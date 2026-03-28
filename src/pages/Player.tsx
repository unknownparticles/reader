import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Settings, RotateCcw, FastForward } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const Player: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const chapterIndex = parseInt(queryParams.get('chapter') || '0');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  // Load progress memory
  useEffect(() => {
    const savedProgress = localStorage.getItem(`player_progress_${id}`);
    if (savedProgress && videoRef.current) {
      const time = parseFloat(savedProgress);
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, [id]);

  // Save progress memory
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        localStorage.setItem(`player_progress_${id}`, videoRef.current.currentTime.toString());
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      videoRef.current.muted = newMuted;
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSettings(false);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h > 0 ? h : null, m, s]
      .filter(x => x !== null)
      .map(x => x!.toString().padStart(2, '0'))
      .join(':');
  };

  const skip = (amount: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += amount;
    }
  };

  const handleUserInteraction = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none overflow-hidden"
      onMouseMove={handleUserInteraction}
      onClick={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      {/* Top Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/90 to-transparent text-white flex items-center px-4 z-[110]"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={28} />
            </button>
            <div className="ml-2 flex-1 min-w-0">
              <h1 className="font-bold truncate text-lg">正在播放: 示例媒体</h1>
              <p className="text-xs text-zinc-400 truncate">第 {chapterIndex + 1} 章</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <Settings size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Area */}
      <div className="flex-1 relative flex items-center justify-center group bg-zinc-950">
        <video 
          ref={videoRef}
          className="w-full max-h-full cursor-pointer"
          src="https://www.w3schools.com/html/mov_bbb.mp4"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          playsInline
        />
        
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Center Controls (Mobile Friendly) */}
        <AnimatePresence>
          {showControls && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 flex items-center justify-center gap-12 pointer-events-none"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); skip(-15); }}
                className="p-4 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all pointer-events-auto active:scale-90"
              >
                <RotateCcw size={32} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="p-8 bg-blue-600/80 backdrop-blur-md rounded-full text-white hover:bg-blue-600 transition-all pointer-events-auto active:scale-95 shadow-xl shadow-blue-500/20"
              >
                {isPlaying ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-1" />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); skip(15); }}
                className="p-4 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all pointer-events-auto active:scale-90"
              >
                <FastForward size={32} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-6 pt-12 space-y-6 text-white z-[110]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-zinc-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input 
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-blue-500 hover:h-2 transition-all"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 sm:gap-8">
                <div className="flex items-center gap-2 group relative">
                  <button onClick={toggleMute} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    {isMuted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                  </button>
                  <input 
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover:w-24 transition-all h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <button onClick={() => skip(-10)} className="p-2 hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                    <SkipBack size={24} fill="currentColor" />
                  </button>
                  <button onClick={togglePlay} className="p-3 bg-white text-black rounded-full hover:scale-105 transition-transform active:scale-95">
                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <button onClick={() => skip(10)} className="p-2 hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                    <SkipForward size={24} fill="currentColor" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors"
                >
                  {playbackRate}x
                </button>
                <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <Maximize size={24} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal (Playback Rate) */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[110]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl p-8 z-[120] space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">播放设置</h3>
                <button onClick={() => setShowSettings(false)} className="text-zinc-400">关闭</button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-zinc-500 font-bold uppercase tracking-wider">播放速度</p>
                <div className="grid grid-cols-4 gap-3">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={cn(
                        "py-3 rounded-xl font-bold transition-all",
                        playbackRate === rate 
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
