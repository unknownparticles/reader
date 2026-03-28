import { Chapter, MediaItem } from '../types';

const CURRENT_ITEM_KEY = 'app_current_item';
const CURRENT_CHAPTERS_KEY = 'app_current_chapters';

/**
 * 保存当前阅读会话，避免详情页跳到阅读页后丢失真实章节 URL。
 */
export const readingSessionService = {
  saveItem(item: MediaItem) {
    sessionStorage.setItem(CURRENT_ITEM_KEY, JSON.stringify(item));
  },

  getItem(id?: string): MediaItem | null {
    const saved = sessionStorage.getItem(CURRENT_ITEM_KEY);
    if (!saved) return null;

    try {
      const item = JSON.parse(saved) as MediaItem;
      if (!id || item.id === id) {
        return item;
      }
    } catch (error) {
      console.warn('Failed to parse current reading item:', error);
    }

    return null;
  },

  saveChapters(itemId: string, chapters: Chapter[]) {
    sessionStorage.setItem(CURRENT_CHAPTERS_KEY, JSON.stringify({ itemId, chapters }));
  },

  getChapters(itemId?: string): Chapter[] {
    const saved = sessionStorage.getItem(CURRENT_CHAPTERS_KEY);
    if (!saved) return [];

    try {
      const payload = JSON.parse(saved) as { itemId: string; chapters: Chapter[] };
      if (!itemId || payload.itemId === itemId) {
        return payload.chapters || [];
      }
    } catch (error) {
      console.warn('Failed to parse current reading chapters:', error);
    }

    return [];
  }
};
