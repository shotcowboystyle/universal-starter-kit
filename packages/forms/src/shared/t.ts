import i18n, { t as translate } from 'i18next';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- i18next interpolation bag; callers pass arbitrary interpolation values
type TOptions = Record<string, unknown>;

const interpolate = (template: string, options?: TOptions): string => {
  if (options === undefined) {
    return template;
  }
  return template.replaceAll(/\{\{(?<key>\w+)\}\}/gu, (_, key: string) =>
    // oxlint-disable-next-line typescript/no-base-to-string -- interpolation values are primitives in practice; stringification matches i18next's own
    options[key] == null ? `{{${key}}}` : String(options[key]),
  );
};

/**
 * Safe catalog lookup for non-component paths (preflight, error mappers).
 * When i18n is not initialized (unit tests / headless DS), returns the English
 * key with light `{{var}}` interpolation so callers never get `undefined`.
 */
export const t = (key: string, options?: TOptions): string => {
  if (i18n?.isInitialized) {
    const translated: unknown = translate(key, options);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- i18next returns non-strings for returnObjects/missing-key configs; only a non-empty string is usable
    if (typeof translated === 'string' && translated.length > 0) {
      return translated;
    }
  }
  return interpolate(key, options);
};

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
export const bidiIsolate = (text: string): string => {
  if (!text) {
    return text;
  }
  return `\u2068${text}\u2069`;
};
