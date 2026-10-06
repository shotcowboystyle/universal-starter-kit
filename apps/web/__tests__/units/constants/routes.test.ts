import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_URL, ROUTES, URL_PARAMS } from '@/constants/routes';

describe('routes constants', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
  });

  describe('API_URL constant', () => {
    it('should use environment variable when available', () => {
      expect(API_URL).toBeDefined();
      expect(API_URL).toBeTypeOf('string');
    });

    it('should be a valid URL format', () => {
      expect(API_URL).toMatch(/^https?:\/\//u);
    });
  });

  describe('URL_PARAMS constant', () => {
    it('should have LOGIN_SUCCESS parameter', () => {
      expect(URL_PARAMS.LOGIN_SUCCESS).toBe('login_success=true');
    });

    it('should be readonly', () => {
      // as const makes type readonly, not runtime frozen
      expect(Object.isFrozen(URL_PARAMS)).toBe(false);
      expect(URL_PARAMS).toBeTypeOf('object');
    });
  });

  describe('ROUTES constant', () => {
    it('should have HOME route', () => {
      expect(ROUTES.HOME).toBe('/');
    });

    it('should have API route matching API_URL', () => {
      expect(ROUTES.API).toBe(API_URL);
    });

    describe('AUTH routes', () => {
      it('should have LOGIN_API route', () => {
        expect(ROUTES.AUTH.LOGIN_API).toContain('/auth/login');
        expect(ROUTES.AUTH.LOGIN_API).toContain(API_URL);
      });

      it('should have LOGIN_PAGE route', () => {
        expect(ROUTES.AUTH.LOGIN_PAGE).toBe('/login');
      });

      it('should have valid LOGIN_API URL format', () => {
        expect(ROUTES.AUTH.LOGIN_API).toMatch(/^https?:\/\//u);
      });
    });

    describe('BOARDS routes', () => {
      it('should have OVERVIEW_PAGE route', () => {
        expect(ROUTES.BOARDS.OVERVIEW_PAGE).toBe('/boards');
      });
    });

    it('should be a nested object structure', () => {
      expect(ROUTES).toBeTypeOf('object');
      expect(ROUTES.AUTH).toBeTypeOf('object');
      expect(ROUTES.BOARDS).toBeTypeOf('object');
    });

    it('should have all string values for routes', () => {
      expect(ROUTES.HOME).toBeTypeOf('string');
      expect(ROUTES.API).toBeTypeOf('string');
      expect(ROUTES.AUTH.LOGIN_API).toBeTypeOf('string');
      expect(ROUTES.AUTH.LOGIN_PAGE).toBeTypeOf('string');
      expect(ROUTES.BOARDS.OVERVIEW_PAGE).toBeTypeOf('string');
    });
  });
});
