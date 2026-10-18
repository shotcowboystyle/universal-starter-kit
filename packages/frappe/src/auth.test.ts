import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthModule } from './auth';
import type { HttpClient } from './core/http';

type HttpFn = (...args: unknown[]) => Promise<object>;

const createHttpMock = () => ({
  get: vi.fn<HttpFn>(),
  post: vi.fn<HttpFn>(),
  put: vi.fn<HttpFn>(),
  delete: vi.fn<HttpFn>(),
  head: vi.fn<HttpFn>(),
  request: vi.fn<HttpFn>(),
  setToken: vi.fn<HttpFn>(),
});

describe(AuthModule, () => {
  let auth: AuthModule;
  let http: ReturnType<typeof createHttpMock>;
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    http = createHttpMock();
    mockHttpClient = http as unknown as HttpClient;

    auth = new AuthModule(mockHttpClient);
  });

  describe('constructor', () => {
    it('should initialize without auth config', () => {
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
      http.post.mockResolvedValue(mockResponse);
      const result = await auth.loginWithUsernamePassword(loginData);
      expect(http.post).toHaveBeenCalledWith('/api/method/login', {
        usr: 'testuser',
        pwd: 'testpass123',
      });
      expect(result).toStrictEqual(mockResponse);
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
      http.post.mockResolvedValue(mockResponse);
      await auth.loginWithUsernamePassword(loginData);
      expect(http.post).toHaveBeenCalledWith('/api/method/login', {
        usr: 'test@example.com',
        pwd: 'securePassword!',
      });
    });

    it('should handle login with special characters in password', async () => {
      const loginData = {
        username: 'testuser',
        // oxlint-disable-next-line sonarjs/no-hardcoded-passwords -- fixture credential sent to a mocked client
        password: 'P@$$w0rd!#%&*',
      };
      const mockResponse = {
        payload: {
          message: 'Login successful',
        },
        headers: new Headers(),
        status: 200,
      };
      http.post.mockResolvedValue(mockResponse);
      await auth.loginWithUsernamePassword(loginData);
      expect(http.post).toHaveBeenCalledWith('/api/method/login', {
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
      http.post.mockRejectedValue(mockError);
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
      http.get.mockResolvedValue(mockResponse);
      const result = await auth.getLoggedInUser();
      expect(http.get).toHaveBeenCalledWith('/api/method/frappe.auth.get_logged_user');
      expect(result).toBe('testuser@example.com');
    });

    it('should return empty string for guest user', async () => {
      const mockResponse = {
        payload: {
          message: '',
        },
      };
      http.get.mockResolvedValue(mockResponse);
      const result = await auth.getLoggedInUser();
      expect(result).toBe('');
    });

    it('should return guest for Guest user', async () => {
      const mockResponse = {
        payload: {
          message: 'Guest',
        },
      };
      http.get.mockResolvedValue(mockResponse);
      const result = await auth.getLoggedInUser();
      expect(result).toBe('Guest');
    });

    it('should handle network error', async () => {
      const mockError = new Error('Network error');
      http.get.mockRejectedValue(mockError);
      await expect(auth.getLoggedInUser()).rejects.toThrow('Network error');
    });

    it('should handle unauthorized error', async () => {
      const mockError = {
        status: 401,
        message: 'Unauthorized',
      };
      http.get.mockRejectedValue(mockError);
      await expect(auth.getLoggedInUser()).rejects.toStrictEqual(mockError);
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
      http.post.mockResolvedValue(mockResponse);
      const result = await auth.logout();
      expect(http.post).toHaveBeenCalledWith('/api/method/logout');
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle logout when already logged out', async () => {
      const mockResponse = {
        payload: {
          message: 'Already logged out',
        },
        headers: new Headers(),
        status: 200,
      };
      http.post.mockResolvedValue(mockResponse);
      const result = await auth.logout();
      expect(http.post).toHaveBeenCalledWith('/api/method/logout');
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle logout error', async () => {
      const mockError = new Error('Logout failed');
      http.post.mockRejectedValue(mockError);
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
      http.post.mockResolvedValue(mockResponse);
      const result = await auth.forgetPassword(email);
      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: email,
      });
      expect(result).toStrictEqual(mockResponse);
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
      http.post.mockResolvedValue(mockResponse);
      await auth.forgetPassword(username);
      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
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
      http.post.mockResolvedValue(mockResponse);
      const result = await auth.forgetPassword(invalidEmail);
      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: invalidEmail,
      });
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle non-existent user', async () => {
      const email = 'nonexistent@example.com';
      const mockError = {
        status: 404,
        message: 'User not found',
      };
      http.post.mockRejectedValue(mockError);
      await expect(auth.forgetPassword(email)).rejects.toStrictEqual(mockError);
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
      http.post.mockResolvedValue(mockResponse);
      const result = await auth.forgetPassword(email);
      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: '',
      });
      expect(result).toStrictEqual(mockResponse);
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
      http.post.mockResolvedValue(mockResponse);
      await auth.forgetPassword(email);
      expect(http.post).toHaveBeenCalledWith('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: email,
      });
    });
  });
});
