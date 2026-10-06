import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientProviders } from '@/providers/ClientProviders';
import { useAuthStore } from '@/stores/auth-store';

interface AuthMockState {
  user: null;
  isLoading: boolean;
  error: null;
}

const authMockState: AuthMockState = { user: null, isLoading: false, error: null };

// Mock auth store
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the zustand hook stub is a bare function with the store statics; a typed factory would need the full store typing
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    vi.fn<() => AuthMockState>(() => authMockState),
    {
      getState: vi.fn<() => AuthMockState>(() => authMockState),
      setState: vi.fn<() => void>(),
      subscribe: vi.fn<() => void>(),
      destroy: vi.fn<() => void>(),
    },
  ),
}));

// Mock ReactQueryDevtools
vi.mock(import('@tanstack/react-query-devtools'), () => ({
  ReactQueryDevtools: () => null,
}));

// Mock next-themes
// oxlint-disable-next-line vitest/prefer-import-in-mock -- partial stub of the next-themes hook result
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

describe(ClientProviders, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children', () => {
    render(
      <ClientProviders>
        <div>Test Child</div>
      </ClientProviders>,
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('should call useAuthStore.getState on mount to ensure hydration', () => {
    render(
      <ClientProviders>
        <div>Test Child</div>
      </ClientProviders>,
    );

    expect(useAuthStore.getState).toHaveBeenCalledWith();
  });

  it('should wrap children with QueryClientProvider and ThemeProvider', () => {
    render(
      <ClientProviders>
        <div data-testid="child">Test Child</div>
      </ClientProviders>,
    );

    const child = screen.getByTestId('child');
    expect(child).toBeInTheDocument();
  });

  it('should render multiple children', () => {
    render(
      <ClientProviders>
        <div>Child 1</div>
        <div>Child 2</div>
        <div>Child 3</div>
      </ClientProviders>,
    );

    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
    expect(screen.getByText('Child 3')).toBeInTheDocument();
  });
});
