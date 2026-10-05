import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserNav } from '@/components/layout/UserNav';
import { useAuth } from '@/hooks/useAuth';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('UserNav', () => {
  const mockLogout = vi.fn();
  const mockAuth: any = {
    user: { _id: 'user-1', email: 'test@example.com', name: 'Test User' },
    isAuthenticated: true,
    isLoading: false,
    logout: mockLogout,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(mockAuth);
  });

  it('renders the avatar trigger with the email initial', () => {
    renderWithProviders(<UserNav />);
    expect(screen.getByRole('button', { name: 'test@example.com' })).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('shows a placeholder while loading', () => {
    vi.mocked(useAuth).mockReturnValue({ ...mockAuth, user: undefined, isAuthenticated: false, isLoading: true });
    renderWithProviders(<UserNav />);
    expect(screen.getByTestId('user-nav-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['not authenticated', { user: undefined, isAuthenticated: false }],
    ['user is missing', { user: undefined, isAuthenticated: true }],
  ])('renders nothing when %s', (_label, overrides) => {
    vi.mocked(useAuth).mockReturnValue({ ...mockAuth, ...overrides });
    renderWithProviders(<UserNav />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows user details and logs out from the menu', async () => {
    renderWithProviders(<UserNav />);
    fireEvent.click(screen.getByRole('button', { name: 'test@example.com' }));
    expect(await screen.findByText('test')).toBeInTheDocument();
    expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('menuitem', { name: 'logOut' }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
