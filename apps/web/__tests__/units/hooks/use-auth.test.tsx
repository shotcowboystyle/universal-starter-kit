import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth, useAuthForm } from '@/hooks/use-auth';
import { useRouter } from '@/i18n/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';

vi.mock(import('@/lib/auth/auth-service'));
vi.mock(import('@/stores/auth-store'));
vi.mock(import('@/stores/workspace-store'));

const mockedAuthService = {
  getProfile: vi.spyOn(AuthService, 'getProfile'),
  login: vi.spyOn(AuthService, 'login'),
  logout: vi.spyOn(AuthService, 'logout'),
};

interface RouterStub {
  push: () => void;
  replace: () => void;
  refresh: () => void;
  prefetch: () => void;
  back: () => void;
  forward: () => void;
}

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the stub router is deliberately partial; a typed factory would need the full next-intl router shape
vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn<() => RouterStub>(() => ({
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
  })),
  usePathname: vi.fn<() => string>(() => '/en/login'),
}));

vi.mock(
  import('@/constants/routes'),
  () =>
    ({
      API_URL: 'http://localhost:3001',
      ROUTES: {
        HOME: '/',
        API: 'http://localhost:3001',
        AUTH: {
          LOGIN_API: 'http://localhost:3001/auth/login',
          LOGIN_PAGE: '/login',
        },
        BOARDS: {
          OVERVIEW_PAGE: '/boards',
        },
      },
      URL_PARAMS: {
        LOGIN_SUCCESS: 'login_success=true',
      },
    }) as const,
);

