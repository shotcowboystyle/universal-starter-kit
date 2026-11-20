import Cookies from 'js-cookie';
import { z } from 'zod';

import { ROUTES } from '@/constants/routes';
import type { Session, UserInfo } from '@/types/db-interface';

const API_BASE = ROUTES.API;

// Shape-only checks: the backend owns the user document, we just need the fields read below
const loginResponseSchema = z.object({
  access_token: z.string().optional(),
  user: z.custom<UserInfo>().optional(),
});

const profileResponseSchema = z
  .object({
    _id: z.string(),
    email: z.string().optional(),
    name: z.string().optional(),
  })
  .nullable();

const LOGIN_FAILED = 'Login failed';
const JSON_CONTENT_TYPE = 'application/json';

const isBlank = (value: string | null | undefined): value is '' | null | undefined =>
  value === undefined || value === null || value === '';

export const AuthService = {
  async login(email: string): Promise<{ access_token: string; user?: UserInfo }> {
    const response = await fetch(ROUTES.AUTH.LOGIN_API, {
      method: 'POST',
      headers: {
        'Content-Type': JSON_CONTENT_TYPE,
        Accept: JSON_CONTENT_TYPE,
      },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      let errorText = LOGIN_FAILED;
      try {
        errorText = await response.text();
      } catch {
        // Safe to continue: unreadable body just means we report the generic message
      }
      throw new Error(errorText === '' ? LOGIN_FAILED : errorText);
    }

    const parsedLogin = loginResponseSchema.safeParse(await response.json());
    if (!parsedLogin.success) {
      throw new Error(LOGIN_FAILED);
    }
    const { data } = parsedLogin;

    if (!isBlank(data.access_token)) {
      // oxlint-disable-next-line react-doctor/auth-token-in-web-storage -- existing Authorization-header fallback; the primary session is the HTTP-only cookie
      localStorage.setItem('auth_token', data.access_token);
    }

    Cookies.set('isAuthenticated', 'true', {
      path: '/',
      secure: window.location.protocol === 'https:',
      sameSite: 'lax',
      expires: 7,
    });

    return {
      access_token: isBlank(data.access_token) ? 'http-only-cookie' : data.access_token,
      user: data.user,
    };
  },

  async getProfile(): Promise<UserInfo> {
    // Try to get token from localStorage for Authorization header
    const token = localStorage.getItem('auth_token');

    const baseHeaders = {
      'Content-Type': JSON_CONTENT_TYPE,
      Accept: JSON_CONTENT_TYPE,
    };
    // Add Authorization header if token exists
    const headers = isBlank(token) ? baseHeaders : { ...baseHeaders, Authorization: `Bearer ${token}` };

    const response = await fetch(`${API_BASE}/auth/profile`, {
      method: 'GET',
      // Still try cookies as fallback
      credentials: 'include',
      headers,
      // Add cache control to prevent caching issues
      cache: 'no-store',
      mode: 'cors',
    });

    if (!response.ok) {
      try {
        await response.text();
      } catch {
        // Safe to continue: body is only drained, the status check below decides the error
      }

      if (response.status === 401) {
        AuthService.logout();
      }

      throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`);
    }

    const parsedUser = profileResponseSchema.safeParse(await response.json());
    const user = parsedUser.success ? parsedUser.data : null;

    // Ensure we have required fields
    if (user === null || isBlank(user.email)) {
      throw new Error('Invalid user data received from server');
    }

    const [emailName] = user.email.split('@');
    const fallbackName = isBlank(emailName) ? 'User' : emailName;

    // Map the backend user to our frontend User type
    return {
      _id: user._id,
      email: user.email,
      name: isBlank(user.name) ? fallbackName : user.name,
    };
  },

  async getSession(): Promise<Session | null> {
    try {
      // First try to get the profile using the HTTP-only cookie
      const user = await AuthService.getProfile();

      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
        },
        // The actual token is in the HTTP-only cookie
        accessToken: 'http-only-cookie',
      };
    } catch (error) {
      console.error('Session validation error:', error);
      // Don't throw here, just return null to indicate no valid session
      return null;
    }
  },

  logout(): void {
    if (typeof window !== 'undefined') {
      Cookies.remove('jwt', { path: '/' });
      Cookies.remove('isAuthenticated', { path: '/' });
      localStorage.removeItem('auth_token');
    }
  },
};
