'use client';

import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { ROUTES, URL_PARAMS } from '@/constants/routes';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Session, UserInfo } from '@/types/db-interface';

// Helper function to create session from user data
const createSession = (user: UserInfo): Session => ({
  user: {
    _id: user._id,
    email: user.email,
    name: user.name || user.email.split('@')[0],
  },
  accessToken: 'http-only-cookie',
});

// Resolves a session for the given email, preferring the user returned by login
const loginForSession = async (email: string): Promise<Session> => {
  // Call the login endpoint which now returns user data and token
  const loginResult = await AuthService.login(email);

  // If login returned user data directly, use it
  if (loginResult?.user != null) {
    return createSession(loginResult.user);
  }

  // Fallback: fetch the user profile using the session
  return createSession(await AuthService.getProfile());
};

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: UserInfo | null;
  session: Session | null;
}

export const AUTH_KEYS = {
  all: ['auth'] as const,
  session: () => [...AUTH_KEYS.all, 'session'] as const,
};

export const useAuth = () => {
  const setUserInfo = useWorkspaceStore((state) => state.setUserInfo);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const authPathname = usePathname();

  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  // Function to manually check session
  const checkSession = useCallback(async (): Promise<Session | null> => {
    let currentSession: Session | null = null;
    setIsCheckingAuth(true);
    try {
      const user = await AuthService.getProfile();
      currentSession = createSession(user);
      setSession(currentSession);
    } catch (error) {
      console.error('Session check failed:', error);
      setSession(null);
    }
    setIsCheckingAuth(false);
    return currentSession;
  }, []);

  // Check for existing session on mount if we have auth indicators
  useEffect(() => {
    const initAuth = async () => {
      // Skip session check on auth pages where user is expected to not be authenticated
      const isOnAuthPage = authPathname.includes('/login');
      if (isOnAuthPage) {
        setIsCheckingAuth(false);
        return;
      }

      // Check for authentication cookie (could be jwt= or isAuthenticated=)
      const hasAuthCookie = document.cookie.split(';').some((item) => {
        const trimmed = item.trim();
        return trimmed.startsWith('jwt=') || trimmed.startsWith('isAuthenticated=');
      });

      // Also check for token in localStorage (fallback for httpOnly cookies)
      const hasStoredToken = localStorage.getItem('auth_token');

      if (hasAuthCookie || (hasStoredToken !== null && hasStoredToken !== '')) {
        try {
          await checkSession();
        } catch (error) {
          console.error('Failed to check session on mount:', error);
          // Don't throw here - just log the error and continue
          // The session will remain null, indicating user is not authenticated
        }
      } else {
        // No authentication indicators, set loading to false immediately
        setIsCheckingAuth(false);
      }
    };

    void initAuth();
  }, [checkSession, authPathname]);

  // Login mutation
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- login only writes local session/store state; no cached query depends on it
  const loginMutation = useMutation<{ session: Session }, Error, string>({
    mutationFn: async (email: string) => {
      setIsLoading(true);
      setAuthError(null);
      let outcome: { session: Session } | Error;
      try {
        outcome = { session: await loginForSession(email) };
      } catch (error) {
        console.error('[useAuth mutationFn] Login error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Login failed';
        setAuthError(errorMessage);
        outcome = new Error(errorMessage, { cause: error });
      }
      setIsLoading(false);
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
    onSuccess: (data) => {
      if (data?.session?.user != null) {
        const { user } = data.session;
        setSession(data.session);
        setUserInfo(user.name || user.email, user._id);
        useAuthStore.getState().setUser(user);
      }
    },
    onError: (mutationError) => {
      setAuthError(mutationError.message);
    },
  });

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Clear the JWT cookie
      AuthService.logout();

      // Clear the local session state
      setSession(null);

      // Clear the stores
      useAuthStore.getState().clear();
      useWorkspaceStore.getState().setUserInfo('', '');

      // Redirect to login page
      router.replace(ROUTES.AUTH.LOGIN_PAGE);
    } catch (error) {
      console.error('Error during logout:', error);
      // Still redirect even if there was an error
      router.replace(ROUTES.AUTH.LOGIN_PAGE);
    }
  }, [router]);

  // Update user info in store when session changes
  useEffect(() => {
    if (session?.user != null) {
      const { user } = session;
      // Ensure we have both email and _id before updating
      if (user.email && user._id) {
        setUserInfo(user.name || user.email, user._id);
      }
    }
  }, [session, setUserInfo]);

  return {
    // Auth state
    isAuthenticated: session !== null,
    isLoading: isCheckingAuth || isLoading,
    error: authError,
    user: session?.user,
    session,

    // Auth methods
    login: loginMutation.mutateAsync,
    // Alias for backward compatibility
    loginWithEmail: loginMutation.mutateAsync,
    logout,

    // Raw mutations for more control
    loginMutation,
  };
};

export const useAuthForm = () => {
  const { login, isLoading, error: authError } = useAuth();
  const [, setError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const handleSubmit = async (email: string) => {
    setIsNavigating(true);
    try {
      const result = await login(email);

      if (result?.session?.user == null) {
        setError('No user data received after login');
      } else {
        const searchParams = new URLSearchParams(window.location.search);
        const callbackUrl = searchParams.get('callbackUrl');
        const cleanCallback = callbackUrl?.replace(/^\/[a-z]{2}\//u, '/');
        const redirectUrl =
          cleanCallback === undefined || cleanCallback === '' ? `/boards?${URL_PARAMS.LOGIN_SUCCESS}` : cleanCallback;

        setTimeout(() => {
          router.push(redirectUrl);
        }, 500);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setError(errorMessage);
    }
    setIsNavigating(false);
  };

  return {
    handleSubmit,
    isLoading,
    error: authError,
    isNavigating,
  };
};
