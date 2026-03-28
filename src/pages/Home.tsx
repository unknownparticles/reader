import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Film, Headset, Library, Search as SearchIcon, Sparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const categories = [
  { id: 'book', name: '小说', icon: BookOpen, color: 'bg-orange-500' },
  { id: 'comic', name: '漫画', icon: Library, color: 'bg-green-500' },
  { id: 'audio', name: '音频', icon: Headset, color: 'bg-blue-500' },
  { id: 'video', name: '视频', icon: Film, color: 'bg-purple-500' },
];

export const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 pb-10">
      <header className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">欢迎回来</h2>
        <p className="text-zinc-500">探索你的聚合媒体库</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {categories.map((cat) => (
          <motion.button
            key={cat.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/search?type=${cat.id}`)}
            className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm gap-3 hover:border-blue-200 transition-colors"
          >
            <div className={cn("p-3 rounded-xl text-white", cat.color)}>
              <cat.icon size={24} />
            </div>
            <span className="font-semibold">{cat.name}</span>
          </motion.button>
        ))}
      </div>

      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/discovery"
            className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm transition-colors hover:border-blue-200"
          >
            <div className="space-y-3">
              <div className="inline-flex rounded-2xl bg-blue-600 p-3 text-white">
                <Sparkles size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold">进入推荐页</h3>
                <p className="text-sm text-zinc-500">
                  推荐页现在单独请求和展示，避免和搜索页的多源结果互相覆盖。
                </p>
              </div>
            </div>
          </Link>

          <Link
            to="/search"
            className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition-colors hover:border-zinc-300"
          >
            <div className="space-y-3">
              <div className="inline-flex rounded-2xl bg-zinc-900 p-3 text-white">
                <SearchIcon size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold">进入搜索页</h3>
                <p className="text-sm text-zinc-500">
                  搜索页只负责关键词检索，不再混入推荐流，排查也更直接。
                </p>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">最近阅读</h3>
          <button className="text-sm text-blue-600 font-medium">查看全部</button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[3/4] bg-zinc-200 rounded-xl overflow-hidden relative group border border-zinc-100">
                <img 
                  src={`https://picsum.photos/seed/book-${i}/300/400`} 
                  alt="Cover" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-xs font-medium line-clamp-1">示例作品 {i}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
