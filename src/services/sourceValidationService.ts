import { Source, SourceValidationState } from '../types';
import { buildProxyUrl, shouldPreferProxy } from '../lib/proxy';
import { sourceService } from './sourceService';

const PLACEHOLDER_HOST_PATTERN = /(^|\.)example\.com$|localhost|127\.0\.0\.1/i;
const INVALID_RULE_TEXT_PATTERN = /\[object Object\]|undefined|null|layout_/i;

function isProbablyValidUrl(value?: string) {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (PLACEHOLDER_HOST_PATTERN.test(parsed.hostname)) return false;
    return true;
  } catch (error) {
    return false;
  }
}

function hasUsableRuleText(value?: string) {
  if (!value) return false;
  const trimmed = value.trim();
  return !!trimmed && !INVALID_RULE_TEXT_PATTERN.test(trimmed);
}

function shouldCheckSource(source: Source) {
  if (!source.name?.trim()) return false;
  if (!isProbablyValidUrl(source.baseUrl) && !isProbablyValidUrl(source.exploreUrl)) return false;

  if (source.type === 'video' || source.type === 'audio' || source.type === 'live') {
    return hasUsableRuleText(source.rulePlay?.url) || hasUsableRuleText(source.ruleExplore?.list);
  }

  return (
    (hasUsableRuleText(source.ruleSearch?.checkUrl) && hasUsableRuleText(source.ruleSearch?.list) && hasUsableRuleText(source.ruleSearch?.name))
    || (isProbablyValidUrl(source.exploreUrl || source.baseUrl) && hasUsableRuleText((source.ruleExplore || source.ruleSearch)?.list))
    || hasUsableRuleText(source.ruleContent?.content)
    || hasUsableRuleText(source.ruleChapterList?.list)
  );
}

function getProbeUrl(source: Source) {
  if (isProbablyValidUrl(source.baseUrl)) return source.baseUrl;
  if (isProbablyValidUrl(source.exploreUrl)) return source.exploreUrl!;
  return null;
}

async function fetchValidationResponse(url: string) {
  const preferProxy = shouldPreferProxy() || url.startsWith('http://');

  if (preferProxy) {
    try {
      const proxyResponse = await fetch(buildProxyUrl(url));
      if (!proxyResponse.ok || proxyResponse.headers.get('X-Proxy-Error') === '1') {
        return {
          ok: false as const,
          status: proxyResponse.headers.get('X-Proxy-Status') || undefined,
        };
      }

      return { ok: true as const };
    } catch (error) {
      return { ok: false as const };
    }
  }

  try {
    const directResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
    });

    if (directResponse.ok) {
      return { ok: true as const };
    }
  } catch (error) {
    console.info('Direct validation fetch failed, falling back to proxy:', url, error);
  }

  try {
    const proxyResponse = await fetch(buildProxyUrl(url));
    if (!proxyResponse.ok || proxyResponse.headers.get('X-Proxy-Error') === '1') {
      return {
        ok: false as const,
        status: proxyResponse.headers.get('X-Proxy-Status') || undefined,
      };
    }

    return { ok: true as const };
  } catch (error) {
    return { ok: false as const };
  }
}

async function validateSource(source: Source): Promise<SourceValidationState> {
  const probeUrl = getProbeUrl(source);
  if (!probeUrl || !shouldCheckSource(source)) {
    return {
      status: 'invalid',
      checkedAt: Date.now(),
      error: '缺少可用规则或地址',
    };
  }

  try {
    const response = await fetchValidationResponse(probeUrl);
    if (!response.ok) {
      return {
        status: 'invalid',
        checkedAt: Date.now(),
        error: response.status ? `请求失败(${response.status})` : '请求失败',
      };
    }

    return {
      status: 'valid',
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      status: 'invalid',
      checkedAt: Date.now(),
      error: '网络异常',
    };
  }
}

let backgroundRunToken = 0;

export const sourceValidationService = {
  async validateSourcesInBackground(sourceIds?: string[]) {
    const runToken = ++backgroundRunToken;
    const allSources = sourceService.getSources();
    const targets = sourceIds?.length
      ? allSources.filter((source) => sourceIds.includes(source.id))
      : allSources;

    if (targets.length === 0) return;

    sourceService.updateValidationBatch(
      targets.map((source) => ({
        id: source.id,
        validation: {
          status: 'checking',
          checkedAt: source.validation?.checkedAt,
          error: undefined,
        },
      })),
    );

    const concurrency = 4;
    let currentIndex = 0;

    const worker = async () => {
      while (true) {
        const index = currentIndex++;
        if (index >= targets.length || runToken !== backgroundRunToken) return;

        const source = targets[index];
        const validation = await validateSource(source);
        if (runToken !== backgroundRunToken) return;
        sourceService.updateValidation(source.id, validation);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  },
};
