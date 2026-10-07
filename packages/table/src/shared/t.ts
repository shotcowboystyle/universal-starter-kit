import i18n from 'i18next';

type TOptions = Record<string, unknown>;

function interpolate(template: string, options?: TOptions): string {
  if (!options) {
    return template;
  }
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_, key: string) =>
    options[key] == null ? `{{${key}}}` : String(options[key]),
  );
}

/**
 * Safe catalog lookup for non-component paths (render callbacks, chrome
 * labels). When i18n is not initialized (unit tests / headless DS), returns
 * the English key with light `{{var}}` interpolation so callers never get
 * `undefined`. Same contract as `forms/src/shared/t.ts`.
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
