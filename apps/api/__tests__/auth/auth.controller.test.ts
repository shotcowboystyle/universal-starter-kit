import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from '../../src/modules/auth/auth.controller';
import type { AuthService } from '../../src/modules/auth/auth.service';

const createAuthService = () => ({
  login: vi.fn<AuthService['login']>(),
});

describe(AuthController, () => {
  let controller: AuthController;
  let authService: ReturnType<typeof createAuthService>;

  beforeEach(() => {
    authService = createAuthService();

    const configService = {
      get: vi.fn<(key: string) => string | undefined>((key) => (key === 'NODE_ENV' ? 'test' : undefined)),
    };

    controller = new AuthController(authService as any, configService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return user and access_token', () => {
      const user = {
        _id: '1',
        email: 'test@test.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = { user, access_token: 'token' };
      const res = {
        cookie: vi.fn<Response['cookie']>(),
        clearCookie: vi.fn<Response['clearCookie']>(),
        getHeaders: vi.fn<Response['getHeaders']>().mockReturnValue({}),
      };

      authService.login.mockReturnValue(result as any);

      expect(controller.login(user as any, res as any)).toStrictEqual(result);
      expect(res.cookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProfile', () => {
    it('should return user from request', () => {
      const user = { _id: '1', email: 'test@test.com', name: 'Test User' };

      expect(controller.getProfile(user as any)).toStrictEqual(user);
    });
  });

  describe('logout', () => {
    it('should clear cookies and return a message', () => {
      const res = {
        clearCookie: vi.fn<Response['clearCookie']>(),
      };

      expect(controller.logout(res as any)).toStrictEqual({ message: 'Successfully logged out' });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });
});
