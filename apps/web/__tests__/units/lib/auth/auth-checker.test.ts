import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { isAuthenticated } from '@/lib/auth/auth-checker';

// Mock next/headers
vi.mock(import('next/headers'), () => ({
  cookies: vi.fn<typeof cookies>(),
}));

describe('authChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe(isAuthenticated, () => {
    it('should return true when jwt cookie exists', async () => {
      const mockCookieStore = {
        getAll: vi.fn<() => { name: string; value: string }[]>().mockReturnValue([
          { name: 'jwt', value: 'mock-jwt-token' },
          { name: 'other', value: 'other-value' },
        ]),
      };
      (cookies as Mock).mockResolvedValue(mockCookieStore);

      const result = await isAuthenticated();

      expect(result).toStrictEqual({ isAuthenticated: true });
      expect(mockCookieStore.getAll).toHaveBeenCalledWith();
    });

    it('should return false when jwt cookie does not exist', async () => {
      const mockCookieStore = {
        getAll: vi
          .fn<() => { name: string; value: string }[]>()
          .mockReturnValue([{ name: 'other', value: 'other-value' }]),
      };
      (cookies as Mock).mockResolvedValue(mockCookieStore);

      const result = await isAuthenticated();

      expect(result).toStrictEqual({ isAuthenticated: false });
      expect(mockCookieStore.getAll).toHaveBeenCalledWith();
    });

    it('should return false when jwt cookie has empty value', async () => {
      const mockCookieStore = {
        getAll: vi.fn<() => { name: string; value: string }[]>().mockReturnValue([{ name: 'jwt', value: '' }]),
      };
      (cookies as Mock).mockResolvedValue(mockCookieStore);

      const result = await isAuthenticated();

      expect(result).toStrictEqual({ isAuthenticated: false });
    });

    it('should return false when no cookies exist', async () => {
      const mockCookieStore = {
        getAll: vi.fn<() => { name: string; value: string }[]>().mockReturnValue([]),
      };
      (cookies as Mock).mockResolvedValue(mockCookieStore);

      const result = await isAuthenticated();

      expect(result).toStrictEqual({ isAuthenticated: false });
    });

    it('should return false and log error on exception', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = new Error('Cookie store error');
      (cookies as Mock).mockRejectedValue(mockError);

      const result = await isAuthenticated();

      expect(result).toStrictEqual({ isAuthenticated: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking authentication:', mockError);

      consoleErrorSpy.mockRestore();
    });
  });
});
