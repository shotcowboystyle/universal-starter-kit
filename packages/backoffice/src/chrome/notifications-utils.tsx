/**
 * Tiny pure helpers for the notifications panel. Notification Log subjects
 * arrive as HTML fragments ('<b>Jane</b> mentioned you in <a>…</a>') and
 * timestamps in frappe's "YYYY-MM-DD HH:mm:ss.ffffff" register.
 */

/**
 * Strip HTML tags from a Notification Log subject and return readable text.
 * Closing block tags / <br> become spaces so "<div>a</div><div>b</div>"
 * reads "a b"; basic entities are decoded (&amp; last so "&amp;lt;" stays
 * literal "&lt;"); whitespace collapses to single spaces.
 */
export const stripHtmlToText = (html: string | null | undefined): string => {
  if (html == null || html === '') {
    return '';
  }
  // oxlint-disable-next-line sonarjs/super-linear-regex -- input is a short server-rendered notification subject
  const withBreaks = html.replaceAll(/<\s*(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?\s*>/giu, ' ');
  // oxlint-disable-next-line sonarjs/super-linear-regex -- input is a short server-rendered notification subject
  const withoutTags = withBreaks.replaceAll(/<[^>]*>/gu, '');
  const decoded = withoutTags
    .replaceAll(/&nbsp;/giu, ' ')
    .replaceAll(/&lt;/giu, '<')
    .replaceAll(/&gt;/giu, '>')
    .replaceAll(/&quot;/giu, '"')
    .replaceAll(/&#39;|&apos;/giu, "'")
    .replaceAll(/&amp;/giu, '&');
  return decoded.replaceAll(/\s+/gu, ' ').trim();
};

/**
 * Parse a frappe timestamp ("2026-08-12 09:34:09.025850") to epoch ms.
 * The space separator and microsecond precision trip Safari/JSC, so
 * normalize to ISO-ish ("T" separator, milliseconds) before Date parsing.
 * Frappe emits server-local wall time with no zone; parsing as local time
 * matches how desk renders it. Unparseable input → undefined.
 */
export const parseFrappeTimestamp = (value: string | null | undefined): number | undefined => {
  if (value == null || value === '') {
    return undefined;
  }
  const isoish = value
    .trim()
    .replace(' ', 'T')
    .replace(/(?<ms>\.\d{3})\d+$/u, '$<ms>');
  const parsed = new Date(isoish).getTime();
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const fallback = new Date(value).getTime();
  return Number.isNaN(fallback) ? undefined : fallback;
};
