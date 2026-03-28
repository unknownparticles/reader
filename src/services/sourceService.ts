import { Source, SourceRequestConfig } from '../types';

const DEFAULT_SOURCES: Source[] = [
  {
    id: 'demo-book',
    name: '示例书源 (模拟)',
    type: 'book',
    baseUrl: 'https://example.com',
    enabled: true,
    ruleSearch: {
      checkUrl: '/search?q=${key}',
      list: '.item',
      name: '.title',
      detailUrl: 'a.link'
    }
  },
  {
    id: 'demo-comic',
    name: '示例漫画源 (模拟)',
    type: 'comic',
    baseUrl: 'https://example.com',
    enabled: true
  }
];

export const sourceService = {
  getSources: (): Source[] => {
    const saved = localStorage.getItem('app_sources');
    if (saved) {
      return sanitizeSources(JSON.parse(saved));
    }
    return DEFAULT_SOURCES;
  },
  
  saveSources: (sources: Source[]) => {
    localStorage.setItem('app_sources', JSON.stringify(sanitizeSources(sources)));
  },
  
  addSource: (source: Source) => {
    const sources = sourceService.getSources();
    sources.push(source);
    sourceService.saveSources(sources);
  },
  
  toggleSource: (id: string) => {
    const sources = sourceService.getSources();
    const source = sources.find(s => s.id === id);
    if (source) {
      source.enabled = !source.enabled;
      sourceService.saveSources(sources);
    }
  }
};

function inferStoredSourceType(source: Source) {
  const mergedText = `${source.name || ''} ${source.group || ''} ${source.baseUrl || ''}`.toLowerCase();

  // 这里做一次本地迁移纠偏，修复早期导入把漫画源错误存成 book 的情况。
  if (/(漫画|manhua|comic|manga|taomanhua|iyouman|manhuatai|mkzhan|qiremanhua|kuaikanmanhua|ac\.qq|manwaku|kanman)/i.test(mergedText)) {
    return 'comic';
  }

  if (/(听书|音频|电台|radio|audio)/i.test(mergedText)) {
    return 'audio';
  }

  if (/(视频|影视|video|movie|tv)/i.test(mergedText)) {
    return 'video';
  }

  if (/(直播|live)/i.test(mergedText)) {
    return 'live';
  }

  return 'book';
}

function sanitizeRuleValue(value: any): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    // 这些模式已经确认会把无关对象内容拼进 URL，请在读取时直接丢弃。
    if (/[[][{].*layout_/i.test(trimmed)) return undefined;
    if (trimmed === '[object Object]') return undefined;

    return trimmed;
  }

  return undefined;
}

function sanitizeHeaders(value: any): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const headers = Object.entries(value).reduce<Record<string, string>>((result, [key, currentValue]) => {
    const sanitizedValue = sanitizeRuleValue(currentValue);
    if (sanitizedValue) {
      result[key] = sanitizedValue;
    }
    return result;
  }, {});

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function sanitizeRequestConfig(value?: SourceRequestConfig): SourceRequestConfig | undefined {
  if (!value) {
    return undefined;
  }

  const method = sanitizeRuleValue(value.method);
  const body = sanitizeRuleValue(value.body);
  const referer = sanitizeRuleValue(value.referer);
  const contentType = sanitizeRuleValue(value.contentType);
  const headers = sanitizeHeaders(value.headers);

  if (!method && !body && !referer && !contentType && !headers) {
    return undefined;
  }

  return {
    method,
    body,
    referer,
    contentType,
    headers,
  };
}

function sanitizeSource(source: Source): Source {
  return {
    ...source,
    type: inferStoredSourceType(source),
    baseUrl: sanitizeRuleValue(source.baseUrl) || '',
    exploreUrl: sanitizeRuleValue(source.exploreUrl),
    ruleSearch: source.ruleSearch ? {
      ...source.ruleSearch,
      checkUrl: sanitizeRuleValue(source.ruleSearch.checkUrl),
      request: sanitizeRequestConfig(source.ruleSearch.request),
      list: sanitizeRuleValue(source.ruleSearch.list),
      name: sanitizeRuleValue(source.ruleSearch.name),
      author: sanitizeRuleValue(source.ruleSearch.author),
      cover: sanitizeRuleValue(source.ruleSearch.cover),
      detailUrl: sanitizeRuleValue(source.ruleSearch.detailUrl),
      kind: sanitizeRuleValue(source.ruleSearch.kind),
      lastChapter: sanitizeRuleValue(source.ruleSearch.lastChapter),
      wordCount: sanitizeRuleValue(source.ruleSearch.wordCount),
    } : undefined,
    ruleExplore: source.ruleExplore ? {
      ...source.ruleExplore,
      request: sanitizeRequestConfig(source.ruleExplore.request),
      list: sanitizeRuleValue(source.ruleExplore.list),
      name: sanitizeRuleValue(source.ruleExplore.name),
      author: sanitizeRuleValue(source.ruleExplore.author),
      cover: sanitizeRuleValue(source.ruleExplore.cover),
      detailUrl: sanitizeRuleValue(source.ruleExplore.detailUrl),
      kind: sanitizeRuleValue(source.ruleExplore.kind),
      lastChapter: sanitizeRuleValue(source.ruleExplore.lastChapter),
    } : undefined,
    ruleBookInfo: source.ruleBookInfo ? {
      ...source.ruleBookInfo,
      request: sanitizeRequestConfig(source.ruleBookInfo.request),
      name: sanitizeRuleValue(source.ruleBookInfo.name),
      author: sanitizeRuleValue(source.ruleBookInfo.author),
      cover: sanitizeRuleValue(source.ruleBookInfo.cover),
      intro: sanitizeRuleValue(source.ruleBookInfo.intro),
      kind: sanitizeRuleValue(source.ruleBookInfo.kind),
      lastChapter: sanitizeRuleValue(source.ruleBookInfo.lastChapter),
      catalogUrl: sanitizeRuleValue(source.ruleBookInfo.catalogUrl),
      wordCount: sanitizeRuleValue(source.ruleBookInfo.wordCount),
    } : undefined,
    ruleChapterList: source.ruleChapterList ? {
      ...source.ruleChapterList,
      request: sanitizeRequestConfig(source.ruleChapterList.request),
      list: sanitizeRuleValue(source.ruleChapterList.list),
      name: sanitizeRuleValue(source.ruleChapterList.name),
      url: sanitizeRuleValue(source.ruleChapterList.url),
      isVip: sanitizeRuleValue(source.ruleChapterList.isVip),
      updateTime: sanitizeRuleValue(source.ruleChapterList.updateTime),
    } : undefined,
    ruleContent: source.ruleContent ? {
      ...source.ruleContent,
      request: sanitizeRequestConfig(source.ruleContent.request),
      content: sanitizeRuleValue(source.ruleContent.content),
      nextPageUrl: sanitizeRuleValue(source.ruleContent.nextPageUrl),
      nextContentUrl: sanitizeRuleValue(source.ruleContent.nextContentUrl),
      replaceRegex: sanitizeRuleValue(source.ruleContent.replaceRegex),
    } : undefined,
    rulePlay: source.rulePlay ? {
      ...source.rulePlay,
      url: sanitizeRuleValue(source.rulePlay.url),
      userAgent: sanitizeRuleValue(source.rulePlay.userAgent),
      referer: sanitizeRuleValue(source.rulePlay.referer),
    } : undefined,
  };
}

function sanitizeSources(sources: Source[]) {
  return sources
    .map((source) => sanitizeSource(source))
    .filter((source) => !!source.baseUrl || !!source.ruleSearch?.checkUrl || !!source.exploreUrl);
}
