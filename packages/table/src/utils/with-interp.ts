/**
 * Apply `{{var}}` interpolation when react-i18next returns an untranslated key
 * (no i18n instance in unit tests / headless DS). Same helper the i18n pass
 * added to components (`components/src/shared/t.ts`); row-action aria-labels
 * interpolate row identity (DG-A11Y-06), so they need it here too.
 */
export const withInterp = (translated: string, options: Record<string, string | number | undefined | null>): string => {
  if (!translated.includes('{{')) {
    return translated;
  }
  return translated.replaceAll(/\{\{(?<key>\w+)\}\}/gu, (_, key: string) => {
    const value = options[key];
    return value === undefined || value === null ? `{{${key}}}` : String(value);
  });
};

/**
 * First-strong bidi isolation — FSI…PDI (`\u2068…\u2069`), the string form of
 * `<bdi>`. Same helper as `components/src/shared/t.ts` (same duplication
 * precedent as `withInterp` above). Interpolated count/range labels
 * ("1–5 of 5") reorder inside an RTL paragraph ("of 5 5–1"); isolating the
 * whole formatted run gives it its own base direction from its first strong
 * character, so untranslated latin copy renders LTR as a unit while
 * translated RTL copy still renders RTL. Apply to visible numeric labels at
 * the interpolation site.
 */
export const bidiIsolate = (text: string): string => {
  if (!text) {
    return text;
  }
  return `\u2068${text}\u2069`;
};
