import { Source, MediaItem, Chapter, SourceRequestConfig } from '../types';

type ParsedPayload =
  | { kind: 'html'; data: Document }
  | { kind: 'json'; data: any };

const inflightTextRequests = new Map<string, Promise<string | null>>();

function parsePayload(text: string): ParsedPayload {
  try {
    return {
      kind: 'json',
      data: JSON.parse(text),
    };
  } catch (e) {
    const parser = new DOMParser();
    return {
      kind: 'html',
      data: parser.parseFromString(text, 'text/html'),
    };
  }
}

function resolveUrl(value: string, baseUrl: string) {
  if (!value) return '';

  try {
    return new URL(value, baseUrl).toString();
  } catch (e) {
    return value;
  }
}

function normalizeSourceDetailUrl(detailUrl: string, sourceBaseUrl: string) {
  if (!detailUrl) return '';

  try {
    const parsedDetailUrl = new URL(detailUrl);
    const parsedSourceUrl = new URL(sourceBaseUrl);

    // 部分 HTML 规则在离线 DOM 上读取 element.href，会被浏览器补成 localhost。
    // 这里把这类“被本地开发域污染”的详情链接纠偏回真实源站。
    if ((parsedDetailUrl.hostname === 'localhost' || parsedDetailUrl.hostname === '127.0.0.1')
      && parsedDetailUrl.pathname
      && parsedSourceUrl.hostname !== parsedDetailUrl.hostname) {
      return new URL(`${parsedDetailUrl.pathname}${parsedDetailUrl.search}`, sourceBaseUrl).toString();
    }
  } catch (error) {
    return resolveUrl(detailUrl, sourceBaseUrl);
  }

  return detailUrl;
}

function inferMediaTypeFromDetailUrl(detailUrl: string, fallbackType: Source['type']) {
  const normalizedUrl = detailUrl.toLowerCase();

  if (/(?:\/|^)(comic|manhua|manga)(?:\/|$)/i.test(normalizedUrl)) {
    return 'comic';
  }

  if (/(?:\/|^)(video|movie|tv|play)(?:\/|$)/i.test(normalizedUrl)) {
    return 'video';
  }

  if (/(?:\/|^)(audio|tingshu|listen)(?:\/|$)/i.test(normalizedUrl)) {
    return 'audio';
  }

  return fallbackType;
}

function replaceSearchKeyword(urlTemplate: string, query: string) {
  return urlTemplate
    .replace(/\$\{key\}/g, encodeURIComponent(query))
    .replace(/\{\{key\}\}/g, encodeURIComponent(query))
    .replace(/\{\{page\}\}/g, '1')
    .replace(/\{\{\(page-1\)\*10\}\}/g, '0')
    .replace(/\{\{\(page-1\)\*12\}\}/g, '0')
    .replace(/\{\{\(page-1\)\*50\}\}/g, '0')
    .replace(/\{\{page\+10\}\}/g, '11')
    .replace(/\{\{page -1\}\}/g, '0')
    .replace(/\{\{page-1\}\}/g, '0');
}

function replaceRequestTemplate(value: string, query: string) {
  return value
    .replace(/\$\{key\}/g, query)
    .replace(/\{\{key\}\}/g, query)
    .replace(/\{\{page\}\}/g, '1')
    .replace(/\{\{\(page-1\)\*10\}\}/g, '0')
    .replace(/\{\{\(page-1\)\*12\}\}/g, '0')
    .replace(/\{\{\(page-1\)\*20\}\}/g, '0')
    .replace(/\{\{\(page-1\)\*50\}\}/g, '0')
    .replace(/\{\{page\+10\}\}/g, '11')
    .replace(/\{\{page -1\}\}/g, '0')
    .replace(/\{\{page-1\}\}/g, '0');
}

function sanitizeImageUrl(value: string) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\\//g, '/');
}

function pickHtmlLinkCandidate(element: Element | null) {
  if (!element) return '';

  const directValue = pickFirstString(
    element.getAttribute('href'),
    element.getAttribute('data-href'),
    element.getAttribute('data-url'),
    element.getAttribute('data-src'),
    element.getAttribute('url'),
    element.getAttribute('link')
  );

  if (directValue) {
    return directValue;
  }

  const onclick = element.getAttribute('onclick') || '';
  const onclickMatch = onclick.match(/(?:location\.href|window\.location|location)\s*=\s*['"]([^'"]+)['"]/i)
    || onclick.match(/open\(['"]([^'"]+)['"]/i);

  return onclickMatch?.[1] || '';
}

function extractFallbackBookContent(payload: ParsedPayload, chapterTitle?: string) {
  if (payload.kind !== 'html') {
    return '';
  }

  const doc = payload.data;
  // 只认阅读页里真正承载正文的容器，避免把站点导航、分类菜单一起抓进来。
  const containerSelectors = [
    '.article-content',
    '.read-content',
    '.yd_text2',
    '.contentbox',
    '#content',
  ];

  let container: Element | null = null;
  for (const selector of containerSelectors) {
    const matched = doc.querySelector(selector);
    if (matched instanceof Element) {
      container = matched;
      break;
    }
  }

  if (!(container instanceof Element)) {
    return '';
  }

  // 小说站的正文常常拆成多个 <p>，逐段拼起来比直接 innerHTML 更稳，
  // 也能顺手避开广告脚本和底部导航。
  const paragraphTexts = Array.from(container.querySelectorAll('p'))
    .map((item) => ((item as HTMLElement).innerText || item.textContent || '').trim())
    .filter(Boolean);

  if (paragraphTexts.length > 0) {
    const normalizedChapterTitle = (chapterTitle || '').trim();
    const cleanedParagraphs = paragraphTexts.filter((item, index) => {
      // 章节页首段经常会重复一次标题，阅读时保留它只会显得像“乱解析”。
      if (index === 0 && normalizedChapterTitle && item === normalizedChapterTitle) {
        return false;
      }
      return true;
    });

    return cleanedParagraphs.join('\n');
  }

  return ((container as HTMLElement).innerText || container.textContent || '').trim();
}

function buildComicImageHtml(urls: string[]) {
  return urls
    .filter(Boolean)
    .map((url) => `<img src="${url}" />`)
    .join('\n');
}

function normalizeTextContent(content: string) {
  if (!content) return '';

  if (!content.includes('<')) {
    return content.trim();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  return (doc.body.innerText || doc.body.textContent || '').trim();
}

function collectJsonObjectArrays(data: any, buckets: any[][] = []) {
  if (Array.isArray(data)) {
    if (data.length > 0 && data.some((item) => item && typeof item === 'object')) {
      buckets.push(data);
    }

    data.forEach((item) => collectJsonObjectArrays(item, buckets));
    return buckets;
  }

  if (data && typeof data === 'object') {
    Object.values(data).forEach((value) => collectJsonObjectArrays(value, buckets));
  }

  return buckets;
}

function summarizePayload(data: any) {
  if (Array.isArray(data)) {
    return {
      kind: 'array',
      length: data.length,
      sampleKeys: data[0] && typeof data[0] === 'object' ? Object.keys(data[0]).slice(0, 8) : [],
    };
  }

  if (data && typeof data === 'object') {
    return {
      kind: 'object',
      keys: Object.keys(data).slice(0, 12),
    };
  }

  return {
    kind: typeof data,
  };
}

function summarizeTextPayload(text: string) {
  const trimmed = text.trim();
  return {
    preview: trimmed.slice(0, 240),
    length: trimmed.length,
  };
}

function stringifyLogPayload(payload: Record<string, any>) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return `${payload}`;
  }
}

