import type { getRequestConfig } from 'next-intl/server';
import { describe, expect, it, vi } from 'vitest';

// Mock next-intl before importing the module
// oxlint-disable-next-line vitest/prefer-import-in-mock -- hasLocale is a generic type guard; a plain includes() stub can't satisfy its signature
vi.mock('next-intl', () => ({
  hasLocale: vi.fn<(locales: readonly string[], locale: string) => boolean>((locales, locale) =>
    locales.includes(locale),
  ),
}));

vi.mock(import('next-intl/server'), async (importOriginal) => ({
  ...(await importOriginal()),
  getRequestConfig: vi.fn<typeof getRequestConfig>((fn) => fn),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- routing stub only carries locales/defaultLocale, not a full defineRouting result
vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'zh'],
    defaultLocale: 'en',
  },
}));

// Mock @repo/i18n package
// oxlint-disable-next-line vitest/prefer-import-in-mock -- partial i18n stub with test-only locales and messages
vi.mock('@repo/i18n', () => ({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: {
    en: { welcome: 'Welcome', login: { title: '{appName}' } },
    de: { welcome: 'Willkommen', login: { title: '{appName}' } },
  },
}));

describe('i18n request config', () => {
  it('should export getRequestConfig', async () => {
    const requestModule = await import('@/i18n/request');
    expect(requestModule.default).toBeDefined();
    expect(requestModule.default).toBeTypeOf('function');
  });

  it('should handle valid locale', async () => {
    const requestModule = await import('@/i18n/request');
    const config = await requestModule.default({ requestLocale: Promise.resolve('en') });

    expect(config.locale).toBe('en');
    expect(config.messages).toBeDefined();
  });

  it('should fallback to default locale for invalid locale', async () => {
    const requestModule = await import('@/i18n/request');
    const config = await requestModule.default({ requestLocale: Promise.resolve('fr') });

    expect(config.locale).toBe('en');
    expect(config.messages).toBeDefined();
  });

  it('should load correct messages for locale', async () => {
    const requestModule = await import('@/i18n/request');
    const config = await requestModule.default({ requestLocale: Promise.resolve('en') });

    expect(config.messages).toBeDefined();
    expect(config.messages!.welcome).toBe('Welcome');
  });
});
