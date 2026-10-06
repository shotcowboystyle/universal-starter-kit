import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

const mockPush = vi.fn();

vi.mock('@/hooks/useBreadcrumbs', () => ({
  useBreadcrumbs: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function mockItems(items: { title: string; link: string }[]) {
  vi.mocked(useBreadcrumbs).mockReturnValue({ items, rootLink: '/boards' });
}

describe('Breadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItems([
      { title: 'Boards', link: '/boards' },
      { title: 'Board 1', link: '/boards/1' },
    ]);
  });

  it('renders a breadcrumb landmark with every item', () => {
    renderWithProviders(<Breadcrumbs />);
    expect(screen.getByTestId('breadcrumbs')).toBeInTheDocument();
    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.getByText('Board 1')).toBeInTheDocument();
  });

  it('marks the last item as the current page', () => {
    renderWithProviders(<Breadcrumbs />);
    expect(screen.getByText('Board 1')).toHaveAttribute('aria-current', 'page');
  });

  it('navigates through the locale-aware router', () => {
    renderWithProviders(<Breadcrumbs />);
    fireEvent.click(screen.getByText('Boards'));
    expect(mockPush).toHaveBeenCalledWith('/boards');
  });

  it('renders a single item', () => {
    mockItems([{ title: 'Board & Project', link: '/boards' }]);
    renderWithProviders(<Breadcrumbs />);
    expect(screen.getByText('Board & Project')).toBeInTheDocument();
  });
});
