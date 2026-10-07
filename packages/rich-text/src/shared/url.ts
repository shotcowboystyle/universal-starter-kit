/**
 * URL normalization shared by the web LinkDialog and the native
 * link/image dialogs (LC-16: one implementation).
 */

/**
 * Ensures URL has a protocol prefix, auto-prepending https:// if missing.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  if (/^tel:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
