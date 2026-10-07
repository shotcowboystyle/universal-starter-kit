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
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }
  const withBreaks = html.replaceAll(/<\s*(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?\s*>/gi, ' ');
  const withoutTags = withBreaks.replaceAll(/<[^>]*>/g, '');
  const decoded = withoutTags
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&lt;/gi, '<')
    .replaceAll(/&gt;/gi, '>')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;|&apos;/gi, "'")
    .replaceAll(/&amp;/gi, '&');
  return decoded.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Parse a frappe timestamp ("2026-08-12 09:34:09.025850") to epoch ms.
 * The space separator and microsecond precision trip Safari/JSC, so
 * normalize to ISO-ish ("T" separator, milliseconds) before Date parsing.
 * Frappe emits server-local wall time with no zone; parsing as local time
 * matches how desk renders it. Unparseable input → undefined.
 */
export function parseFrappeTimestamp(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const isoish = value
    .trim()
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+$/, '$1');
  const parsed = new Date(isoish).getTime();
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const fallback = new Date(value).getTime();
  return Number.isNaN(fallback) ? undefined : fallback;
}
