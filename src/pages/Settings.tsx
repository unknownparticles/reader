import React, { useState, useEffect } from 'react';
import { Plus, Globe, Trash2, CheckCircle2, Circle, X, Download, Loader2, Wand2, ShieldAlert, ScanSearch } from 'lucide-react';
import { sourceService } from '../services/sourceService';
import { importService } from '../services/importService';
import { sourceValidationService } from '../services/sourceValidationService';
import { Source } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export const Settings: React.FC = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isCheckingSources, setIsCheckingSources] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    setSources(sourceService.getSources());
    const intervalId = window.setInterval(() => {
      setSources(sourceService.getSources());
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, []);

  const toggleSource = (id: string) => {
    sourceService.toggleSource(id);
    setSources(sourceService.getSources());
  };

  const deleteSource = (id: string) => {
    const updated = sources.filter(s => s.id !== id);
    sourceService.saveSources(updated);
    setSources(updated);
  };

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setIsImporting(true);
    setMessage(null);
    try {
      const result = await importService.importFromUrl(importUrl);
      const newSources = result.sources;
      const existing = sourceService.getSources();
      const merged = [...existing];
      
      let addedCount = 0;
      newSources.forEach(ns => {
        if (!merged.find(s => s.id === ns.id)) {
          merged.push(ns);
          addedCount++;
        }
      });
      
      sourceService.saveSources(merged);
      setSources(merged);
      void sourceValidationService.validateSourcesInBackground(newSources.map((source) => source.id));
      setMessage({
        type: 'success',
        text: `成功导入 ${addedCount} 个新源，静态过滤 ${result.summary.filtered} 个明显异常源，后台正在检查可用性`,
      });
      setTimeout(() => {
        setShowImportModal(false);
        setImportUrl('');
        setMessage(null);
      }, 1500);
    } catch (error) {
      setMessage({ type: 'error', text: '导入失败，请检查链接或网络' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleOrganize = async () => {
    setIsOrganizing(true);
    setMessage(null);

    try {
      const currentSources = sourceService.getSources();
      const result = await importService.organizeSources(currentSources);

      sourceService.saveSources(result.sources);
      setSources(sourceService.getSources());
      void sourceValidationService.validateSourcesInBackground(result.sources.map((source) => source.id));
      setMessage({
        type: 'success',
        text: `整理完成，保留 ${result.summary.kept} 个源，去重 ${result.summary.deduped} 个，过滤 ${result.summary.filtered} 个明显异常源，后台正在重新检查`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: '整理失败，请稍后重试' });
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleValidateAll = async () => {
    setIsCheckingSources(true);
    setMessage(null);

    try {
      await sourceValidationService.validateSourcesInBackground();
      setSources(sourceService.getSources());
      setMessage({ type: 'success', text: '书源后台检查已完成' });
    } catch (error) {
      setMessage({ type: 'error', text: '书源检查失败，请稍后重试' });
    } finally {
      setIsCheckingSources(false);
    }
  };

  const handleRemoveInvalidSources = () => {
    const result = sourceService.removeInvalidSources();
    setSources(result.sources);
    setMessage({
      type: 'success',
      text: `已清理 ${result.removedCount} 个无效书源`,
    });
  };

  const invalidSourceCount = sources.filter((source) => source.validation?.status === 'invalid').length;

  const renderValidationBadge = (source: Source) => {
    const status = source.validation?.status || 'unchecked';

    if (status === 'valid') {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600">有效</span>;
    }

    if (status === 'invalid') {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">无效</span>;
    }

    if (status === 'checking') {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">检查中</span>;
    }

    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">未检查</span>;
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold">设置</h2>
        <p className="text-zinc-500">管理你的源和应用偏好</p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Globe size={20} />
            源管理
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidateAll}
              disabled={isCheckingSources || isImporting || sources.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {isCheckingSources ? <Loader2 className="animate-spin" size={16} /> : <ScanSearch size={16} />}
              {isCheckingSources ? '检查中...' : '检查全部'}
            </button>
            <button
              onClick={handleOrganize}
              disabled={isOrganizing || isImporting || isCheckingSources || sources.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {isOrganizing ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
              {isOrganizing ? '整理中...' : '整理已导入源'}
            </button>
            <button
              onClick={handleRemoveInvalidSources}
              disabled={invalidSourceCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <ShieldAlert size={16} />
              清理无效
            </button>
            <button 
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              导入源
            </button>
          </div>
        </div>

        {message && !showImportModal && (
          <div className={cn(
            "p-3 rounded-xl text-sm font-medium",
            message.type === 'success' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          )}>
            {message.text}
          </div>
        )}

        <div className="grid gap-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => toggleSource(source.id)}>
                  {source.enabled ? (
                    <CheckCircle2 className="text-blue-600" size={24} />
                  ) : (
                    <Circle className="text-zinc-300" size={24} />
                  )}
                </button>
                <div>
                  <p className="font-semibold line-clamp-1">{source.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded uppercase font-bold tracking-tighter">
                      {source.type}
                    </span>
                    {renderValidationBadge(source)}
                    {source.group && (
                      <span className="text-[10px] text-zinc-400">· {source.group}</span>
                    )}
                  </div>
                  {source.validation?.status === 'invalid' && source.validation.error && (
                    <p className="mt-1 text-[11px] text-red-500 line-clamp-1">{source.validation.error}</p>
                  )}
                </div>
              </div>
              <button 
                onClick={() => deleteSource(source.id)}
                className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xl font-bold">导入源</h4>
                  <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600">源链接 (JSON/URL)</label>
                  <textarea
                    placeholder="粘贴书源、漫画源或音视频源的链接..."
                    className="w-full h-32 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none text-sm"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                </div>

                {message && (
                  <div className={cn(
                    "p-3 rounded-xl text-sm font-medium",
                    message.type === 'success' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                  )}>
                    {message.text}
                  </div>
                )}

                <button
                  onClick={handleImport}
                  disabled={isImporting || !importUrl.trim()}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-blue-700 transition-colors"
                >
                  {isImporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                  {isImporting ? '正在导入...' : '立即导入'}
                </button>
                
                <p className="text-[10px] text-zinc-400 text-center px-4">
                  支持导入 Legado (阅读) 格式的书源，也支持直接粘贴常见仓库首页链接。
                </p>

                <div className="pt-4 space-y-2">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">推荐源仓库</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { name: 'XIU2 仓库首页', url: 'https://github.com/XIU2/Yuedu' },
                      { name: 'aoaostar 仓库首页', url: 'https://github.com/aoaostar/legado' },
                      { name: '漫画源 (chashaomanhua)', url: 'https://github.com/chashaomanhua/manhuadaquan' },
                      { name: '综合源 (chao921125)', url: 'https://raw.githubusercontent.com/chao921125/source/master/source.json' }
                    ].map(repo => (
                      <button
                        key={repo.url}
                        onClick={() => setImportUrl(repo.url)}
                        className="text-left p-3 bg-zinc-50 border border-zinc-100 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-all group"
                      >
                        <p className="text-sm font-medium group-hover:text-blue-600">{repo.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{repo.url}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <section className="p-6 bg-zinc-900 text-white rounded-3xl space-y-4">
        <h3 className="text-lg font-bold">关于应用</h3>
        <p className="text-zinc-400 text-sm leading-relaxed">
          聚合阅读器是一款开源的媒体聚合工具，支持自定义规则解析。
          所有内容均来自第三方源，请遵守相关法律法规。
        </p>
        <div className="pt-4 border-t border-zinc-800 flex justify-between text-xs text-zinc-500">
          <span>版本 1.0.0</span>
          <span>© 2026 聚合阅读</span>
        </div>
      </section>
    </div>
  );
};