describe(useAuth, () => {
  const mockUser = { _id: '123', email: 'test@example.com', name: 'Test User' };
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockedAuthService.getProfile.mockResolvedValue(mockUser);
    mockedAuthService.login.mockResolvedValue({ access_token: 'token', user: mockUser });
    mockedAuthService.logout.mockReturnValue();

    const authStoreState = {
      user: null,
      session: null,
      isLoading: false,
      error: null,
      setUser: vi.fn<() => void>(),
      setSession: vi.fn<() => void>(),
      setLoading: vi.fn<() => void>(),
      setError: vi.fn<() => void>(),
      clear: vi.fn<() => void>(),
    };

    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector === undefined ? authStoreState : selector(authStoreState),
    );
    (useAuthStore as any).getState = () => authStoreState;

    const workspaceStoreState = {
      userId: null,
      userEmail: null,
      setUserInfo: vi.fn<() => void>(),
      projects: [],
      isLoadingProjects: false,
      setProjects: vi.fn<() => void>(),
      currentBoardId: null,
      myBoards: [],
      teamBoards: [],
      filter: { status: null, search: '' },
      fetchProjects: vi.fn<() => void>(),
      fetchTasksByProject: vi.fn<() => void>(),
      addProject: vi.fn<() => void>(),
      updateProject: vi.fn<() => void>(),
      removeProject: vi.fn<() => void>(),
      addTask: vi.fn<() => void>(),
      updateTask: vi.fn<() => void>(),
      removeTask: vi.fn<() => void>(),
      dragTaskOnProject: vi.fn<() => void>(),
      setCurrentBoardId: vi.fn<() => void>(),
      addBoard: vi.fn<() => void>(),
      updateBoard: vi.fn<() => void>(),
      removeBoard: vi.fn<() => void>(),
      setFilter: vi.fn<() => void>(),
      resetInBoards: vi.fn<() => void>(),
    };

    vi.mocked(useWorkspaceStore).mockImplementation((selector: any) =>
      selector === undefined ? workspaceStoreState : selector(workspaceStoreState),
    );
    (useWorkspaceStore as any).getState = () => workspaceStoreState;

    Object.defineProperty(window, 'location', {
      value: { pathname: '/en/login', href: '' },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, 'cookie', {
      get: vi.fn<() => string>(() => 'jwt=mock_jwt; isAuthenticated=true'),
      configurable: true,
    });

    const localStorageMock = {
      getItem: vi.fn<() => string>(() => 'mock_token'),
      setItem: vi.fn<() => void>(),
      removeItem: vi.fn<() => void>(),
      clear: vi.fn<() => void>(),
      length: 0,
      key: vi.fn<() => void>(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should initialize with loading state on mount', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeUndefined();
  });

  it('should handle successful login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.login('test@example.com');

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toStrictEqual(mockUser);
    });

    expect(mockedAuthService.login).toHaveBeenCalledWith('test@example.com');
  });

  it('should handle login errors', async () => {
    const loginError = new Error('Invalid credentials');
    mockedAuthService.login.mockRejectedValue(loginError);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(result.current.login('wrong@example.com')).rejects.toThrow('Invalid credentials');

    await waitFor(() => {
      expect(result.current.error).toBe('Invalid credentials');
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  it('should handle logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await result.current.login('test@example.com');

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await result.current.logout();

    expect(mockedAuthService.logout).toHaveBeenCalledWith();
  });
});

describe(useAuthForm, () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const mockUser = { _id: '123', email: 'test@example.com', name: 'Test User' };
    mockedAuthService.login.mockResolvedValue({ access_token: 'token', user: mockUser });

    const authStoreState = {
      user: null,
      session: null,
      isLoading: false,
      error: null,
      setUser: vi.fn<() => void>(),
      setSession: vi.fn<() => void>(),
      setLoading: vi.fn<() => void>(),
      setError: vi.fn<() => void>(),
      clear: vi.fn<() => void>(),
    };

    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector === undefined ? authStoreState : selector(authStoreState),
    );
    (useAuthStore as any).getState = () => authStoreState;

    const workspaceStoreState = {
      userId: null,
      userEmail: null,
      setUserInfo: vi.fn<() => void>(),
      projects: [],
      isLoadingProjects: false,
      setProjects: vi.fn<() => void>(),
      currentBoardId: null,
      myBoards: [],
      teamBoards: [],
      filter: { status: null, search: '' },
      fetchProjects: vi.fn<() => void>(),
      fetchTasksByProject: vi.fn<() => void>(),
      addProject: vi.fn<() => void>(),
      updateProject: vi.fn<() => void>(),
      removeProject: vi.fn<() => void>(),
      addTask: vi.fn<() => void>(),
      updateTask: vi.fn<() => void>(),
      removeTask: vi.fn<() => void>(),
      dragTaskOnProject: vi.fn<() => void>(),
      setCurrentBoardId: vi.fn<() => void>(),
      addBoard: vi.fn<() => void>(),
      updateBoard: vi.fn<() => void>(),
      removeBoard: vi.fn<() => void>(),
      setFilter: vi.fn<() => void>(),
      resetInBoards: vi.fn<() => void>(),
    };

    vi.mocked(useWorkspaceStore).mockImplementation((selector: any) =>
      selector === undefined ? workspaceStoreState : selector(workspaceStoreState),
    );
    (useWorkspaceStore as any).getState = () => workspaceStoreState;

    Object.defineProperty(window, 'location', {
      value: { pathname: '/en/login', href: '' },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, 'cookie', {
      get: vi.fn<() => string>(() => ''),
      configurable: true,
    });

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn<() => null>(() => null),
        setItem: vi.fn<() => void>(),
        removeItem: vi.fn<() => void>(),
        clear: vi.fn<() => void>(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should call login on successful submission', async () => {
    const mockRouter = {
      push: vi.fn<() => void>(),
      replace: vi.fn<() => void>(),
      refresh: vi.fn<() => void>(),
      prefetch: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
    };
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);

    const { result } = renderHook(() => useAuthForm(), { wrapper });

    await result.current.handleSubmit('test@example.com');

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('should handle login failure without redirecting', async () => {
    mockedAuthService.login.mockRejectedValue(new Error('Login failed'));

    const { result } = renderHook(() => useAuthForm(), { wrapper });

    await result.current.handleSubmit('invalid@example.com');

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith('invalid@example.com');
    });
  });
});
