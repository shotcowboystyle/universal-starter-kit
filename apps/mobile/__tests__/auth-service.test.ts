import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { authService } from '@/lib/auth/auth-service';

const resolved = (value: Awaited<ReturnType<Response['json']>>) => vi.fn<Response['json']>().mockResolvedValue(value);
const rejected = (error: Error) => vi.fn<() => Promise<never>>().mockRejectedValue(error);

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should get token from SecureStore', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('tk');
    await expect(authService.getToken()).resolves.toBe('tk');
  });

  it('should set token in SecureStore', async () => {
    await authService.setToken('new-token');
    expect(setItemAsync).toHaveBeenCalledWith('auth_token', 'new-token');
  });

  it('should remove token from SecureStore', async () => {
    await authService.removeToken();
    expect(deleteItemAsync).toHaveBeenCalledWith('auth_token');
  });

  it('should login successfully and store token', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved({ access_token: 'tk', user: { _id: '1', email: 't@e.com' } }),
    } as any);

    const result = await authService.login('test@e.com');

    expect(result.access_token).toBe('tk');
    expect(result.user).toStrictEqual({ _id: '1', email: 't@e.com' });
    expect(setItemAsync).toHaveBeenCalledWith('auth_token', 'tk');
  });

  it('should login and not store token if none returned', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved({ access_token: '', user: null }),
    } as any);

    const result = await authService.login('test@e.com');

    expect(result.access_token).toBe('');
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('should throw on login failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: resolved('Invalid credentials'),
    } as any);

    await expect(authService.login('bad@e.com')).rejects.toThrow('Invalid credentials');
  });

  it('should throw default message when login error text is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: resolved(''),
    } as any);

    await expect(authService.login('bad@e.com')).rejects.toThrow('Login failed');
  });

  it('should throw default message when text() also fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: rejected(new Error('fail')),
    } as any);

    await expect(authService.login('bad@e.com')).rejects.toThrow('Login failed');
  });

  it('should get profile with auth header', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('my-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved({ _id: '1', email: 't@e.com', name: 'Test User' }),
    } as any);

    const profile = await authService.getProfile();

    expect(profile).toStrictEqual({ _id: '1', email: 't@e.com', name: 'Test User' });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      }),
    );
  });

  it('should get profile without auth header when no token', async () => {
    vi.mocked(getItemAsync).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved({ _id: '1', email: 't@e.com' }),
    } as any);

    const profile = await authService.getProfile();

    // name defaults to email.split("@")[0]
    expect(profile.name).toBe('t');
    const calledHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(calledHeaders.Authorization).toBeUndefined();
  });

  it('should handle profile 401 by logging out', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('tk');
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as any);

    await expect(authService.getProfile()).rejects.toThrow('401');
    expect(deleteItemAsync).toHaveBeenCalledWith('auth_token');
  });

  it('should handle profile non-401 error', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('tk');
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as any);

    await expect(authService.getProfile()).rejects.toThrow('500');
  });

  it('should throw on invalid user data (no email)', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('tk');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved({ _id: '1' }),
    } as any);

    await expect(authService.getProfile()).rejects.toThrow('Invalid user data');
  });

  it('should throw on null user data', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('tk');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved(null),
    } as any);

    await expect(authService.getProfile()).rejects.toThrow('Invalid user data');
  });

  it('should get session when token and profile exist', async () => {
    vi.mocked(getItemAsync).mockResolvedValue('tk');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: resolved({ _id: '1', email: 't@e.com' }),
    } as any);

    const session = await authService.getSession();

    expect(session?.accessToken).toBe('tk');
    expect(session?.user.email).toBe('t@e.com');
  });

  it('should return null session when no token', async () => {
    vi.mocked(getItemAsync).mockResolvedValue(null);

    const session = await authService.getSession();
    expect(session).toBeNull();
  });

  it('should return null session on error', async () => {
    vi.mocked(getItemAsync).mockRejectedValue(new Error('store error'));

    const session = await authService.getSession();
    expect(session).toBeNull();
  });

  it('should logout by removing token', async () => {
    await authService.logout();
    expect(deleteItemAsync).toHaveBeenCalledWith('auth_token');
  });
});
