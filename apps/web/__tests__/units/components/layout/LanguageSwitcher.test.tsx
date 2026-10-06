import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LanguageSwitcher from '@/components/layout/LanguageSwitcher';

const mockReplace = vi.fn();
const mockUsePathname = vi.fn();
const mockUseParams = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockUsePathname(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
}));

const pick = async (label: string) => {
  fireEvent.click(screen.getByRole('button'));
  const item = await screen.findByRole('menuitem', { name: label });
  fireEvent.click(item);
};

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/boards');
    mockUseParams.mockReturnValue({ locale: 'en' });
  });

  it('shows the current locale on the trigger', () => {
    renderWithProviders(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
  });

  it('shows DE when locale is de', () => {
    mockUseParams.mockReturnValue({ locale: 'de' });
    renderWithProviders(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'DE' })).toBeInTheDocument();
  });

  it('lists both languages when opened', async () => {
    renderWithProviders(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    await expect(screen.findByRole('menuitem', { name: 'English' })).resolves.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Deutsch' })).toBeInTheDocument();
  });

  it('replaces the route with the new locale', async () => {
    renderWithProviders(<LanguageSwitcher />);
    await pick('Deutsch');
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/boards', { locale: 'de' });
    });
  });

  it('strips the locale prefix from the pathname', async () => {
    mockUsePathname.mockReturnValue('/de/projects/123');
    mockUseParams.mockReturnValue({ locale: 'de' });
    renderWithProviders(<LanguageSwitcher />);
    await pick('English');
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/projects/123', { locale: 'en' });
    });
  });

  it('falls back to / when the pathname is only the locale', async () => {
    mockUsePathname.mockReturnValue('/en');
    renderWithProviders(<LanguageSwitcher />);
    await pick('Deutsch');
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/', { locale: 'de' });
    });
  });
});