function extractDetailVariablesFromHtml(html: string) {
  const variables: Record<string, string> = {};
  if (!html) {
    return variables;
  }

  const patterns: Record<string, RegExp[]> = {
    bid: [
      /(?:\bbid\b|\bcomic_id\b)\s*[:=]\s*["']?(\d+)/i,
      /["']bid["']\s*[:,]\s*["']?(\d+)/i,
      /["']comic_id["']\s*[:,]\s*["']?(\d+)/i,
      /https?:\/\/m\.kanman\.com\/(\d+)\//i,
      /https?:\/\/www\.kanman\.com\/(\d+)\//i,
      /content=["'][^"']*kanman\.com\/(\d+)\//i,
    ],
  };

  Object.entries(patterns).forEach(([key, currentPatterns]) => {
    for (const pattern of currentPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        variables[key] = match[1];
        break;
      }
    }
  });

  return variables;
}

function parseRequestUrl(urlTemplate: string) {
  const [url, requestOptions] = urlTemplate.split(/,\s*(?=\{)/);
  return {
    url: url?.trim() || '',
    requestOptions: requestOptions?.trim(),
  };
}

function normalizeRequestOptions(requestOptions?: string) {
  if (!requestOptions) return undefined;

  try {
    const parsed = JSON.parse(requestOptions);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return JSON.stringify(parsed);
  } catch (error) {
    return undefined;
  }
}

function buildProxyOptions(requestConfig?: SourceRequestConfig) {
  if (!requestConfig) {
    return undefined;
  }

  const headers: Record<string, string> = {
    ...(requestConfig.headers || {}),
  };

  if (requestConfig.referer && !headers.Referer) {
    headers.Referer = requestConfig.referer;
  }

  if (requestConfig.contentType && !headers['Content-Type']) {
    headers['Content-Type'] = requestConfig.contentType;
  }

  const normalizedConfig = {
    method: requestConfig.method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: requestConfig.body,
  };

  if (!normalizedConfig.method && !normalizedConfig.headers && !normalizedConfig.body) {
    return undefined;
  }

  return JSON.stringify(normalizedConfig);
}

function buildResolvedRequestConfig(requestConfig: SourceRequestConfig | undefined, query: string) {
  if (!requestConfig) {
    return undefined;
  }

  const headers = Object.entries(requestConfig.headers || {}).reduce<Record<string, string>>((result, [key, value]) => {
    result[key] = replaceRequestTemplate(value, query);
    return result;
  }, {});

  return {
    ...requestConfig,
    headers,
    body: requestConfig.body ? replaceRequestTemplate(requestConfig.body, query) : undefined,
    referer: requestConfig.referer ? replaceRequestTemplate(requestConfig.referer, query) : undefined,
  };
}

function isExecutableRule(urlTemplate: string) {
  const trimmed = urlTemplate.trim();
  return trimmed.startsWith('@js:') || trimmed.startsWith('<js>') || trimmed.startsWith('<');
}

function parseExploreUrl(exploreUrl?: string) {
  if (!exploreUrl) return '';

  const firstLine = exploreUrl
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return '';

  const parts = firstLine.split('::');
  return parts[1] || parts[0] || '';
}

function stripJsonRulePrefix(rule: string) {
  return rule.replace(/^(json|JSon|JSON)\s*:/, '').trim();
}

function looksLikeJsonRule(rule?: string) {
  if (!rule) return false;

  const normalizedRule = stripJsonRulePrefix(rule.trim());
  if (!normalizedRule) return false;

  if (normalizedRule.startsWith('class.') || normalizedRule.startsWith('tag.') || normalizedRule.startsWith('id.')) {
    return false;
  }

  const alternatives = normalizedRule.split('||').map((item) => item.trim()).filter(Boolean);
  const isPathLikeAlternative = (alternative: string) => /^(?:\$\.?|\.?)?[A-Za-z_][\w$]*(?:\[(?:\*|-?\d+)\])?(?:\.[A-Za-z_][\w$]*(?:\[(?:\*|-?\d+)\])?)*$/.test(alternative);

  return normalizedRule.startsWith('$.')
    || normalizedRule.startsWith('$[')
    || normalizedRule.startsWith('.')
    || normalizedRule.includes('[*]')
    || normalizedRule.includes('||$.')
    || normalizedRule.includes('||$[')
    || normalizedRule.includes('&&$.')
    || normalizedRule.includes('&&$[')
    || alternatives.every(isPathLikeAlternative);
}

function buildRequestUrl(urlTemplate: string, baseUrl: string, query = '', requestConfig?: SourceRequestConfig) {
  const replacedUrl = replaceSearchKeyword(urlTemplate, query).trim();
  if (!replacedUrl || isExecutableRule(replacedUrl)) {
    return '';
  }

  const { url, requestOptions } = parseRequestUrl(replacedUrl);
  const resolvedUrl = resolveUrl(url, baseUrl).trim();
  const normalizedOptions = normalizeRequestOptions(requestOptions) || buildProxyOptions(buildResolvedRequestConfig(requestConfig, query));

  // 有些脏规则会把对象数组或 React 调试对象拼进 URL，这类请求必然失败，前端直接跳过。
  if (/[\[{].*layout_/i.test(resolvedUrl) || resolvedUrl.includes('[object Object]')) {
    return '';
  }

  // 这些模式代表当前 URL 里还残留未解析模板或脚本片段，继续请求只会制造噪音。
  if (
    resolvedUrl.includes('{{') ||
    resolvedUrl.includes('}}') ||
    resolvedUrl.includes('<') ||
    resolvedUrl.includes('>') ||
    resolvedUrl.includes('cookie.') ||
    resolvedUrl.includes('source.getKey') ||
    resolvedUrl.endsWith(',') ||
    resolvedUrl.includes('#')
  ) {
    return '';
  }

  if (!/^https?:\/\//i.test(resolvedUrl)) {
    return '';
  }

  return normalizedOptions ? `${resolvedUrl},${normalizedOptions}` : resolvedUrl;
}

function applyReplaceRegex(content: string, replaceRegex?: string) {
  if (!replaceRegex || !content) return content;

  const parts = replaceRegex.split('##');
  if (parts.length < 2) {
    return content;
  }

  const pattern = parts[1] || '';
  const replacement = parts[2] || '';
  if (!pattern) {
    return content;
  }

  try {
    return content.replace(new RegExp(pattern, 'gms'), replacement);
  } catch (error) {
    console.warn('Failed to apply replaceRegex:', error);
    return content;
  }
}

function isXPathRule(rule: string) {
  const trimmed = rule.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('.//') || trimmed.startsWith('./');
}

function withBaseUrl(context: any, baseUrl: string, extras?: Record<string, any>) {
  if (context?.kind === 'json' || context?.kind === 'html') {
    return {
      ...context,
      baseUrl,
      ...(extras || {}),
    };
  }

  if (context instanceof Element || context instanceof Document) {
    return {
      kind: 'html',
      data: context,
      baseUrl,
      ...(extras || {}),
    };
  }

  return {
    kind: 'json',
    data: context,
    baseUrl,
    ...(extras || {}),
  };
}

function getBookOrigin(baseUrl: string) {
  try {
    return new URL(baseUrl).origin;
  } catch (error) {
    return baseUrl;
  }
}

function createStableItemId(sourceId: string, detailUrl: string, index: number) {
  const seed = `${sourceId}::${detailUrl || index}`;
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }

  return `item-${Math.abs(hash)}-${index}`;
}

function pickFirstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function sanitizeJsSnippet(code: string) {
  return code
    .replace(/^@js:\s*/, '')
    .replace(/\bjava\.[^;\n]+;?/g, '')
    .replace(/\bcookie\.[^;\n]+;?/g, '')
    .replace(/\bsource\.[^;\n]+;?/g, '')
    .trim();
}

function isSafeJsSnippet(code: string) {
  if (!code) return false;

  if (/(?:^|[^\w])(eval|Function|fetch|XMLHttpRequest|window|document|localStorage|sessionStorage|globalThis|import|require)(?:[^\w]|$)/.test(code)) {
    return false;
  }

  if (/(?:^|[^\w])(for|while|class|new)(?:[^\w]|$)/.test(code)) {
    return false;
  }

  return true;
}

export const parserService = {
  /**
   * 章节规则命不中时，先从常见 JSON 字段里兜底提取章节名和章节地址。
   * 这里只处理“已经拿到明确章节 URL”的情况，避免生成不可读的伪章节。
   */
  extractFallbackChapters(chapterPayload: any, source: Source, baseUrl: string): Chapter[] {
    const payloadData = chapterPayload?.kind ? chapterPayload.data : chapterPayload;
    const arrays = collectJsonObjectArrays(payloadData);

    for (const currentArray of arrays) {
      const chapters = currentArray
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const title = pickFirstString(
            entry.chapterName,
            entry.chapter_name,
            entry.name,
            entry.title
          );

          const url = pickFirstString(
            entry.chapterUrl,
            entry.chapter_url,
            entry.url,
            entry.href,
            entry.link
          );

          if (!title || !url) {
            return null;
          }

          return {
            title,
            url: resolveUrl(url, baseUrl),
            sourceId: source.id,
          };
        })
        .filter((chapter): chapter is Chapter => !!chapter);

      if (chapters.length > 0) {
        return chapters;
      }
    }

    return [];
  },

  extractChaptersFromPayload(chapterPayload: any, source: Source, baseUrl: string, dynamicValues?: Record<string, string>): Chapter[] {
    const chapters: Chapter[] = [];
    const chapterElements = this.evaluateListRule(chapterPayload, source.ruleChapterList?.list);
    const chapterSamples: Array<{ title: string; url: string }> = [];
    console.info('[chapters] list evaluation:', stringifyLogPayload({
      sourceName: source.name,
      sourceType: source.type,
      baseUrl,
      chapterListRule: source.ruleChapterList?.list,
      chapterElementCount: chapterElements.length,
    }));

    chapterElements.forEach((chapterItem) => {
      const chapterContext = withBaseUrl(chapterItem, baseUrl, {
        source: {
          baseUrl: source.baseUrl,
          name: source.name,
          type: source.type,
        },
        headers: source.ruleChapterList?.request?.headers || {},
      });
      const title = this.evaluateRule(chapterContext, source.ruleChapterList?.name) || '';
      let url = this.evaluateRule(chapterContext, source.ruleChapterList?.url) || '';

      // 一些目录规则虽然写的是 href，但实际运行时会因为规则解释差异拿不到值。
      // 这里直接基于当前目录节点补一次链接提取，优先保证常见 HTML 目录可读。
      if (!url && source.ruleChapterList?.url === 'href' && chapterItem instanceof Element) {
        url = pickHtmlLinkCandidate(chapterItem);

        if (!url) {
          const parentLink = chapterItem.closest('a[href],[data-href],[data-url],[onclick]');
          if (parentLink) {
            url = pickHtmlLinkCandidate(parentLink);
          }
        }

        if (!url) {
          const childLink = chapterItem.querySelector('a[href],[data-href],[data-url],[onclick]');
          if (childLink) {
            url = pickHtmlLinkCandidate(childLink);
          }
        }
      }

      if (url.includes('@get:{')) {
        const html = chapterPayload?.kind === 'html'
          ? chapterPayload.data?.documentElement?.outerHTML || ''
          : '';
        const mergedDynamicValues = {
          ...extractDetailVariablesFromHtml(html),
          ...(dynamicValues || {}),
        };

        Object.entries(mergedDynamicValues).forEach(([key, value]) => {
          url = url.replace(new RegExp(`@get:\\{${key}\\}`, 'g'), value);
        });
      }

      if (chapterSamples.length < 5) {
        chapterSamples.push({ title, url });
      }

      if (title && url) {
        chapters.push({
          title,
          url: resolveUrl(url, baseUrl),
          sourceId: source.id
        });
      }
    });

    if (chapters.length > 0) {
      return chapters;
    }

    console.warn('[chapters] extracted samples:', stringifyLogPayload({
      sourceName: source.name,
      sourceType: source.type,
      chapterNameRule: source.ruleChapterList?.name,
      chapterUrlRule: source.ruleChapterList?.url,
      samples: chapterSamples,
    }));

    const fallbackChapters = this.extractFallbackChapters(chapterPayload, source, baseUrl);
    if (fallbackChapters.length > 0) {
      console.info('Fallback chapters extracted:', {
        sourceName: source.name,
        chapterCount: fallbackChapters.length,
        firstChapter: fallbackChapters[0]?.title,
      });
    }

    return fallbackChapters;
  },

  /**
   * 当前搜索链路只稳定支持直接 GET 的书源。
   * 这里先过滤掉明显还带脚本、模板残留或缺少可解析列表规则的源，避免全网搜索时噪音过大。
   */
  isSearchSourceCompatible(source: Source, query: string) {
    if (!source.enabled || !source.ruleSearch?.checkUrl || !source.ruleSearch?.list) {
      return false;
    }

    const sourceText = `${source.name} ${source.group || ''} ${source.baseUrl}`.toLowerCase();

    // 这些源从日志看大多不是阅读类内容，或者被站点强限制，继续参与全网搜索只会放大噪音。
    if (/(weibo|xiuren|jpxgyw|yeseimg|lofter|superbeautygirl|blog|套图|写真|图集|微博)/i.test(sourceText)) {
      return false;
    }

    return !!buildRequestUrl(source.ruleSearch.checkUrl, source.baseUrl, query);
  },

  isDiscoverySourceCompatible(source: Source) {
    const discoveryUrl = parseExploreUrl(source.exploreUrl) || source.baseUrl;
    if (!source.enabled || !discoveryUrl) {
      return false;
    }

    const rule = source.ruleExplore || source.ruleSearch;
    if (!rule?.list) {
      return false;
    }

    const sourceText = `${source.name} ${source.group || ''} ${source.baseUrl}`.toLowerCase();
    if (/(weibo|xiuren|jpxgyw|yeseimg|lofter|superbeautygirl|blog|套图|写真|图集|微博)/i.test(sourceText)) {
      return false;
    }

    return !!buildRequestUrl(discoveryUrl, source.baseUrl, '', source.ruleExplore?.request);
  },

  getSearchPriority(source: Source) {
    const url = `${source.ruleSearch?.checkUrl || ''} ${source.baseUrl}`.toLowerCase();
    let score = 0;

    // API 和明显的搜索接口通常更稳定，也更容易被当前解析器吃掉。
    if (url.includes('/api/')) score += 5;
    if (url.includes('search')) score += 3;
    if (url.startsWith('https://')) score += 1;

    // 这些站点在当前环境下高频超时或拒绝，先往后放，确保前面的可用源先出结果。
    if (/(weibo|uaa\.com|jpxgyw|bdido|77mh|hanmandq|bwhanman)/i.test(url)) score -= 6;
    if (/(manhuatai|mkzhan|ac\.qq|kuaikan|baozimh|copymanga|kaimanhua)/i.test(url)) score += 2;

    return score;
  },

  getDiscoveryPriority(source: Source) {
    const url = `${parseExploreUrl(source.exploreUrl) || source.baseUrl} ${source.name} ${source.group || ''}`.toLowerCase();
    let score = 0;

    if (url.includes('/api/')) score += 5;
    if (url.includes('list')) score += 3;
    if (url.includes('rank') || url.includes('category') || url.includes('update')) score += 2;
    if (url.startsWith('https://')) score += 1;

    if (/(weibo|jpxgyw|bwhanman|hanmandq|bdido|77mh)/i.test(url)) score -= 6;
    if (/(manhuatai|mkzhan|taomanhua|iyouman|kanman|qq|iqiyi|qiremanhua)/i.test(url)) score += 3;

    return score;
  },

  getFallbackListValue(item: any, field: 'title' | 'author' | 'cover' | 'detailUrl') {
    if (!item) return '';

    if (item instanceof Element) {
      if (field === 'title') {
        return pickFirstString(
          item.getAttribute('title'),
          item.querySelector('[title]')?.getAttribute('title'),
          item.querySelector('img')?.getAttribute('alt'),
          item.textContent
        );
      }

      if (field === 'author') {
        return pickFirstString(
          item.getAttribute('author'),
          item.querySelector('[data-author]')?.getAttribute('data-author'),
          item.querySelector('.author')?.textContent,
          item.querySelector('[class*="author"]')?.textContent
        );
      }

      if (field === 'cover') {
        return pickFirstString(
          item.querySelector('img')?.getAttribute('src'),
          item.querySelector('img')?.getAttribute('data-src')
        );
      }

      if (field === 'detailUrl') {
        return pickFirstString(
          item.getAttribute('href'),
          item.querySelector('a')?.getAttribute('href'),
          item.querySelector('[href]')?.getAttribute('href')
        );
      }
    }

    if (typeof item === 'object') {
      if (field === 'title') {
        return pickFirstString(item.title, item.Title, item.name, item.bookName, item.book_name, item.opusName, item.comic_name);
      }

      if (field === 'author') {
        return pickFirstString(item.author, item.Author, item.authorName, item.writer, item.writer_name);
      }

      if (field === 'cover') {
        return pickFirstString(item.cover, item.coverUrl, item.cover_url, item.thumbUrl, item.thumb_url, item.opusUrl, item.image);
      }

      if (field === 'detailUrl') {
        return pickFirstString(item.detailUrl, item.bookUrl, item.url, item.Url, item.urlKey, item.UrlKey, item.href);
      }
    }

    return '';
  },

  applySafeJsTransform(initialValue: any, jsCode: string, context: { baseUrl?: string } = {}) {
    const sanitizedCode = sanitizeJsSnippet(jsCode);
    if (!isSafeJsSnippet(sanitizedCode)) {
      return initialValue;
    }

    const executableCode = sanitizedCode
      .replace(
        /if\s*\(([^)]+)\)\s*\{([\s\S]*?)(`[\s\S]*?`|'[^']*'|"[^"]*"|result)\s*\}\s*else\s*\{(`[\s\S]*?`|'[^']*'|"[^"]*"|result)\s*\}\s*$/m,
        'if ($1) {$2 __out = $3;} else { __out = $4; }'
      );

    const statements = executableCode
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    const lastSemicolonIndex = statements.lastIndexOf(';');
    const prefix = lastSemicolonIndex >= 0 ? statements.slice(0, lastSemicolonIndex + 1) : '';
    const suffix = lastSemicolonIndex >= 0 ? statements.slice(lastSemicolonIndex + 1).trim() : statements.trim();
    const transformedCode = suffix
      ? `${prefix}\n__out = ${suffix};`
      : `${prefix}\n__out = result;`;

    try {
      const runner = new Function(
        'scope',
        `
          "use strict";
          let { result, baseUrl, book, headers, source } = scope;
          let __out = result;
          ${transformedCode}
          return __out;
        `
      );

      return runner({
        result: initialValue,
        baseUrl: context.baseUrl || '',
        book: {
          origin: getBookOrigin(context.baseUrl || ''),
        },
        headers: (context as any).headers || {},
        source: (context as any).source || {},
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error || ''}`;
      if ((error instanceof TypeError) || /match\(.+\)\[1\]/.test(message)) {
        return initialValue;
      }
      console.warn('Safe JS transform failed:', error);
      return initialValue;
    }
  },

  async fetchSourceText(urlTemplate: string, signal?: AbortSignal) {
    const { url, requestOptions } = parseRequestUrl(urlTemplate);
    if (!url) return null;
    const requestKey = `${url}::${requestOptions || ''}`;

    if (!signal && inflightTextRequests.has(requestKey)) {
      return inflightTextRequests.get(requestKey)!;
    }

    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    signal?.addEventListener('abort', abortRequest, { once: true });
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    const requestPromise = (async () => {
      const query = new URLSearchParams({ url });
      if (requestOptions) {
        query.set('options', requestOptions);
      }

      const response = await fetch(`/api/proxy?${query.toString()}`, {
        signal: controller.signal,
      });

      if (response.headers.get('x-proxy-error') === '1') {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      return await response.text();
    })().catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      console.warn('Source request failed:', error);
      return null;
    }).finally(() => {
      signal?.removeEventListener('abort', abortRequest);
      window.clearTimeout(timeoutId);
      inflightTextRequests.delete(requestKey);
    });

    if (!signal) {
      inflightTextRequests.set(requestKey, requestPromise);
    }

    return requestPromise;
  },

  async search(query: string, sources: Source[], options?: { onResults?: (items: MediaItem[]) => void; signal?: AbortSignal }): Promise<MediaItem[]> {
    const enabledSources = sources
      .filter((source) => this.isSearchSourceCompatible(source, query))
      .sort((left, right) => this.getSearchPriority(right) - this.getSearchPriority(left))
      .slice(0, 24);
    const allResults: MediaItem[] = [];
    const maxConcurrent = 6;

    for (let index = 0; index < enabledSources.length; index += maxConcurrent) {
      const batch = enabledSources.slice(index, index + maxConcurrent);

      await Promise.all(batch.map(async (source) => {
        try {
          if (options?.signal?.aborted) return;
          if (!source.ruleSearch?.checkUrl) return;

          const searchUrl = buildRequestUrl(source.ruleSearch.checkUrl, source.baseUrl, query, source.ruleSearch.request);
          if (!searchUrl) return;
          const text = await this.fetchSourceText(searchUrl, options?.signal);
          if (!text) return;

          const results = this.parseList(text, source, 'search');
          if (results.length > 0) {
            console.info('[search] source matched:', stringifyLogPayload({
              sourceName: source.name,
              sourceType: source.type,
              resultCount: results.length,
              firstTitle: results[0]?.title,
            }));
            allResults.push(...results);
            options?.onResults?.([...allResults]);
          }
        } catch (e) {
          console.error(`Search failed for ${source.name}:`, e);
        }
      }));

      // 一旦已经有结果，就继续增量补充，但不需要再把请求洪峰拉得太高。
      if (allResults.length >= 30 || options?.signal?.aborted) {
        break;
      }
    }

    console.info('[search] summary:', stringifyLogPayload({
      query,
      attemptedSources: enabledSources.length,
      resultCount: allResults.length,
      sourceTypes: enabledSources.reduce<Record<string, number>>((result, source) => {
        result[source.type] = (result[source.type] || 0) + 1;
        return result;
      }, {}),
    }));

    return allResults.length > 0 ? allResults : this.getMockResults(query);
  },

  async getDiscovery(sources: Source[], options?: { signal?: AbortSignal }): Promise<MediaItem[]> {
    const enabledSources = sources
      .filter((source) => this.isDiscoverySourceCompatible(source))
      .sort((left, right) => this.getDiscoveryPriority(right) - this.getDiscoveryPriority(left))
      .slice(0, 18);
    const allResults: MediaItem[] = [];

    for (const source of enabledSources) {
      try {
        if (options?.signal?.aborted) {
          break;
        }

        // If it's a demo source, provide mock discovery data
        if (source.id.startsWith('demo')) {
          allResults.push(...this.getMockDiscovery(source));
          continue;
        }

        const discoveryUrl = buildRequestUrl(parseExploreUrl(source.exploreUrl) || source.baseUrl, source.baseUrl, '', source.ruleExplore?.request);
        if (!discoveryUrl) continue;
        const text = await this.fetchSourceText(discoveryUrl, options?.signal);
        if (!text) continue;

        const results = this.parseList(text, source, 'discovery');
        allResults.push(...results.slice(0, 5)); // Just take a few
      } catch (e) {
        console.error(`Discovery failed for ${source.name}:`, e);
      }
    }

    return allResults;
  },
  
  async getDetails(item: MediaItem, source?: Source): Promise<{ description: string, chapters: Chapter[] }> {
    if (!source || !item.detailUrl) {
      return {
        description: '这是一个示例描述。',
        chapters: Array(20).fill(0).map((_, i) => ({
          title: `第 ${i + 1} 章`,
          url: `chapter-${i}`,
          sourceId: item.sourceId
        }))
      };
    }

    try {
      const detailPageUrl = normalizeSourceDetailUrl(item.detailUrl, source.baseUrl);
      const detailRequestUrl = buildRequestUrl(detailPageUrl, source.baseUrl, '', source.ruleBookInfo?.request) || detailPageUrl;
      const text = await this.fetchSourceText(detailRequestUrl);
      if (!text) {
        return { description: '解析失败', chapters: [] };
      }

      console.info('[details] raw response:', text);

      const payload = withBaseUrl(parsePayload(text), detailPageUrl || source.baseUrl, {
        source: {
          baseUrl: source.baseUrl,
          name: source.name,
          type: source.type,
        },
        headers: source.ruleBookInfo?.request?.headers || {},
      });
      console.info('[details] payload loaded:', stringifyLogPayload({
        sourceName: source.name,
        sourceType: source.type,
        title: item.title,
        detailUrl: detailRequestUrl,
        detailPayloadSummary: payload?.kind === 'json'
          ? summarizePayload(payload.data)
          : summarizeTextPayload(text),
      }));
      const description = this.evaluateRule(payload, source.ruleBookInfo?.intro) || '暂无描述';
      let chapters: Chapter[] = [];
      const detailDynamicValues = payload.kind === 'html'
        ? extractDetailVariablesFromHtml(text)
        : {};
      const detailPayloadSummary = payload?.kind === 'json'
        ? summarizePayload(payload.data)
        : summarizeTextPayload(text);

      const catalogUrlRule = source.ruleBookInfo?.catalogUrl;
      let chapterPayload = payload;
      let chapterBaseUrl = detailPageUrl || source.baseUrl;
      let catalogText = '';
      if (catalogUrlRule) {
        const evaluatedCatalogUrl = this.evaluateRule(payload, catalogUrlRule) || resolveUrl(catalogUrlRule, detailPageUrl);
        console.info('[details] catalog url evaluated:', stringifyLogPayload({
          sourceName: source.name,
          sourceType: source.type,
          title: item.title,
          catalogUrlRule,
          evaluatedCatalogUrl,
        }));
        const catalogPageUrl = resolveUrl(evaluatedCatalogUrl, chapterBaseUrl);
        const catalogRequestUrl = buildRequestUrl(catalogPageUrl, chapterBaseUrl, '', source.ruleChapterList?.request) || catalogPageUrl;
        catalogText = await this.fetchSourceText(catalogRequestUrl) || '';
        if (catalogText) {
          console.info('[details] raw catalog response:', catalogText);
        }
        if (catalogText) {
          chapterPayload = withBaseUrl(parsePayload(catalogText), catalogPageUrl, {
            source: {
              baseUrl: source.baseUrl,
              name: source.name,
              type: source.type,
            },
            headers: source.ruleChapterList?.request?.headers || {},
          });
          chapterBaseUrl = catalogPageUrl;
        }
      }

      chapters = this.extractChaptersFromPayload(chapterPayload, source, chapterBaseUrl, detailDynamicValues);

      // 有些漫画源的目录接口不稳定，但详情页本身已经带了章节链接，这里再回退试一次。
      if (chapters.length === 0 && chapterPayload !== payload) {
        chapters = this.extractChaptersFromPayload(payload, source, detailPageUrl || source.baseUrl, detailDynamicValues);
      }

      if (chapters.length === 0) {
        const chapterPayloadSummary = chapterPayload?.kind
          ? summarizePayload(chapterPayload.data)
          : summarizePayload(chapterPayload);

        console.warn('No readable chapters parsed for source:', stringifyLogPayload({
          sourceName: source.name,
          sourceType: source.type,
          title: item.title,
          detailUrl: item.detailUrl,
          catalogUrlRule: source.ruleBookInfo?.catalogUrl,
          chapterListRule: source.ruleChapterList?.list,
          chapterNameRule: source.ruleChapterList?.name,
          chapterUrlRule: source.ruleChapterList?.url,
          detailPayloadSummary,
          chapterPayloadSummary,
          detailPreview: summarizeTextPayload(text),
          catalogPreview: catalogText ? summarizeTextPayload(catalogText) : null,
        }));
      } else if (source.type === 'comic') {
        console.info('Chapters parsed for comic source:', stringifyLogPayload({
          sourceName: source.name,
          sourceType: source.type,
          title: item.title,
          chapterCount: chapters.length,
          firstChapter: chapters[0]?.title,
          chapterPayloadKind: chapterPayload?.kind,
        }));
      }

      return { description, chapters };
    } catch (e) {
      console.error('Failed to get details:', e);
      return { description: '解析失败', chapters: [] };
    }
  },
  
  async getContent(chapter: Chapter, source?: Source): Promise<string> {
    if (!source || !chapter.url) {
      return '这是示例章节内容...\n\n聚合阅读器正在解析您的自定义源规则。';
    }

    try {
      const contentUrl = buildRequestUrl(chapter.url, source.baseUrl, '', source.ruleContent?.request) || chapter.url;
      console.info('[content] request:', stringifyLogPayload({
        sourceName: source.name,
        sourceType: source.type,
        chapterTitle: chapter.title,
        chapterUrl: chapter.url,
        contentUrl,
      }));
      const text = await this.fetchSourceText(contentUrl);
      if (!text) {
        return '获取内容失败';
      }

      console.info('[content] raw response:', text);

      if (source.type === 'comic') {
        const comicContent = this.getComicContent(text, source, contentUrl);
        if (comicContent) {
          return comicContent;
        }
      }

      let payload = withBaseUrl(parsePayload(text), contentUrl, {
        source: {
          baseUrl: source.baseUrl,
          name: source.name,
          type: source.type,
        },
        headers: source.ruleContent?.request?.headers || {},
      });
      const contentParts: string[] = [];
      const visitedContentUrls = new Set<string>([contentUrl]);
      let currentUrl = contentUrl;

      for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
        let rawContent = this.evaluateRule(payload, source.ruleContent?.content);
        if (!rawContent && source.type === 'book') {
          rawContent = extractFallbackBookContent(payload, chapter.title);
        }
        if (rawContent) {
          contentParts.push(rawContent);
        }

        const nextContentRule = source.ruleContent?.nextContentUrl || source.ruleContent?.nextPageUrl;
        if (!nextContentRule) break;

        const nextUrl = this.evaluateRule(payload, nextContentRule);
        const resolvedNextUrl = resolveUrl(nextUrl, currentUrl);
        if (!resolvedNextUrl || visitedContentUrls.has(resolvedNextUrl)) {
          break;
        }

        visitedContentUrls.add(resolvedNextUrl);
        currentUrl = resolvedNextUrl;
        const nextRequestUrl = buildRequestUrl(resolvedNextUrl, currentUrl, '', source.ruleContent?.request) || resolvedNextUrl;
        const nextText = await this.fetchSourceText(nextRequestUrl);
        if (!nextText) break;
        payload = withBaseUrl(parsePayload(nextText), nextRequestUrl, {
          source: {
            baseUrl: source.baseUrl,
            name: source.name,
            type: source.type,
          },
          headers: source.ruleContent?.request?.headers || {},
        });
      }

      const mergedContent = contentParts.join('\n');
      const cleanedContent = applyReplaceRegex(mergedContent, source.ruleContent?.replaceRegex);
      const normalizedContent = normalizeTextContent(cleanedContent);
      console.info('[content] parsed:', stringifyLogPayload({
        sourceName: source.name,
        sourceType: source.type,
        chapterTitle: chapter.title,
        contentLength: normalizedContent.length,
        hasHtmlImages: mergedContent.includes('<img'),
      }));

      return normalizedContent || '解析内容失败';
    } catch (e) {
      console.error('Failed to get content:', e);
      return '获取内容失败';
    }
  },

  // Helper to parse lists (search/discovery)
  parseList(text: string, source: Source, type: 'search' | 'discovery'): MediaItem[] {
    const items: MediaItem[] = [];
    try {
      const rule = type === 'discovery' ? (source.ruleExplore || source.ruleSearch) : source.ruleSearch;
      const payload = withBaseUrl(parsePayload(text), source.baseUrl, {
        source: {
          baseUrl: source.baseUrl,
          name: source.name,
          type: source.type,
        },
        headers: rule?.request?.headers || {},
      });
      if (!rule?.list) return [];

      const elements = this.evaluateListRule(payload, rule.list);
      elements.forEach((el, idx) => {
        const itemContext = withBaseUrl(el, source.baseUrl, {
          source: {
            baseUrl: source.baseUrl,
            name: source.name,
            type: source.type,
          },
          headers: rule?.request?.headers || {},
        });
        const title = this.evaluateRule(itemContext, rule.name) || this.getFallbackListValue(el, 'title') || '未知标题';
        const author = this.evaluateRule(itemContext, rule.author) || this.getFallbackListValue(el, 'author') || '未知作者';
        const cover = this.evaluateRule(itemContext, rule.cover) || this.getFallbackListValue(el, 'cover') || '';
        const detailUrl = this.evaluateRule(itemContext, rule.detailUrl) || this.getFallbackListValue(el, 'detailUrl') || '';

        if (title && detailUrl) {
          const normalizedDetailUrl = normalizeSourceDetailUrl(resolveUrl(detailUrl, source.baseUrl), source.baseUrl);
          const itemType = inferMediaTypeFromDetailUrl(normalizedDetailUrl, source.type);
          items.push({
            id: createStableItemId(source.id, detailUrl, idx),
            sourceId: source.id,
            title,
            author,
            cover: resolveUrl(cover, source.baseUrl),
            detailUrl: normalizedDetailUrl,
            type: itemType
          });
        }
      });
    } catch (e) {
      console.error('List parsing failed:', e);
    }
    return items;
  },

  /**
   * 当前只兼容项目里最常见的 Legado 规则子集:
   * 1. HTML CSS / class/tag/id 链式规则
   * 2. JSON 对象字段与简单数组路径
   * 3. 模板字符串里的 {{$.field}} 占位符
   */
  evaluateRule(context: any, rule?: string): string {
    if (!rule) return '';

    try {
      const [baseRule, jsCode] = rule.split('@js:');
      if (rule.includes('<js>')) return '';
      const normalizedRule = stripJsonRulePrefix(rule);

      const baseValue = (() => {
        const effectiveRule = stripJsonRulePrefix(baseRule?.trim() || '');
        if (!effectiveRule && jsCode) {
          return '';
        }

        if (context?.kind === 'json') {
          return this.evaluateJsonValue(context.data, effectiveRule || normalizedRule);
        }

        if (context?.kind === 'html') {
          if (looksLikeJsonRule(effectiveRule || normalizedRule)) {
            return '';
          }
          return this.evaluateHtmlValue(context.data, effectiveRule || normalizedRule);
        }

        if (context instanceof Element || context instanceof Document) {
          if (looksLikeJsonRule(effectiveRule || normalizedRule)) {
            return '';
          }
          return this.evaluateHtmlValue(context, effectiveRule || normalizedRule);
        }

        return this.evaluateJsonValue(context, effectiveRule || normalizedRule);
      })();

      if (jsCode) {
        const transformedValue = this.applySafeJsTransform(baseValue, jsCode, {
          baseUrl: typeof context?.baseUrl === 'string'
            ? context.baseUrl
            : typeof context?.detailUrl === 'string'
              ? context.detailUrl
              : '',
        });
        return transformedValue == null ? '' : `${transformedValue}`.trim();
      }

      if (context?.kind === 'json') {
        return this.evaluateJsonValue(context.data, normalizedRule);
      }

      if (context?.kind === 'html') {
        if (looksLikeJsonRule(normalizedRule)) {
          return '';
        }
        return this.evaluateHtmlValue(context.data, normalizedRule);
      }

      if (context instanceof Element || context instanceof Document) {
        if (looksLikeJsonRule(normalizedRule)) {
          return '';
        }
        return this.evaluateHtmlValue(context, normalizedRule);
      }

      return this.evaluateJsonValue(context, normalizedRule);
    } catch (e) {
      return '';
    }
  },

  evaluateListRule(context: any, rule?: string): any[] {
    if (!rule || rule.includes('<js>')) {
      return [];
    }

    const normalizedRule = stripJsonRulePrefix(rule);

    if (context?.kind === 'json') {
      return this.evaluateJsonList(context.data, normalizedRule);
    }

    if (context?.kind === 'html') {
      if (looksLikeJsonRule(normalizedRule)) {
        return [];
      }
      return this.evaluateHtmlList(context.data, normalizedRule);
    }

    if (context instanceof Element || context instanceof Document) {
      if (looksLikeJsonRule(normalizedRule)) {
        return [];
      }
      return this.evaluateHtmlList(context, normalizedRule);
    }

    return this.evaluateJsonList(context, normalizedRule);
  },

  evaluateHtmlList(context: Element | Document, rule?: string): Element[] {
    if (!rule) return [];
    const normalizedRule = stripJsonRulePrefix(rule);

    if (looksLikeJsonRule(normalizedRule)) {
      return [];
    }

    if (normalizedRule.includes('||')) {
      for (const alternative of normalizedRule.split('||').map((item) => item.trim()).filter(Boolean)) {
        const result = this.evaluateHtmlList(context, alternative);
        if (result.length > 0) {
          return result;
        }
      }
      return [];
    }

    if (isXPathRule(normalizedRule)) {
      return this.evaluateXPathList(context, normalizedRule);
    }

    if (!normalizedRule.includes('@') && !normalizedRule.startsWith('class.') && !normalizedRule.startsWith('tag.') && !normalizedRule.startsWith('id.')) {
      try {
        return Array.from(context.querySelectorAll(normalizedRule));
      } catch (error) {
        return [];
      }
    }

    const target = this.resolveHtmlTarget(context, normalizedRule, true);
    if (Array.isArray(target)) return target.filter((item) => item instanceof Element);
    return target instanceof Element ? [target] : [];
  },

  evaluateHtmlValue(context: Element | Document, rule?: string): string {
    if (!rule) return '';
    const normalizedRule = stripJsonRulePrefix(rule);

    if (looksLikeJsonRule(normalizedRule)) {
      return '';
    }

    if (normalizedRule.includes('||')) {
      for (const alternative of normalizedRule.split('||').map((item) => item.trim()).filter(Boolean)) {
        const result = this.evaluateHtmlValue(context, alternative);
        if (result) {
          return result;
        }
      }
      return '';
    }

    if (normalizedRule.includes('&&')) {
      return normalizedRule
        .split('&&')
        .map((part) => this.evaluateHtmlValue(context, part.trim()))
        .filter(Boolean)
        .join(' ');
    }

    if (isXPathRule(normalizedRule)) {
      return this.evaluateXPathValue(context, normalizedRule);
    }

    // Legado 里经常直接写 href/src/text 这类裸属性规则，
    // 这里应该读取当前节点，而不是把它误当成 CSS 选择器。
    if (['text', 'href', 'src', 'html'].includes(normalizedRule) && context instanceof Element) {
      const element = context;
      if (normalizedRule === 'text') return ((element as HTMLElement).innerText || element.textContent || '').trim();
      if (normalizedRule === 'html') return element.innerHTML || '';
      if (normalizedRule === 'href') {
        const directHref = pickHtmlLinkCandidate(element);
        if (directHref) return directHref;

        const parentLink = element.closest('a[href],[data-href],[data-url],[onclick]');
        if (parentLink) return parentLink.getAttribute('href') || '';

        const childLink = element.querySelector('a[href],[data-href],[data-url],[onclick]');
        if (childLink) return childLink.getAttribute('href') || '';

        return (element as HTMLAnchorElement).href || '';
      }

      if (normalizedRule === 'src') {
        const directSrc = element.getAttribute('src');
        if (directSrc) return directSrc;

        const childImage = element.querySelector('img[src],img[data-src]');
        if (childImage) {
          return childImage.getAttribute('src') || childImage.getAttribute('data-src') || '';
        }

        return (element as HTMLImageElement).src || '';
      }
    }

    if (!normalizedRule.includes('@') && !normalizedRule.startsWith('class.') && !normalizedRule.startsWith('tag.') && !normalizedRule.startsWith('id.')) {
      try {
        const element = context.querySelector(normalizedRule);
        return element instanceof HTMLElement ? (element.innerText || element.textContent || '').trim() : '';
      } catch (error) {
        return '';
      }
    }

    const segments = normalizedRule.split('@').map((item) => item.trim()).filter(Boolean);
    if (segments.length === 0) return '';

    const lastSegment = segments[segments.length - 1];
    const hasAttribute = ['text', 'href', 'src', 'html'].includes(lastSegment) || !lastSegment.includes('.');
    const targetRule = hasAttribute ? segments.slice(0, -1).join('@') : normalizedRule;
    const target = targetRule ? this.resolveHtmlTarget(context, targetRule, false) : context;
    const element = Array.isArray(target) ? target[0] : target;

    if (!(element instanceof Element)) return '';

    const attr = hasAttribute ? lastSegment : 'text';
    if (attr === 'text') return ((element as HTMLElement).innerText || element.textContent || '').trim();
    // 对 detached DOM 优先读原始属性，避免浏览器把相对链接补成 localhost。
    if (attr === 'href') {
      const directHref = pickHtmlLinkCandidate(element);
      if (directHref) {
        return directHref;
      }

      // 很多目录规则命中的是链接里的文本容器，而不是 <a> 本身，这里顺手向外和向内补一次。
      const parentLink = element.closest('a[href],[data-href],[data-url],[onclick]');
      if (parentLink) {
        return pickHtmlLinkCandidate(parentLink);
      }

      const childLink = element.querySelector('a[href],[data-href],[data-url],[onclick]');
      if (childLink) {
        return pickHtmlLinkCandidate(childLink);
      }

      return (element as HTMLAnchorElement).href || '';
    }

    if (attr === 'src') {
      const directSrc = element.getAttribute('src');
      if (directSrc) {
        return directSrc;
      }

      const childImage = element.querySelector('img[src],img[data-src]');
      if (childImage) {
        return childImage.getAttribute('src') || childImage.getAttribute('data-src') || '';
      }

      return (element as HTMLImageElement).src || '';
    }
    if (attr === 'html') return element.innerHTML || '';

    return element.getAttribute(attr) || '';
  },

  evaluateXPathList(context: Element | Document, rule: string): Element[] {
    const doc = context instanceof Document ? context : context.ownerDocument;
    if (!doc) return [];

    try {
      const result = doc.evaluate(
        rule,
        context,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const nodes: Element[] = [];
      for (let index = 0; index < result.snapshotLength; index++) {
        const node = result.snapshotItem(index);
        if (node instanceof Element) {
          nodes.push(node);
        }
      }
      return nodes;
    } catch (error) {
      console.warn('Failed to evaluate XPath list:', error);
      return [];
    }
  },

  evaluateXPathValue(context: Element | Document, rule: string): string {
    const doc = context instanceof Document ? context : context.ownerDocument;
    if (!doc) return '';

    try {
      const stringResult = doc.evaluate(
        rule,
        context,
        null,
        XPathResult.STRING_TYPE,
        null
      ).stringValue;

      if (stringResult) {
        return stringResult.trim();
      }

      const nodeResult = doc.evaluate(
        rule,
        context,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const values: string[] = [];
      for (let index = 0; index < nodeResult.snapshotLength; index++) {
        const node = nodeResult.snapshotItem(index);
        if (!node) continue;

        if (node.nodeType === Node.ATTRIBUTE_NODE || node.nodeType === Node.TEXT_NODE) {
          values.push((node.nodeValue || '').trim());
          continue;
        }

        if (node instanceof Element) {
          values.push(((node as HTMLElement).innerText || node.textContent || '').trim());
        }
      }

      return values.filter(Boolean).join(' ');
    } catch (error) {
      console.warn('Failed to evaluate XPath value:', error);
      return '';
    }
  },

  resolveHtmlTarget(context: Element | Document, rule: string, keepList: boolean): Element[] | Element | null {
    const segments = rule.split('@').map((item) => item.trim()).filter(Boolean);
    let current: Array<Element | Document> = [context];

    for (const segment of segments) {
      const next: Element[] = [];

      current.forEach((item) => {
        if (!(item instanceof Element || item instanceof Document)) return;

        if (/^-?\d+$/.test(segment)) {
          const rawIndex = Number(segment);
          const resolvedIndex = rawIndex < 0 ? current.length + rawIndex : rawIndex;
          const indexed = current[resolvedIndex];
          if (indexed instanceof Element) {
            next.push(indexed);
          }
          return;
        }

        const { selector, index } = this.parseLegadoSelector(segment);
        const matched = Array.from(item.querySelectorAll(selector));
        if (typeof index === 'number') {
          const resolvedIndex = index < 0 ? matched.length + index : index;
          if (matched[resolvedIndex]) {
            next.push(matched[resolvedIndex]);
          }
          return;
        }
        next.push(...matched);
      });

      current = next;
      if (current.length === 0) {
        return keepList ? [] : null;
      }
    }

    const htmlElements = current.filter((item): item is Element => item instanceof Element);
    return keepList ? htmlElements : (htmlElements[0] || null);
  },

  parseLegadoSelector(segment: string): { selector: string; index?: number } {
    if (/^-?\d+$/.test(segment)) {
      return { selector: '*', index: Number(segment) };
    }

    if (!segment.includes('.')) {
      return { selector: segment };
    }

    const parts = segment.split('.').filter(Boolean);
    const kind = parts.shift() || '';
    const lastPart = parts[parts.length - 1];
    const hasIndex = /^-?\d+$/.test(lastPart || '');
    const index = hasIndex ? Number(parts.pop()) : undefined;
    const target = parts.join('.');

    if (kind === 'class') {
      return { selector: `.${target}`, index };
    }

    if (kind === 'id') {
      return { selector: `#${target}`, index };
    }

    if (kind === 'tag') {
      return { selector: target || '*', index };
    }

    return { selector: segment, index };
  },

  evaluateJsonList(data: any, rule?: string): any[] {
    if (!rule) return [];
    const result = this.resolveJsonPath(data, stripJsonRulePrefix(rule), true);
    if (Array.isArray(result)) return result;
    return result ? [result] : [];
  },

  evaluateJsonValue(data: any, rule?: string): string {
    if (!rule) return '';
    const normalizedRule = stripJsonRulePrefix(rule);

    const getRule = normalizedRule.replace(/@get:\{([^}]+)\}/g, (_, expression) => {
      const value = this.resolveJsonPath(data, expression.trim(), false);
      return value == null ? '' : `${value}`;
    });

    const doubleBraceRule = getRule.replace(/\{\{([^}]+)\}\}/g, (_, expression) => {
      const value = this.resolveJsonPath(data, expression.trim(), false);
      return value == null ? '' : `${value}`;
    });

    const templateRule = doubleBraceRule.replace(/\{(\$[^}]+)\}/g, (_, expression) => {
      const value = this.resolveJsonPath(data, `${expression}`.trim(), false);
      return value == null ? '' : `${value}`;
    });

    // 模板替换后如果已经是确定字符串，就直接返回。
    if (templateRule !== normalizedRule && !looksLikeJsonRule(templateRule)) {
      return templateRule;
    }

    const result = this.resolveJsonPath(data, templateRule, false);
    if (result == null) return '';
    if (typeof result === 'string') return result.trim();
    if (typeof result === 'number' || typeof result === 'boolean') return `${result}`;
    return '';
  },

  resolveJsonPath(data: any, rule: string, keepList: boolean): any {
    const alternatives = rule.split('||').map((item) => item.trim()).filter(Boolean);

    for (const alternative of alternatives) {
      const chain = alternative.split('&&').map((item) => item.trim()).filter(Boolean);
      let current: any[] = [data];

      for (const step of chain) {
        const normalizedStep = step
          .replace(/^\$\./, '')
          .replace(/^\./, '')
          .trim();

        if (!normalizedStep) continue;

        const segments = normalizedStep.split('.').filter(Boolean);
        let next: any[] = current;

        for (const segment of segments) {
          const items: any[] = [];
          next.forEach((entry) => {
            if (entry == null) return;

            const arrayMatch = segment.match(/^([^\[]+)\[\*\]$/);
            if (arrayMatch) {
              const value = entry[arrayMatch[1]];
              if (Array.isArray(value)) {
                items.push(...value);
              }
              return;
            }

            if (/^-?\d+$/.test(segment)) {
              if (!Array.isArray(entry)) {
                return;
              }

              const index = Number(segment) < 0
                ? entry.length + Number(segment)
                : Number(segment);

              if (entry[index] != null) {
                items.push(entry[index]);
              }
              return;
            }

            if (Array.isArray(entry)) {
              entry.forEach((arrayItem) => {
                if (arrayItem && arrayItem[segment] != null) {
                  items.push(arrayItem[segment]);
                }
              });
              return;
            }

            if (entry[segment] != null) {
              items.push(entry[segment]);
            }
          });
          next = items;
        }

        current = next;
      }

      if (current.length > 0) {
        return keepList ? current : current[0];
      }
    }

    return keepList ? [] : null;
  },

  /**
   * 漫画源正文经常把图片列表放在 JSON 里，或塞进页面脚本里动态生成。
   * 这里先处理最常见的两种情况，保证大部分图片页至少能落到可显示的 img 列表。
   */
  getComicContent(text: string, source: Source, chapterUrl: string): string {
    const rule = source.ruleContent?.content || '';
    const payload = parsePayload(text);

    if (payload.kind === 'json') {
      const directUrls = this.getComicImageUrlsFromJson(payload.data, rule, source.baseUrl);
      if (directUrls.length > 0) {
        return buildComicImageHtml(directUrls);
      }
    }

    const extractedUrls = this.extractComicImageUrlsFromHtml(text, chapterUrl || source.baseUrl);
    if (extractedUrls.length > 0) {
      return buildComicImageHtml(extractedUrls);
    }

    return '';
  },

  getComicImageUrlsFromJson(data: any, rule: string, baseUrl: string): string[] {
    const primaryRule = rule.split('@js:')[0].trim();
    const candidateLists: unknown[][] = [];

    if (primaryRule) {
      const values = this.resolveJsonPath(data, primaryRule, true);
      if (Array.isArray(values) && values.length > 0) {
        candidateLists.push(values);
      }
    }

    // 漫画接口经常把图片数组藏在固定字段里。
    // 规则没写准时，优先从这些常见字段兜底，避免“接口成功但没图”。
    const fallbackLists = [
      data?.data?.current_chapter?.chapter_img_list,
      data?.current_chapter?.chapter_img_list,
      data?.data?.chapter_img_list,
      data?.chapter_img_list,
      data?.data?.images,
      data?.images,
      data?.data?.img_list,
      data?.img_list,
      data?.data?.current_chapter?.images,
      data?.current_chapter?.images,
    ];

    fallbackLists.forEach((entry) => {
      if (Array.isArray(entry) && entry.length > 0) {
        candidateLists.push(entry);
      }
    });

    for (const currentList of candidateLists) {
      const normalizedUrls = currentList
        .map((value) => sanitizeImageUrl(`${value}`))
        .filter(Boolean)
        .map((url) => resolveUrl(url, baseUrl));

      if (normalizedUrls.length > 0) {
        return normalizedUrls;
      }
    }

    return [];
  },

  extractComicImageUrlsFromHtml(text: string, baseUrl: string): string[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const imageUrls = new Set<string>();

    doc.querySelectorAll('img').forEach((image) => {
      const rawUrl = image.getAttribute('data-src') || image.getAttribute('src') || '';
      const cleanedUrl = sanitizeImageUrl(rawUrl);
      if (cleanedUrl) {
        imageUrls.add(resolveUrl(cleanedUrl, baseUrl));
      }
    });

    const scriptPatterns = [
      /newImgs\s*=\s*(\[[\s\S]*?\])/,
      /chapterImages\s*=\s*(\[[\s\S]*?\])/,
      /images\s*:\s*(\[[\s\S]*?\])/,
    ];

    scriptPatterns.forEach((pattern) => {
      const match = text.match(pattern);
      if (!match?.[1]) return;

      try {
        const normalized = match[1].replace(/'/g, '"');
        const urls = JSON.parse(normalized);
        if (Array.isArray(urls)) {
          urls.forEach((url) => {
            const cleanedUrl = sanitizeImageUrl(`${url}`);
            if (cleanedUrl) {
              imageUrls.add(resolveUrl(cleanedUrl, baseUrl));
            }
          });
        }
      } catch (error) {
        console.warn('Failed to parse comic image list from script:', error);
      }
    });

    return Array.from(imageUrls);
  },

  extractImageUrlsFromContent(content: string): string[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');

    return Array.from(doc.querySelectorAll('img'))
      .map((image) => image.getAttribute('src') || '')
      .filter(Boolean);
  },

  getMockResults(query: string): MediaItem[] {
    return [
      {
        id: 'mock-1',
        sourceId: 'demo',
        title: `${query} 的示例搜索结果`,
        author: '示例作者',
        cover: `https://picsum.photos/seed/${query}/300/400`,
        detailUrl: '',
        type: 'book'
      }
    ];
  },

  getMockDiscovery(source: Source): MediaItem[] {
    const items: MediaItem[] = [];
    const typeName = source.type === 'book' ? '小说' : source.type === 'comic' ? '漫画' : source.type;
    
    for (let i = 1; i <= 6; i++) {
      items.push({
        id: `${source.id}-mock-${i}`,
        sourceId: source.id,
        title: `热门${typeName} ${i}`,
        author: `作者 ${i}`,
        cover: `https://picsum.photos/seed/${source.id}-${i}/300/400`,
        detailUrl: '',
        type: source.type
      });
    }
    return items;
  }
};
