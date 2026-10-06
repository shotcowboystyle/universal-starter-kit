import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ThemeToggle from '@/components/layout/ThemeToggle';

vi.mock(import('next-themes'), () => ({
  useTheme: vi.fn<typeof useTheme>(),
}));

vi.mock(import('next-intl'), async () => {
  const { mockUseTranslations } = await import('../../../helpers/key-translator');
  return { useTranslations: mockUseTranslations };
});

describe(ThemeToggle, () => {
  const mockSetTheme = vi.fn<(theme: string) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTheme).mockReturnValue({
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
      themes: ['light', 'dark', 'system'],
    } as any);
  });

  it('renders an accessible trigger', () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'toggleTheme' })).toBeInTheDocument();
  });

  it.each(['light', 'dark', 'system'])('sets the %s theme', async (theme) => {
    renderWithProviders(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'toggleTheme' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: theme }));
    expect(mockSetTheme).toHaveBeenCalledWith(theme);
  });
});
