import { MediaItem } from '../types';
import { readingSessionService } from './readingSessionService';

const LAST_OPENED_ITEM_KEY = 'app_last_opened_item';

/**
 * 保存最近一次打开的作品，用来在页面跳转后补回 detailUrl 等瞬时数据。
 */
export const mediaItemService = {
  saveLastOpenedItem(item: MediaItem) {
    sessionStorage.setItem(LAST_OPENED_ITEM_KEY, JSON.stringify(item));
    readingSessionService.saveItem(item);
  },

  getLastOpenedItem(id?: string): MediaItem | null {
    const saved = sessionStorage.getItem(LAST_OPENED_ITEM_KEY);
    if (!saved) return null;

    try {
      const item = JSON.parse(saved) as MediaItem;
      if (!id || item.id === id) {
        return item;
      }
    } catch (error) {
      console.warn('Failed to parse last opened item:', error);
    }

    return null;
  }
};
