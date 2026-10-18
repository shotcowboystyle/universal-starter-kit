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
 * Safe catalog lookup for non-component paths (render callbacks, chrome
 * labels). When i18n is not initialized (unit tests / headless DS), returns
 * the English key with light `{{var}}` interpolation so callers never get
 * `undefined`. Same contract as `forms/src/shared/t.ts`.
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
