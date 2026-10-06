import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppSidebar from '@/components/layout/AppSidebar';
import { useBoards } from '@/hooks/useBoards';
import { usePathname } from '@/i18n/navigation';

const mockPush = vi.fn();

vi.mock('@/hooks/useBoards', () => ({
  useBoards: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: vi.fn(() => '/boards'),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const board = (id: string, title: string) => ({
  _id: id,
  title,
  owner: 'user-1',
  members: [],
  projects: [],
  createdAt: '',
  updatedAt: '',
});

function mockBoards(overrides: Record<string, unknown> = {}) {
  vi.mocked(useBoards).mockReturnValue({
    myBoards: [board('board-1', 'My Board 1'), board('board-2', 'My Board 2')],
    teamBoards: [board('board-3', 'Team Board 1')],
    loading: false,
    ...overrides,
  } as any);
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/boards');
    mockBoards();
  });

  it('renders title, overview, section labels and boards', () => {
    renderWithProviders(<AppSidebar />);
    expect(screen.getByRole('navigation', { name: 'title' })).toBeInTheDocument();
    expect(screen.getByText('overview')).toBeInTheDocument();
    expect(screen.getByText('myBoards')).toBeInTheDocument();
    expect(screen.getByText('teamBoards')).toBeInTheDocument();
    expect(screen.getByText('My Board 1')).toBeInTheDocument();
    expect(screen.getByText('My Board 2')).toBeInTheDocument();
    expect(screen.getByText('Team Board 1')).toBeInTheDocument();
  });

  it('shows loading rows while boards load', () => {
    mockBoards({ myBoards: [], teamBoards: [], loading: true });
    renderWithProviders(<AppSidebar />);
    expect(screen.getAllByText('loading')).toHaveLength(2);
  });

  it('renders section labels with no boards', () => {
    mockBoards({ myBoards: [], teamBoards: [] });
    renderWithProviders(<AppSidebar />);
    expect(screen.getByText('myBoards')).toBeInTheDocument();
    expect(screen.getByText('teamBoards')).toBeInTheDocument();
    expect(screen.queryByText('My Board 1')).not.toBeInTheDocument();
  });

  it('navigates to a board and calls onNavigate', () => {
    const onNavigate = vi.fn();
    renderWithProviders(<AppSidebar onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Team Board 1'));
    expect(mockPush).toHaveBeenCalledWith('/boards/board-3');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('navigates to the overview', () => {
    renderWithProviders(<AppSidebar />);
    fireEvent.click(screen.getByText('overview'));
    expect(mockPush).toHaveBeenCalledWith('/boards');
  });

  it('marks the board matching the pathname as active', () => {
    vi.mocked(usePathname).mockReturnValue('/en/boards/board-2');
    renderWithProviders(<AppSidebar />);
    const active = document.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent('My Board 2');
  });
});
