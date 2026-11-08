/**
 * URL normalization shared by the web LinkDialog and the native
 * link/image dialogs (LC-16: one implementation).
 */

/**
 * Ensures URL has a protocol prefix, auto-prepending https:// if missing.
 */
export const normalizeUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^https?:\/\//iu.test(trimmed)) {
    return trimmed;
  }
  if (/^mailto:/iu.test(trimmed)) {
    return trimmed;
  }
  if (/^tel:/iu.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};
