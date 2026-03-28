export type SourceType = 'book' | 'comic' | 'audio' | 'video' | 'live';

export interface SourceRequestConfig {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  referer?: string;
  contentType?: string;
}

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  baseUrl: string;
  enabled: boolean;
  group?: string;
  order?: number;
  exploreUrl?: string;
  
  // Legado-style rules (simplified for cross-media support)
  ruleSearch?: {
    checkUrl?: string;
    request?: SourceRequestConfig;
    list?: string;
    name?: string;
    author?: string;
    cover?: string;
    detailUrl?: string;
    kind?: string;
    lastChapter?: string;
    wordCount?: string;
  };

  ruleExplore?: {
    request?: SourceRequestConfig;
    list?: string;
    name?: string;
    author?: string;
    cover?: string;
    detailUrl?: string;
    kind?: string;
    lastChapter?: string;
  };
  
  ruleBookInfo?: {
    request?: SourceRequestConfig;
    name?: string;
    author?: string;
    cover?: string;
    intro?: string;
    kind?: string;
    lastChapter?: string;
    catalogUrl?: string;
    wordCount?: string;
  };
  
  ruleChapterList?: {
    request?: SourceRequestConfig;
    list?: string;
    name?: string;
    url?: string;
    isVip?: string;
    updateTime?: string;
  };
  
  ruleContent?: {
    request?: SourceRequestConfig;
    content?: string;
    nextPageUrl?: string;
    nextContentUrl?: string;
    replaceRegex?: string;
    imageStyle?: 'full' | 'split'; // For comics
  };

  // For video/audio/live
  rulePlay?: {
    url?: string;
    userAgent?: string;
    referer?: string;
  };
}

export interface MediaItem {
  id: string;
  sourceId: string;
  title: string;
  author?: string;
  cover?: string;
  detailUrl: string;
  type: SourceType;
  kind?: string;
  lastChapter?: string;
}

export interface Chapter {
  title: string;
  url: string;
  sourceId: string;
}
