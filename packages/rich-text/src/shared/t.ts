import i18n from 'i18next';

type TOptions = Record<string, unknown>;

function interpolate(template: string, options?: TOptions): string {
  if (!options) {
    return template;
  }
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = options[key];
    return value === undefined || value === null ? `{{${key}}}` : String(value);
  });
}

/**
 * Safe catalog lookup for labels, tooltips, and chrome copy. When i18n is
 * not initialized (unit tests / headless DS), returns the English key with
 * light `{{var}}` interpolation so callers never get `undefined`. Same
 * contract as `forms/src/shared/t.ts` and `table/src/shared/t.ts`.
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
