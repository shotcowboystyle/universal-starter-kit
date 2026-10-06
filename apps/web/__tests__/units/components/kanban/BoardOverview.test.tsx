import { renderWithProviders as render } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
/// <reference types="react" />
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardOverview } from '@/components/kanban/BoardOverview';
import type { Board } from '@/types/dbInterface';

// Ensure React is globally available
globalThis.React = React;

// Mock dependencies
vi.mock('@/hooks/useBoards', () => ({
  useBoards: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  AuthService: {
    getSession: vi.fn(),
  },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => ({
    setSession: vi.fn(),
  })),
}));

vi.mock('@/stores/workspace-store', () => {
  const store = {
    userId: null,
    setUserInfo: vi.fn(),
  };
  return {
    useWorkspaceStore: Object.assign(
      vi.fn(() => store),
      {
        getState: () => store,
      },
    ),
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api/boards/queries', () => ({
  useDeleteBoard: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn() })),
  useUpdateBoard: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));

describe('BoardOverview', () => {
  const mockMyBoards: Board[] = [
    {
      _id: 'board-1',
      title: 'My Board 1',
      description: 'Description 1',
      owner: 'user-1',
      members: [{ _id: 'user-1', name: 'John Doe', email: 'john@example.com' }],
      projects: [{ _id: 'proj-1', title: 'Project 1' } as any],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      _id: 'board-2',
      title: 'My Board 2',
      description: '',
      owner: 'user-1',
      members: [],
      projects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockTeamBoards: Board[] = [
    {
      _id: 'board-3',
      title: 'Team Board 1',
      description: 'Team Description',
      owner: {
        _id: 'user-2',
        name: 'Jane Doe',
        email: 'jane@example.com',
        createdAt: new Date(),
      } as any,
      members: [],
      projects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };

  const mockSearchParams = {
    get: vi.fn(() => null),
    toString: vi.fn(() => ''),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { useBoards } = await import('@/hooks/useBoards');
    const { useRouter, usePathname } = await import('@/i18n/navigation');
    const { useSearchParams } = await import('next/navigation');

    vi.mocked(useBoards).mockReturnValue({
      myBoards: mockMyBoards,
      teamBoards: mockTeamBoards,
      loading: false,
      refresh: vi.fn(),
      error: null,
    });

    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    vi.mocked(usePathname).mockReturnValue('/boards');
    vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any);
  });

  it('should render loading state when boards are loading', async () => {
    const { useBoards } = await import('@/hooks/useBoards');
    vi.mocked(useBoards).mockReturnValue({
      myBoards: [],
      teamBoards: [],
      loading: true,
      refresh: vi.fn(),
      error: null,
    });

    render(<BoardOverview />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('should render my boards section', () => {
    render(<BoardOverview />);

    expect(screen.getByTestId('myBoardsTitle')).toBeInTheDocument();
    expect(screen.getByText('My Board 1')).toBeInTheDocument();
    expect(screen.getByText('My Board 2')).toBeInTheDocument();
  });

  it('should render team boards section', () => {
    render(<BoardOverview />);

    expect(screen.getByTestId('teamBoardsTitle')).toBeInTheDocument();
    expect(screen.getByText('Team Board 1')).toBeInTheDocument();
  });

  it('should filter boards by search query', () => {
    render(<BoardOverview />);

    const searchInput = screen.getByPlaceholderText('searchBoards');
    fireEvent.change(searchInput, { target: { value: 'My Board 1' } });

    expect(screen.getByText('My Board 1')).toBeInTheDocument();
    expect(screen.queryByText('My Board 2')).not.toBeInTheDocument();
  });

  it('should render filter select', () => {
    render(<BoardOverview />);
    expect(screen.getByTestId('select-filter-trigger')).toBeInTheDocument();
  });

  it('should show only team boards when the team filter is selected', async () => {
    render(<BoardOverview />);
    const trigger = within(screen.getByTestId('select-filter-trigger')).getByRole('combobox');
    fireEvent.click(trigger);
    const option = (await screen.findAllByRole('option')).find((el) => el.textContent === 'teamBoards');
    // Select rows arm selection on pointerdown, then commit on click
    fireEvent.pointerDown(option!);
    fireEvent.click(option!);

    await waitFor(() => {
      expect(screen.queryByTestId('myBoardsTitle')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('teamBoardsTitle')).toBeInTheDocument();
    expect(screen.getByText('Team Board 1')).toBeInTheDocument();
  });

  it('should navigate to board on click', () => {
    render(<BoardOverview />);

    fireEvent.click(screen.getByTestId('board-card-board-1'));

    expect(mockRouter.push).toHaveBeenCalledWith('/boards/board-1');
  });

  it('should show empty state when no my boards found', async () => {
    const { useBoards } = await import('@/hooks/useBoards');
    vi.mocked(useBoards).mockReturnValue({
      myBoards: [],
      teamBoards: mockTeamBoards,
      loading: false,
      refresh: vi.fn(),
      error: null,
    });

    render(<BoardOverview />);
    expect(screen.getByText('noBoardsFound')).toBeInTheDocument();
  });

  it('should show empty state when no team boards found', async () => {
    const { useBoards } = await import('@/hooks/useBoards');
    vi.mocked(useBoards).mockReturnValue({
      myBoards: mockMyBoards,
      teamBoards: [],
      loading: false,
      refresh: vi.fn(),
      error: null,
    });

    render(<BoardOverview />);
    expect(screen.getByText('noTeamBoardsFound')).toBeInTheDocument();
  });

  it('should show "noDescription" when board has no description', () => {
    render(<BoardOverview />);
    const noDescCards = screen.getAllByText('noDescription');
    expect(noDescCards.length).toBeGreaterThan(0);
  });

  it('should display board projects', () => {
    render(<BoardOverview />);
    expect(screen.getByText(/Project 1/)).toBeInTheDocument();
  });

  it('should display board members', () => {
    render(<BoardOverview />);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it('should handle login success', async () => {
    const { useSearchParams } = await import('next/navigation');
    const { AuthService } = await import('@/lib/auth/authService');
    const { toast } = await import('sonner');
    const { useBoards } = await import('@/hooks/useBoards');

    const mockRefresh = vi.fn();

    vi.mocked(useSearchParams).mockReturnValue({
      ...mockSearchParams,
      get: vi.fn(() => 'true'),
    } as any);
    vi.mocked(AuthService.getSession).mockResolvedValue({
      user: {
        _id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      },
    } as any);

    vi.mocked(useBoards).mockReturnValue({
      myBoards: mockMyBoards,
      teamBoards: mockTeamBoards,
      loading: false,
      refresh: mockRefresh,
      error: null,
    });

    render(<BoardOverview />);

    await waitFor(() => {
      expect(AuthService.getSession).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('success');
      expect(mockRefresh).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalled();
    });
  });

  it('should handle login error', async () => {
    const { useSearchParams } = await import('next/navigation');
    const { AuthService } = await import('@/lib/auth/authService');
    const { toast } = await import('sonner');

    vi.mocked(useSearchParams).mockReturnValue({
      ...mockSearchParams,
      get: vi.fn(() => 'true'),
    } as any);
    vi.mocked(AuthService.getSession).mockRejectedValue(new Error('Session error'));

    render(<BoardOverview />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('error');
    });
  });

  it('should handle visibility change', async () => {
    const { useBoards } = await import('@/hooks/useBoards');
    const mockRefresh = vi.fn();

    vi.mocked(useBoards).mockReturnValue({
      myBoards: mockMyBoards,
      teamBoards: mockTeamBoards,
      loading: false,
      refresh: mockRefresh,
      error: null,
    });

    render(<BoardOverview />);

    // Simulate visibility change
    Object.defineProperty(document, 'visibilityState', {
      writable: true,
      configurable: true,
      value: 'visible',
    });

    fireEvent(document, new Event('visibilitychange'));

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('should render new board button', () => {
    render(<BoardOverview />);
    expect(screen.getByTestId('new-board-trigger')).toBeInTheDocument();
  });

  it('should render board actions only for my boards', () => {
    render(<BoardOverview />);
    expect(screen.getByLabelText('My Board 1 actions')).toBeInTheDocument();
    expect(screen.getByLabelText('My Board 2 actions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Team Board 1 actions')).not.toBeInTheDocument();
  });

  it('opens the board actions menu without navigating to the board', async () => {
    render(<BoardOverview />);
    fireEvent.click(screen.getByLabelText('My Board 1 actions'));

    expect(await screen.findByTestId('edit-board-button')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('edit-board-button'));
    expect(await screen.findByText('editBoardTitle')).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens the new board dialog from the trigger', async () => {
    render(<BoardOverview />);
    fireEvent.click(screen.getByTestId('new-board-trigger'));
    expect(await screen.findByTestId('new-board-dialog-title')).toHaveTextContent('newBoardTitle');
  });

  it('should show 0 projects when board has no projects', () => {
    render(<BoardOverview />);
    const zeroProjects = screen.getAllByText(/projects:.*0/);
    expect(zeroProjects.length).toBeGreaterThan(0);
  });

  it('should display owner name for team boards', () => {
    render(<BoardOverview />);
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });
});
