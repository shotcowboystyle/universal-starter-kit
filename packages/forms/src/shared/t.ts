import i18n from 'i18next';

type TOptions = Record<string, unknown>;

function interpolate(template: string, options?: TOptions): string {
  if (!options) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    options[key] != null ? String(options[key]) : `{{${key}}}`,
  );
}

/**
 * Safe catalog lookup for non-component paths (preflight, error mappers).
 * When i18n is not initialized (unit tests / headless DS), returns the English
 * key with light `{{var}}` interpolation so callers never get `undefined`.
 */
export function t(key: string, options?: TOptions): string {
  if (i18n?.isInitialized) {
    const translated: unknown = i18n.t(key, options as never);
    if (typeof translated === 'string' && translated.length > 0) {
      return translated;
    }
  }
  return interpolate(key, options);
}

/**
 * First-strong bidi isolation — FSI…PDI (`\u2068…\u2069`), the string form of
 * `<bdi>` (BIDI-ISOLATION). Same helper as `components/src/shared/t.ts`
 * and `table/src/utils/withInterp.ts` (the interpolation-home duplication
 * precedent) — the helper lives beside each package's `t()` interpolator.
 * Formatted runs that mix directions inside an RTL paragraph reorder by the
 * bidi algorithm's rules — "1–5 of 5" renders "of 5 5–1", a trailing
 * "Search..." ellipsis flips to "…Search" — because each weak/latin segment
 * resolves independently. Isolating the WHOLE run gives it its own base
 * direction from its first strong character, so untranslated latin copy
 * renders LTR as a unit while translated RTL copy still renders RTL. Apply
 * at the interpolation site of visible strings; never per-string manual
 * marks, never aria-labels (invisible to reorder; breaks exact-match label
 * queries).
 */
export function bidiIsolate(text: string): string {
  if (!text) {
    return text;
  }
  return `\u2068${text}\u2069`;
}
