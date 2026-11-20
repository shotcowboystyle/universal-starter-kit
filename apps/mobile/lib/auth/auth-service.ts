import type { Session, UserInfo } from '@repo/store';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import { API_ROUTES } from '@/constants/routes';
import { readJson } from '@/lib/api/read-json';

const TOKEN_KEY = 'auth_token';
const LOGIN_FAILED = 'Login failed';

interface LoginResponse {
  access_token: string;
  user?: UserInfo;
}

interface ProfileResponse {
  _id: string;
  email?: string;
  name?: string;
}

export const authService = {
  async getToken(): Promise<string | null> {
    return await getItemAsync(TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await setItemAsync(TOKEN_KEY, token);
  },

  async removeToken(): Promise<void> {
    await deleteItemAsync(TOKEN_KEY);
  },

  async login(email: string): Promise<{ access_token: string; user?: UserInfo }> {
    const response = await fetch(API_ROUTES.AUTH.LOGIN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch {
        errorText = LOGIN_FAILED;
      }
      throw new Error(errorText === '' ? LOGIN_FAILED : errorText);
    }

    const data = await readJson<LoginResponse>(response);

    if (data.access_token !== '') {
      await this.setToken(data.access_token);
    }

    return {
      access_token: data.access_token,
      user: data.user,
    };
  },

  async getProfile(): Promise<UserInfo> {
    const token = await this.getToken();

    const baseHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const headers = token === null || token === '' ? baseHeaders : { ...baseHeaders, Authorization: `Bearer ${token}` };

    const response = await fetch(API_ROUTES.AUTH.PROFILE, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.logout();
      }
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }

    const user = await readJson<ProfileResponse | null>(response);

    if (user == null || user.email === undefined || user.email === '') {
      throw new Error('Invalid user data received from server');
    }

    const displayName = [user.name, user.email.split('@')[0]].find((n) => n !== undefined && n !== '');

    return {
      _id: user._id,
      email: user.email,
      name: displayName ?? 'User',
    };
  },

  async getSession(): Promise<Session | null> {
    try {
      const token = await this.getToken();
      if (token === null || token === '') {
        return null;
      }

      const user = await this.getProfile();
      return { user, accessToken: token };
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await this.removeToken();
  },
};
