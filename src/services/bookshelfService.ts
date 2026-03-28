import { MediaItem } from '../types';

export const bookshelfService = {
  getBookshelf: (): MediaItem[] => {
    const saved = localStorage.getItem('app_bookshelf');
    return saved ? JSON.parse(saved) : [];
  },
  
  addToBookshelf: (item: MediaItem) => {
    const shelf = bookshelfService.getBookshelf();
    if (!shelf.find(i => i.id === item.id)) {
      shelf.push(item);
      localStorage.setItem('app_bookshelf', JSON.stringify(shelf));
    }
  },
  
  removeFromBookshelf: (id: string) => {
    const shelf = bookshelfService.getBookshelf();
    const newShelf = shelf.filter(i => i.id !== id);
    localStorage.setItem('app_bookshelf', JSON.stringify(newShelf));
  },
  
  isBookmarked: (id: string): boolean => {
    const shelf = bookshelfService.getBookshelf();
    return !!shelf.find(i => i.id === id);
  }
};
