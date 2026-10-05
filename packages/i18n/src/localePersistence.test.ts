/**
 * Locale persistence contracts — the `preferred_language` cookie (Frappe's
 * convention) round-trip on the client, and the SSR-side cookie-header
 * parser used to boot i18n with the user's language before hydration.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { getPersistedLanguage, parseCookieValue, persistLanguage } from './localePersistence';

function clearPreferredLanguageCookie() {
  document.cookie = 'preferred_language=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

describe('persistLanguage / getPersistedLanguage', () => {
  beforeEach(() => {
    clearPreferredLanguageCookie();
  });

  it('returns null when no language has been persisted', () => {
    expect(getPersistedLanguage()).toBeNull();
  });

  it('round-trips the language through the preferred_language cookie', () => {
    persistLanguage('te');
    expect(document.cookie).toContain('preferred_language=te');
    expect(getPersistedLanguage()).toBe('te');
  });

  it('overwrites a previously persisted language', () => {
    persistLanguage('en');
    persistLanguage('hi');
    expect(getPersistedLanguage()).toBe('hi');
  });
});

describe('parseCookieValue (SSR cookie header)', () => {
  it('extracts the named cookie from a multi-cookie header', () => {
    const header = 'sid=abc123; preferred_language=te; system_user=yes';
    expect(parseCookieValue(header, 'preferred_language')).toBe('te');
  });

  it('handles leading whitespace after semicolons', () => {
    expect(parseCookieValue('a=1;  preferred_language=en', 'preferred_language')).toBe('en');
  });

  it('returns null when the cookie is absent', () => {
    expect(parseCookieValue('sid=abc123', 'preferred_language')).toBeNull();
    expect(parseCookieValue('', 'preferred_language')).toBeNull();
  });

  it('does not match cookies whose name only ends with the requested name', () => {
    expect(parseCookieValue('not_preferred_language=fr', 'preferred_language')).toBeNull();
  });

  it('decodes URI-encoded values', () => {
    expect(parseCookieValue('preferred_language=pt%2DBR', 'preferred_language')).toBe('pt-BR');
  });

  it('returns null for an empty value', () => {
    expect(parseCookieValue('preferred_language=', 'preferred_language')).toBeNull();
  });
});
