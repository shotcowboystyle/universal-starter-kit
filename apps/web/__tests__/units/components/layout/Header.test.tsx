import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Header from '@/components/layout/Header';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'toggle' ? 'Toggle sidebar' : key),
}));

vi.mock('@/components/layout/Breadcrumbs', () => ({
  Breadcrumbs: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

vi.mock('@/components/layout/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher">Language</div>,
}));

vi.mock('@/components/layout/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle">Theme</div>,
}));

vi.mock('@/components/layout/UserNav', () => ({
  UserNav: () => <div data-testid="user-nav">User</div>,
}));

describe('Header', () => {
  it('renders a header landmark with all header controls', () => {
    renderWithProviders(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(screen.getByTestId('user-nav')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('toggles the sidebar from the trigger', () => {
    const onToggleSidebar = vi.fn();
    renderWithProviders(<Header onToggleSidebar={onToggleSidebar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });
});
