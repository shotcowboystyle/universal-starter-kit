/**
 * Apply `{{var}}` interpolation when react-i18next returns an untranslated key
 * (no i18n instance in unit tests / headless DS).
 */
export function withInterp(translated: string, options: Record<string, string | number | undefined | null>): string {
  if (!translated.includes('{{')) {
    return translated;
  }
  return translated.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    options[key] != null ? String(options[key]) : `{{${key}}}`,
  );
}

/**
 * First-strong bidi isolation — FSI…PDI (`\u2068…\u2069`), the string form of
 * `<bdi>`. Formatted runs that interpolate numbers into latin copy ("1–5 of
 * 5", "7 entries") reorder inside an RTL paragraph ("of 5 5–1") because the
 * surrounding bidi context resolves each weak/latin segment independently.
 * Isolating the WHOLE formatted run gives it its own base direction (from its
 * first strong character), so untranslated latin copy renders LTR as a unit
 * while translated RTL copy keeps rendering RTL — apply to visible
 * count/range labels at the interpolation site (per-number isolation is not
 * enough: a strong-LTR word like "of" still reorders).
 */
export function bidiIsolate(text: string): string {
  if (!text) {
    return text;
  }
  return `\u2068${text}\u2069`;
}
