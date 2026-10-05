import { describe, expect, it } from 'vitest';

import { detectLanguage } from './detectLanguage';
import { parseCookieValue } from './localePersistence';

const opts = {
  supportedLanguages: ['en', 'es', 'fr', 'de', 'ja'],
  defaultLanguage: 'en',
};

// A browser-realm Request (the DOM test environment) drops the forbidden
// `cookie` header, so hand detectLanguage a server-shaped request instead.
function makeRequest(headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers) } as Request;
}

describe('parseCookieValue', () => {
  it('parses a cookie value from a header string', () => {
    expect(parseCookieValue('preferred_language=fr; session=abc', 'preferred_language')).toBe('fr');
  });

  it('returns null when cookie is not present', () => {
    expect(parseCookieValue('session=abc', 'preferred_language')).toBeNull();
  });

  it('returns null for empty cookie header', () => {
    expect(parseCookieValue('', 'preferred_language')).toBeNull();
  });

  it('decodes URI-encoded values', () => {
    expect(parseCookieValue('lang=%E6%97%A5%E6%9C%AC%E8%AA%9E', 'lang')).toBe('日本語');
  });

  it('handles whitespace around cookie pairs', () => {
    expect(parseCookieValue('a=1;  preferred_language=es  ; b=2', 'preferred_language')).toBe('es');
  });

  it('returns null when value is empty', () => {
    expect(parseCookieValue('preferred_language=', 'preferred_language')).toBeNull();
  });
});

describe('detectLanguage', () => {
  it('returns language from preferred_language cookie', () => {
    const req = makeRequest({ cookie: 'preferred_language=es' });
    expect(detectLanguage(req, opts)).toBe('es');
  });

  it('ignores cookie if language is not in supported list', () => {
    const req = makeRequest({
      cookie: 'preferred_language=zh',
      'accept-language': 'fr;q=0.9',
    });
    expect(detectLanguage(req, opts)).toBe('fr');
  });

  it('falls back to Accept-Language header when no cookie', () => {
    const req = makeRequest({ 'accept-language': 'de,en;q=0.8' });
    expect(detectLanguage(req, opts)).toBe('de');
  });

  it('respects quality values in Accept-Language', () => {
    const req = makeRequest({ 'accept-language': 'fr;q=0.5,ja;q=0.9,en;q=0.1' });
    expect(detectLanguage(req, opts)).toBe('ja');
  });

  it('tries base language code from Accept-Language (e.g. es from es-ES)', () => {
    const req = makeRequest({ 'accept-language': 'es-ES;q=0.9' });
    expect(detectLanguage(req, opts)).toBe('es');
  });

  it('returns default language when nothing matches', () => {
    const req = makeRequest({ 'accept-language': 'zh;q=0.9,ko;q=0.8' });
    expect(detectLanguage(req, opts)).toBe('en');
  });

  it('returns default language when no headers at all', () => {
    const req = makeRequest();
    expect(detectLanguage(req, opts)).toBe('en');
  });

  it('skips wildcard (*) in Accept-Language', () => {
    const req = makeRequest({ 'accept-language': '*;q=0.5' });
    expect(detectLanguage(req, opts)).toBe('en');
  });
});
