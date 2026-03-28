/**
 * 第三方图片站普遍有防盗链和跨域限制，这里统一把远程图片改成走本地代理。
 */
export const imageService = {
  toProxyUrl(url?: string, referer?: string) {
    if (!url) return '';

    const trimmed = url.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;

    const query = new URLSearchParams({ url: trimmed });
    if (referer?.trim()) {
      query.set('referer', referer.trim());
    }

    return `/api/image?${query.toString()}`;
  }
};
