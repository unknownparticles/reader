const DEFAULT_PROXY_PATH = '/api/proxy';

function normalizeProxyBaseUrl() {
  const configured = (import.meta.env.VITE_PROXY_BASE_URL || '').trim();
  if (!configured) {
    return DEFAULT_PROXY_PATH;
  }

  return configured.replace(/\/+$/, '');
}

export function shouldPreferProxy() {
  return !!(import.meta.env.VITE_PROXY_BASE_URL || '').trim();
}

export function buildProxyUrl(targetUrl: string, options?: string) {
  const proxyBaseUrl = normalizeProxyBaseUrl();
  const query = new URLSearchParams({ url: targetUrl });

  if (options) {
    query.set('options', options);
  }

  const separator = proxyBaseUrl.includes('?') ? '&' : '?';
  return `${proxyBaseUrl}${separator}${query.toString()}`;
}
