import i18n from 'i18next';

type TOptions = Record<string, string | number | boolean | null | undefined>;

const interpolate = (template: string, options?: TOptions): string => {
  if (!options) {
    return template;
  }
  return template.replaceAll(/\{\{(?<key>\w+)\}\}/gu, (_, key: string) => {
    const value = options[key];
    return value === undefined || value === null ? `{{${key}}}` : String(value);
  });
};

/**
 * Safe catalog lookup for labels, tooltips, and chrome copy. When i18n is
 * not initialized (unit tests / headless DS), returns the English key with
 * light `{{var}}` interpolation so callers never get `undefined`. Same
 * contract as `forms/src/shared/t.ts` and `table/src/shared/t.ts`.
 */
export const t = (key: string, options?: TOptions): string => {
  if (i18n?.isInitialized) {
    // oxlint-disable-next-line import/no-named-as-default-member -- call through the live instance; the named `t` export is bound at import time
    const translated = i18n.t(key, options);
    if (translated.length > 0) {
      return translated;
    }
  }
  return interpolate(key, options);
};
