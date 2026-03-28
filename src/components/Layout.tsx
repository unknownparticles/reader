import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Book, Settings, Home, Search, Sparkles, Database } from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { icon: Home, label: '首页', path: '/' },
  { icon: Sparkles, label: '推荐', path: '/discovery' },
  { icon: Search, label: '搜索', path: '/search' },
  { icon: Book, label: '书架', path: '/bookshelf' },
  { icon: Database, label: '缓存', path: '/cache' },
  { icon: Settings, label: '设置', path: '/settings' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col pb-16 md:pb-0 md:pl-64">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-zinc-200 fixed inset-y-0 left-0 z-50">
        <div className="p-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            聚合阅读器
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                location.pathname === item.path
                  ? "bg-blue-50 text-blue-600"
                  : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 flex justify-around items-center h-16 px-2 z-50">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-1",
              location.pathname === item.path ? "text-blue-600" : "text-zinc-500"
            )}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};
