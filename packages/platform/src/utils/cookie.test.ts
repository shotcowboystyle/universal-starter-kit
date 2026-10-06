import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteCookie, getCookie, setCookie } from './cookie';

const seedCookie = (value: string): void => {
  Object.defineProperty(document, 'cookie', { writable: true, value });
};

describe('cookie utilities', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  describe(getCookie, () => {
    it('returns null when no cookies are set', () => {
      expect(getCookie('missing')).toBeNull();
    });

    it('returns the value of an existing cookie', () => {
      seedCookie('theme=dark');
      expect(getCookie('theme')).toBe('dark');
    });

    it('handles URL-encoded values', () => {
      seedCookie('data=hello%20world');
      expect(getCookie('data')).toBe('hello world');
    });

    it('returns the correct cookie among multiple', () => {
      seedCookie('a=1; b=2; c=3');
      expect(getCookie('b')).toBe('2');
    });

    it('escapes regex special characters in cookie names', () => {
      seedCookie('weird.name[0]=value');
      expect(getCookie('weird.name[0]')).toBe('value');
    });

    it('returns null for a partial name match', () => {
      seedCookie('prefix_key=value');
      expect(getCookie('key')).toBeNull();
    });
  });

  describe(setCookie, () => {
    it('sets a basic cookie with default options', () => {
      setCookie('key', 'value');
      expect(document.cookie).toContain('key=value');
      expect(document.cookie).toContain('path=/');
      expect(document.cookie).toContain('SameSite=Lax');
    });

    it('sets a cookie with expiration days', () => {
      setCookie('session', 'abc', { days: 7 });
      expect(document.cookie).toContain('session=abc');
      expect(document.cookie).toContain('expires=');
    });

    it('sets the Secure flag when specified', () => {
      setCookie('secure_key', 'val', { secure: true });
      expect(document.cookie).toContain('Secure');
    });

    it('sets custom SameSite value', () => {
      setCookie('strict_key', 'val', { sameSite: 'Strict' });
      expect(document.cookie).toContain('SameSite=Strict');
    });

    it('URL-encodes name and value', () => {
      setCookie('special key', 'value with spaces');
      expect(document.cookie).toContain('special%20key=value%20with%20spaces');
    });
  });

  describe(deleteCookie, () => {
    it('sets the cookie to expire in the past', () => {
      setCookie('to_delete', 'value');
      deleteCookie('to_delete');
      expect(document.cookie).toContain('expires=Thu, 01 Jan 1970');
    });

    it('uses a custom path', () => {
      deleteCookie('key', '/custom');
      expect(document.cookie).toContain('path=/custom');
    });
  });
});
