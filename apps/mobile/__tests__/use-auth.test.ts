import { renderHook, waitFor } from '@testing-library/react';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAuth } from '@/hooks/use-auth';
import type { authService } from '@/lib/auth/auth-service';
import { useAuthStore } from '@/stores/auth';

import { Wrapper } from './test-utils';

const { mockGetSession, mockLogin, mockLogout, mockGetProfile } = vi.hoisted(() => ({
  mockGetSession: vi.fn<typeof authService.getSession>(),
  mockLogin: vi.fn<typeof authService.login>(),
  mockLogout: vi.fn<typeof authService.logout>(),
  mockGetProfile: vi.fn<typeof authService.getProfile>(),
}));

vi.mock(import('@/lib/auth/auth-service'), async (importOriginal) => {
  const { authService: actual } = await importOriginal();
  return {
    authService: {
      ...actual,
      getSession: mockGetSession,
      login: mockLogin,
      logout: mockLogout,
      getProfile: mockGetProfile,
    },
  };
});

describe(useAuth, () => {
  let clearSpy: MockInstance<() => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    clearSpy = vi.spyOn(useAuthStore.getState(), 'clear');
  });

  it('should return isAuthenticated false when no session', async () => {
    mockGetSession.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('should return session data when authenticated', async () => {
    const mockSession = {
      user: { _id: '1', email: 't@e.com', name: 'Test' },
      accessToken: 'tk',
    };
    mockGetSession.mockResolvedValue(mockSession);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.user).toStrictEqual(mockSession.user);
    expect(result.current.session).toStrictEqual(mockSession);
  });

  it('should expose login function', () => {
    mockGetSession.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    expect(result.current.login).toBeDefined();
    expect(result.current.loginMutation).toBeDefined();
  });

  it('should call authService.logout and clear on logout', async () => {
    mockGetSession.mockResolvedValue(null);
    mockLogout.mockResolvedValue();

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await result.current.logout();

    expect(mockLogout).toHaveBeenCalledWith();
    expect(clearSpy).toHaveBeenCalledWith();
  });

  it('should return error from loginMutation or sessionQuery', async () => {
    mockGetSession.mockRejectedValue(new Error('Session failed'));

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // retry: false so it should surface the error
    expect(result.current.error).toBe('Session failed');
  });
});
