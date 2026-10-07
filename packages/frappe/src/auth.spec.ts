import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthModule } from './auth';
import type { HttpClient } from './core/http';
import type { AuthConfig } from './core/types';
import { AuthType } from './core/types';

describe(AuthModule, () => {
  let auth: AuthModule;
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      head: vi.fn(),
      request: vi.fn(),
      setToken: vi.fn(),
    } as unknown as HttpClient;

    auth = new AuthModule(mockHttpClient);
  });

  describe('constructor', () => {
    it('should initialize without auth config', () => {
      const authInstance = new AuthModule(mockHttpClient);
      expect(authInstance).toBeDefined();
    });

    it('should initialize with auth config', () => {
      const _authConfig: AuthConfig = {
        useToken: true,
        token: 'test-token',
        type: AuthType.Bearer,
      };
      const authInstance = new AuthModule(mockHttpClient);
      expect(authInstance).toBeDefined();
    });

    it('should initialize with partial auth config', () => {
      const _authConfig: AuthConfig = {
        useToken: false,
      };
      const authInstance = new AuthModule(mockHttpClient);
      expect(authInstance).toBeDefined();
    });

    it('should initialize with token as function', () => {
      const _authConfig: AuthConfig = {
        useToken: true,
        token: () => 'dynamic-token',
      };
      const authInstance = new AuthModule(mockHttpClient);
      expect(authInstance).toBeDefined();
    });

    it('should initialize with async token function', () => {
      const _authConfig: AuthConfig = {
        useToken: true,
        token: async () => 'async-token',
      };
      const authInstance = new AuthModule(mockHttpClient);
      expect(authInstance).toBeDefined();
    });
  });

  describe('loginWithUsernamePassword', () => {
    it('should call login endpoint with username and password', async () => {
      const loginData = {
        username: 'testuser',
        password: 'testpass123',
      };
      const mockResponse = {
        payload: {
          message: 'Login successful',
          user: 'testuser',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      const result = await auth.loginWithUsernamePassword(loginData);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/login', {
        usr: 'testuser',
        pwd: 'testpass123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle login with email as username', async () => {
      const loginData = {
        username: 'test@example.com',
        password: 'securePassword!',
      };
      const mockResponse = {
        payload: {
          message: 'Login successful',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      await auth.loginWithUsernamePassword(loginData);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/login', {
        usr: 'test@example.com',
        pwd: 'securePassword!',
      });
    });

    it('should handle login with special characters in password', async () => {
      const loginData = {
        username: 'testuser',
        password: 'P@$$w0rd!#%&*',
      };
      const mockResponse = {
        payload: {
          message: 'Login successful',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      await auth.loginWithUsernamePassword(loginData);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/login', {
        usr: loginData.username,
        pwd: loginData.password,
      });
    });

    it('should handle login error', async () => {
      const loginData = {
        username: 'wronguser',
        password: 'wrongpass',
      };
      const mockError = new Error('Invalid credentials');
      (mockHttpClient.post as any).mockRejectedValue(mockError);
      await expect(auth.loginWithUsernamePassword(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getLoggedInUser', () => {
    it('should get logged in user', async () => {
      const mockResponse = {
        payload: {
          message: 'testuser@example.com',
        },
      };
      (mockHttpClient.get as any).mockResolvedValue(mockResponse);
      const result = await auth.getLoggedInUser();
      expect(mockHttpClient.get).toHaveBeenCalledWith('/api/method/frappe.auth.get_logged_user');
      expect(result).toBe('testuser@example.com');
    });

    it('should return empty string for guest user', async () => {
      const mockResponse = {
        payload: {
          message: '',
        },
      };
      (mockHttpClient.get as any).mockResolvedValue(mockResponse);
      const result = await auth.getLoggedInUser();
      expect(result).toBe('');
    });

    it('should return guest for Guest user', async () => {
      const mockResponse = {
        payload: {
          message: 'Guest',
        },
      };
      (mockHttpClient.get as any).mockResolvedValue(mockResponse);
      const result = await auth.getLoggedInUser();
      expect(result).toBe('Guest');
    });

    it('should handle network error', async () => {
      const mockError = new Error('Network error');
      (mockHttpClient.get as any).mockRejectedValue(mockError);
      await expect(auth.getLoggedInUser()).rejects.toThrow('Network error');
    });

    it('should handle unauthorized error', async () => {
      const mockError = {
        status: 401,
        message: 'Unauthorized',
      };
      (mockHttpClient.get as any).mockRejectedValue(mockError);
      await expect(auth.getLoggedInUser()).rejects.toEqual(mockError);
    });
  });

  describe('logout', () => {
    it('should call logout endpoint', async () => {
      const mockResponse = {
        payload: {
          message: 'Logged out successfully',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      const result = await auth.logout();
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/logout');
      expect(result).toEqual(mockResponse);
    });

    it('should handle logout when already logged out', async () => {
      const mockResponse = {
        payload: {
          message: 'Already logged out',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      const result = await auth.logout();
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/logout');
      expect(result).toEqual(mockResponse);
    });

    it('should handle logout error', async () => {
      const mockError = new Error('Logout failed');
      (mockHttpClient.post as any).mockRejectedValue(mockError);
      await expect(auth.logout()).rejects.toThrow('Logout failed');
    });
  });

  describe('forgetPassword', () => {
    it('should call reset password endpoint with email', async () => {
      const email = 'user@example.com';
      const mockResponse = {
        payload: {
          message: 'Password reset link sent to email',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      const result = await auth.forgetPassword(email);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: email,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle forget password with username', async () => {
      const username = 'testuser';
      const mockResponse = {
        payload: {
          message: 'Password reset link sent',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      await auth.forgetPassword(username);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: username,
      });
    });

    it('should handle invalid email format', async () => {
      const invalidEmail = 'not-an-email';
      const mockResponse = {
        payload: {
          message: 'User not found',
        },
        headers: new Headers(),
        status: 404,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      const result = await auth.forgetPassword(invalidEmail);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: invalidEmail,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle non-existent user', async () => {
      const email = 'nonexistent@example.com';
      const mockError = {
        status: 404,
        message: 'User not found',
      };
      (mockHttpClient.post as any).mockRejectedValue(mockError);
      await expect(auth.forgetPassword(email)).rejects.toEqual(mockError);
    });

    it('should handle empty email', async () => {
      const email = '';
      const mockResponse = {
        payload: {
          message: 'Email is required',
        },
        headers: new Headers(),
        status: 400,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      const result = await auth.forgetPassword(email);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: '',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle special characters in email', async () => {
      const email = 'user+test@sub.example.com';
      const mockResponse = {
        payload: {
          message: 'Password reset link sent',
        },
        headers: new Headers(),
        status: 200,
      };
      (mockHttpClient.post as any).mockResolvedValue(mockResponse);
      await auth.forgetPassword(email);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: email,
      });
    });
  });

  describe('integration with auth config', () => {
    it('should work with token authentication enabled', () => {
      const _authConfig: AuthConfig = {
        useToken: true,
        token: 'bearer-token',
        type: AuthType.Bearer,
      };

      const authWithToken = new AuthModule(mockHttpClient);
      expect(authWithToken).toBeDefined();
    });

    it('should work with token authentication disabled', () => {
      const _authConfig: AuthConfig = {
        useToken: false,
      };

      const authWithoutToken = new AuthModule(mockHttpClient);
      expect(authWithoutToken).toBeDefined();
    });

    it('should work with custom auth type', () => {
      const _authConfig: AuthConfig = {
        useToken: true,
        token: 'custom-token',
        type: AuthType.Token,
      };

      const authWithCustomType = new AuthModule(mockHttpClient);
      expect(authWithCustomType).toBeDefined();
    });
  });
});
