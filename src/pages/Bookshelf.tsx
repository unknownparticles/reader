import React, { useState, useEffect } from 'react';
import { bookshelfService } from '../services/bookshelfService';
import { MediaItem } from '../types';
import { Link } from 'react-router-dom';
import { Trash2, BookOpen } from 'lucide-react';
import { imageService } from '../services/imageService';

export const Bookshelf: React.FC = () => {
  const [items, setItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    setItems(bookshelfService.getBookshelf());
  }, []);

  const remove = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    bookshelfService.removeFromBookshelf(id);
    setItems(bookshelfService.getBookshelf());
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-4">
        <BookOpen size={64} strokeWidth={1} />
        <p>书架空空如也</p>
        <Link to="/search" className="px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-medium">去发现</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">书架</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
        {items.map((item) => (
          <Link key={item.id} to={`/details/${item.id}`} className="group relative space-y-2">
            <div className="aspect-[3/4] bg-zinc-200 rounded-xl overflow-hidden shadow-sm">
              <img src={imageService.toProxyUrl(item.cover)} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            </div>
            <p className="text-sm font-medium line-clamp-1">{item.title}</p>
            <button 
              onClick={(e) => remove(item.id, e)}
              className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
};
