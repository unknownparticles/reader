import { Source, SourceRequestConfig, SourceType } from '../types';
import { buildProxyUrl, shouldPreferProxy } from '../lib/proxy';

const XIU2_REPO_PATTERN = /github\.com\/XIU2\/Yuedu/i;
const XIU2_BITBUCKET_RAW_PATTERN = /bitbucket\.org\/xiu2\/yuedu\/raw\/master\/shuyuan/i;
const AOAOSTAR_REPO_PATTERN = /github\.com\/aoaostar\/legado/i;
const AOAOSTAR_SITE_PATTERN = /legado\.aoaostar\.com/i;
const MANHUADAQUAN_REPO_PATTERN = /github\.com\/chashaomanhua\/manhuadaquan/i;

/**
 * 生成兜底 ID，避免第三方源缺少稳定主键时导入失败。
 */
function createFallbackId() {
  return `source-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 仓库主页并不是可直接导入的 JSON，这里先把常见入口转成真实可解析地址。
 */
function normalizeImportEntry(url: string) {
  const trimmed = url.trim();

  const githubBlobMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  if (githubBlobMatch) {
    const [, owner, repo, branch, filePath] = githubBlobMatch;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }

  if (XIU2_REPO_PATTERN.test(trimmed)) {
    return 'https://raw.githubusercontent.com/XIU2/Yuedu/master/shuyuan';
  }

  if (XIU2_BITBUCKET_RAW_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (AOAOSTAR_REPO_PATTERN.test(trimmed)) {
    return 'https://legado.aoaostar.com/?dt_dapp=1';
  }

  if (MANHUADAQUAN_REPO_PATTERN.test(trimmed)) {
    return 'https://raw.githubusercontent.com/chashaomanhua/manhuadaquan/main/All.json';
  }

  return trimmed;
}

/**
 * 部分仓库页、分享页本身是 HTML，需要先从页面里抽出真正的导入链接。
 */
function extractImportCandidates(text: string, currentUrl: string) {
  const candidates = new Set<string>();

  const urlMatches = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  urlMatches.forEach((item) => {
    const cleaned = item.replace(/[),.;]+$/, '');
    if (
      /raw\.githubusercontent\.com/i.test(cleaned) ||
      /bookSource/i.test(cleaned) ||
      /shuyuan/i.test(cleaned) ||
      /legado\.aoaostar\.com/i.test(cleaned)
    ) {
      candidates.add(cleaned);
    }
  });

  if (text.includes('<a')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    doc.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;

      const absoluteUrl = href.startsWith('http')
        ? href
        : new URL(href, currentUrl).toString();

      const label = (link.textContent || '').trim();
      if (
        /访问直链|下载文件|书源/i.test(label) ||
        /raw\.githubusercontent\.com/i.test(absoluteUrl) ||
        /bookSource/i.test(absoluteUrl) ||
        /shuyuan/i.test(absoluteUrl)
      ) {
        candidates.add(absoluteUrl);
      }
    });
  }

  // 这两个仓库是用户明确要支持的入口，这里补一个兜底，避免页面改版后完全失效。
  if (XIU2_REPO_PATTERN.test(currentUrl) || /XIU2\/Yuedu/i.test(text)) {
    candidates.add('https://raw.githubusercontent.com/XIU2/Yuedu/master/shuyuan');
  }

  if (AOAOSTAR_REPO_PATTERN.test(currentUrl) || AOAOSTAR_SITE_PATTERN.test(currentUrl) || /aoaostar\/legado/i.test(text)) {
    candidates.add('https://legado.aoaostar.com/?dt_dapp=1');
  }

  if (MANHUADAQUAN_REPO_PATTERN.test(currentUrl) || /chashaomanhua\/manhuadaquan/i.test(text)) {
    candidates.add('https://raw.githubusercontent.com/chashaomanhua/manhuadaquan/main/All.json');
  }

  candidates.delete(currentUrl);
  return Array.from(candidates);
}

/**
 * 远程返回值有时是标准 JSON，有时是包在页面或脚本里的 JSON，这里做一次容错提取。
 */
function extractJsonPayload(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  return null;
}

/**
 * Legado 常把搜索地址写在顶层 searchUrl，部分源还会塞进一段 JS 里，这里只提取我们能直接请求的部分。
 */
function normalizeSearchUrl(raw: any) {
  const searchUrl = normalizeRuleText(raw.searchUrl || raw.ruleSearch?.checkUrl);
  if (!searchUrl) return undefined;

  if (searchUrl.startsWith('@js:')) {
    const relativeMatch = searchUrl.match(/baseUrl\s*\+\s*["']([^"']+)["']/);
    if (relativeMatch) {
      return `${raw.bookSourceUrl || raw.sourceUrl || ''}${relativeMatch[1]}`;
    }

    const absoluteMatch = searchUrl.match(/https?:\/\/[^"'\s]+/);
    if (absoluteMatch) {
      return absoluteMatch[0];
    }

    return undefined;
  }

  return searchUrl.replace(/,\s*\{[\s\S]*$/, '');
}

function normalizeHeaders(value: any): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const headers = Object.entries(value).reduce<Record<string, string>>((result, [key, currentValue]) => {
    if (typeof currentValue === 'string' && currentValue.trim()) {
      result[key] = currentValue.trim();
    }
    return result;
  }, {});

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizeRequestBody(value: any) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return undefined;
    }
  }

  return undefined;
}

function buildRequestConfig(rawRule: any, fallbackReferer?: string): SourceRequestConfig | undefined {
  if (!rawRule || typeof rawRule !== 'object') {
    return undefined;
  }

  const method = typeof rawRule.method === 'string' ? rawRule.method.trim().toUpperCase() : undefined;
  const headers = normalizeHeaders(rawRule.header || rawRule.headers);
  const body = normalizeRequestBody(rawRule.body || rawRule.data);
  const referer = normalizeRuleText(rawRule.referer || rawRule.refererUrl || fallbackReferer);
  const contentType = normalizeRuleText(rawRule.contentType);

  if (!method && !headers && !body && !referer && !contentType) {
    return undefined;
  }

  return {
    method,
    headers,
    body,
    referer,
    contentType,
  };
}

/**
 * 第三方源里有些字段不是纯字符串，甚至会混进对象数组。
 * 这里先做一次保守清洗，只留下阅读器当前能消费的规则文本。
 */
function normalizeRuleText(value: any) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => normalizeRuleText(item))
      .filter(Boolean)
      .join('||');

    return joined.trim();
  }

  if (value && typeof value === 'object') {
    if (typeof value.url === 'string') return value.url.trim();
    if (typeof value.href === 'string') return value.href.trim();
    if (typeof value.path === 'string') return value.path.trim();
    return '';
  }

  return '';
}

function dedupeSources(sources: Source[]) {
  const uniqueSources = new Map<string, Source>();
  sources.forEach((source) => {
    if (!uniqueSources.has(source.id)) {
      uniqueSources.set(source.id, source);
    }
  });
  return Array.from(uniqueSources.values());
}

interface ImportSummary {
  total: number;
  parsed: number;
  deduped: number;
  filtered: number;
  kept: number;
}

export interface ImportResult {
  sources: Source[];
  summary: ImportSummary;
}

function shouldKeepImportedSource(source: Source) {
  return !!source.name?.trim() && (!!source.baseUrl || !!source.exploreUrl);
}

function shouldKeepComicSource(raw: any) {
  const group = `${raw.bookSourceGroup || raw.sourceGroup || ''}`.toLowerCase();
  const name = `${raw.bookSourceName || raw.sourceName || ''}`.toLowerCase();

  if (raw.bookSourceType === 2) return true;
  if (group.includes('漫画')) return true;
  if (name.includes('漫画') || name.includes('动漫')) return true;

  return false;
}

function shouldImportOnlyComicSources(url: string) {
  return MANHUADAQUAN_REPO_PATTERN.test(url) || /chashaomanhua\/manhuadaquan/i.test(url) || /All\.json$/i.test(url);
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function fetchImportText(url: string) {
  const preferProxy = shouldPreferProxy() || url.startsWith('http://');

  if (preferProxy) {
    try {
      const proxyResponse = await fetch(buildProxyUrl(url));
      if (!proxyResponse.ok || proxyResponse.headers.get('X-Proxy-Error') === '1') {
        return null;
      }

      return await proxyResponse.text();
    } catch (error) {
      console.warn('Proxy import fetch failed:', url, error);
      return null;
    }
  }

  try {
    const directResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
    });

    if (directResponse.ok) {
      return await directResponse.text();
    }
  } catch (error) {
    console.info('Direct import fetch failed, falling back to proxy:', url, error);
  }

  try {
    const proxyResponse = await fetch(buildProxyUrl(url));
    if (!proxyResponse.ok || proxyResponse.headers.get('X-Proxy-Error') === '1') {
      return null;
    }

    return await proxyResponse.text();
  } catch (error) {
    console.warn('Proxy import fetch failed:', url, error);
    return null;
  }
}

function inferTypeFromText(name: string, group: string, baseUrl: string): SourceType {
  const mergedText = `${name} ${group} ${baseUrl}`.toLowerCase();

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

export const importService = {
  async importFromUrl(url: string): Promise<ImportResult> {
    try {
      const comicOnly = shouldImportOnlyComicSources(url);

      // Check if it's a raw JSON string first
      if (url.trim().startsWith('[') || url.trim().startsWith('{')) {
        try {
          const data = JSON.parse(url);
          return await this.finalizeImportedSources(data, { comicOnly });
        } catch (e) {
          throw new Error('无效的 JSON 格式');
        }
      }

      const queue = [normalizeImportEntry(url)];
      const visited = new Set<string>();
      const importedSources = new Map<string, Source>();

      while (queue.length > 0 && visited.size < 12) {
        const currentUrl = queue.shift();
        if (!currentUrl || visited.has(currentUrl)) continue;
        visited.add(currentUrl);

        const text = await fetchImportText(currentUrl);
        if (!text) {
          continue;
        }

        try {
          const data = extractJsonPayload(text);
          if (data) {
            const parsedSources = this.parseSources(data, { comicOnly });
            parsedSources.forEach((source) => {
              if (!importedSources.has(source.id)) {
                importedSources.set(source.id, source);
              }
            });
            continue;
          }
        } catch (e) {
          console.warn('Failed to parse remote JSON payload:', e);
        }

        const nestedUrls = extractImportCandidates(text, currentUrl);
        nestedUrls.forEach((candidateUrl) => {
          if (!visited.has(candidateUrl)) {
            queue.push(candidateUrl);
          }
        });
      }

      const dedupedSources = Array.from(importedSources.values());
      if (dedupedSources.length > 0) {
        return {
          sources: dedupedSources.filter((source) => shouldKeepImportedSource(source)).map((source) => ({
            ...source,
            validation: { status: 'unchecked' },
          })),
          summary: {
            total: dedupedSources.length,
            parsed: dedupedSources.length,
            deduped: 0,
            filtered: dedupedSources.filter((source) => !shouldKeepImportedSource(source)).length,
            kept: dedupedSources.filter((source) => shouldKeepImportedSource(source)).length,
          },
        };
      }

      throw new Error('未能从该链接解析出可导入的书源，请尝试仓库首页或原始源文件链接');
    } catch (error: any) {
      console.error('Import error:', error);
      throw error;
    }
  },

  async finalizeImportedSources(data: any, options?: { comicOnly?: boolean }): Promise<ImportResult> {
    const rawSources = Array.isArray(data) ? data : [data];
    const parsedSources = await this.parseSourcesInBatches(rawSources, options);
    const filteredSources = parsedSources.filter((source) => shouldKeepImportedSource(source)).map((source) => ({
      ...source,
      validation: { status: 'unchecked' as const },
    }));

    return {
      sources: filteredSources,
      summary: {
        total: rawSources.length,
        parsed: parsedSources.length,
        deduped: parsedSources.length - dedupeSources(parsedSources).length,
        filtered: parsedSources.length - filteredSources.length,
        kept: filteredSources.length,
      },
    };
  },

  async organizeSources(sources: Source[]): Promise<ImportResult> {
    const dedupedSources = dedupeSources(sources);
    const filteredSources = dedupedSources.filter((source) => shouldKeepImportedSource(source));

    return {
      sources: filteredSources,
      summary: {
        total: sources.length,
        parsed: sources.length,
        deduped: sources.length - dedupedSources.length,
        filtered: dedupedSources.length - filteredSources.length,
        kept: filteredSources.length,
      },
    };
  },

  parseSources(data: any, options?: { comicOnly?: boolean }): Source[] {
    const rawSources = Array.isArray(data) ? data : [data];
    const sources: Source[] = [];

    for (const raw of rawSources) {
      try {
        // Handle Legado (Yuedu) format
        if (raw.bookSourceUrl || raw.sourceUrl) {
          if (!options?.comicOnly || shouldKeepComicSource(raw)) {
            sources.push(this.convertLegadoSource(raw));
          }
        } 
        // Handle other formats (simplified)
        else if (raw.name && raw.type) {
          sources.push({
            ...raw,
            id: raw.id || Math.random().toString(36).substr(2, 9),
            enabled: true
          });
        }
      } catch (e) {
        console.warn('Failed to parse a source item:', e);
      }
    }

    return sources;
  },

  async parseSourcesInBatches(data: any, options?: { comicOnly?: boolean }): Promise<Source[]> {
    const rawSources = Array.isArray(data) ? data : [data];
    const sources: Source[] = [];

    for (let index = 0; index < rawSources.length; index++) {
      const raw = rawSources[index];

      try {
        if (raw.bookSourceUrl || raw.sourceUrl) {
          if (!options?.comicOnly || shouldKeepComicSource(raw)) {
            sources.push(this.convertLegadoSource(raw));
          }
        } else if (raw.name && raw.type) {
          sources.push({
            ...raw,
            id: raw.id || Math.random().toString(36).substr(2, 9),
            enabled: true
          });
        }
      } catch (e) {
        console.warn('Failed to parse a source item:', e);
      }

      // 全量源通常有几千条，分批让出主线程，避免导入时看起来像卡死。
      if (index > 0 && index % 200 === 0) {
        await yieldToBrowser();
      }
    }

    return dedupeSources(sources);
  },

  convertLegadoSource(raw: any): Source {
    const sourceUrl = raw.bookSourceUrl || raw.sourceUrl || '';

    // 这里只映射当前阅读器能消费的最小字段，复杂脚本规则先保留原始字符串，后续按需增强解析器。
    return {
      id: sourceUrl || raw.bookSourceName || raw.sourceName || createFallbackId(),
      name: raw.bookSourceName || raw.sourceName || '未知源',
      type: this.inferType(raw),
      baseUrl: sourceUrl,
      enabled: true,
      validation: { status: 'unchecked' },
      group: raw.bookSourceGroup || raw.sourceGroup,
      exploreUrl: normalizeRuleText(raw.exploreUrl),
      ruleSearch: {
        checkUrl: normalizeSearchUrl(raw),
        request: buildRequestConfig(raw.ruleSearch, sourceUrl),
        list: normalizeRuleText(raw.ruleSearch?.bookList || raw.ruleExplore?.bookList),
        name: normalizeRuleText(raw.ruleSearch?.name),
        author: normalizeRuleText(raw.ruleSearch?.author),
        cover: normalizeRuleText(raw.ruleSearch?.coverUrl),
        detailUrl: normalizeRuleText(raw.ruleSearch?.bookUrl),
        kind: normalizeRuleText(raw.ruleSearch?.kind),
        lastChapter: normalizeRuleText(raw.ruleSearch?.lastChapter),
      },
      ruleExplore: {
        request: buildRequestConfig(raw.ruleExplore, sourceUrl),
        list: normalizeRuleText(raw.ruleExplore?.bookList),
        name: normalizeRuleText(raw.ruleExplore?.name),
        author: normalizeRuleText(raw.ruleExplore?.author),
        cover: normalizeRuleText(raw.ruleExplore?.coverUrl),
        detailUrl: normalizeRuleText(raw.ruleExplore?.bookUrl),
        kind: normalizeRuleText(raw.ruleExplore?.kind),
        lastChapter: normalizeRuleText(raw.ruleExplore?.lastChapter),
      },
      ruleBookInfo: {
        request: buildRequestConfig(raw.ruleBookInfo, sourceUrl),
        name: normalizeRuleText(raw.ruleBookInfo?.name),
        author: normalizeRuleText(raw.ruleBookInfo?.author),
        cover: normalizeRuleText(raw.ruleBookInfo?.coverUrl),
        intro: normalizeRuleText(raw.ruleBookInfo?.intro),
        kind: normalizeRuleText(raw.ruleBookInfo?.kind),
        catalogUrl: normalizeRuleText(raw.ruleBookInfo?.tocUrl),
      },
      ruleChapterList: {
        request: buildRequestConfig(raw.ruleChapterList || raw.ruleToc, sourceUrl),
        list: normalizeRuleText(raw.ruleChapterList?.chapterList || raw.ruleToc?.chapterList),
        name: normalizeRuleText(raw.ruleChapterList?.chapterName || raw.ruleToc?.chapterName),
        url: normalizeRuleText(raw.ruleChapterList?.chapterUrl || raw.ruleToc?.chapterUrl),
      },
      ruleContent: {
        request: buildRequestConfig(raw.ruleContent, sourceUrl),
        content: normalizeRuleText(raw.ruleContent?.content),
        nextContentUrl: normalizeRuleText(raw.ruleContent?.nextContentUrl),
        nextPageUrl: normalizeRuleText(raw.ruleContent?.nextPageUrl),
        replaceRegex: normalizeRuleText(raw.ruleContent?.replaceRegex),
      }
    };
  },

  inferType(raw: any): SourceType {
    const name = (raw.bookSourceName || raw.sourceName || '').toLowerCase();
    const group = (raw.bookSourceGroup || raw.sourceGroup || '').toLowerCase();
    const baseUrl = raw.bookSourceUrl || raw.sourceUrl || '';

    // Legado 原始源里 bookSourceType 比名称可靠，先用它修正小说/漫画混分。
    if (raw.bookSourceType === 2) return 'comic';
    if (raw.bookSourceType === 1) return 'audio';

    return inferTypeFromText(name, group, baseUrl);
  }
};
