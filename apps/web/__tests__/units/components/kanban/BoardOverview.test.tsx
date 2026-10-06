import { renderWithProviders as render } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
/// <reference types="react" />
import type { useSearchParams as UseSearchParamsFn } from 'next/navigation';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardOverview } from '@/components/kanban/BoardOverview';
import type { useBoards as useBoardsHook } from '@/hooks/use-boards';
import type { usePathname as UsePathnameFn, useRouter as UseRouterFn } from '@/i18n/navigation';
import type { Board, Session } from '@/types/db-interface';

// Ensure React is globally available
globalThis.React = React;

type RefreshFn = ReturnType<typeof useBoardsHook>['refresh'];

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn<() => Promise<Session | null>>(),
}));

// Mock dependencies
vi.mock(import('@/hooks/use-boards'), () => ({
  useBoards: vi.fn<typeof useBoardsHook>(),
}));

vi.mock(import('@/i18n/navigation'), () => ({
  useRouter: vi.fn<typeof UseRouterFn>(),
  usePathname: vi.fn<typeof UsePathnameFn>(),
}));

vi.mock(import('next/navigation'), async (importOriginal) => ({
  ...(await importOriginal()),
  useSearchParams: vi.fn<typeof UseSearchParamsFn>(),
}));

// SAFETY: the component only calls AuthService.getSession, so the other statics are never reached
vi.mock(import('@/lib/auth/auth-service'), () => ({ AuthService: { getSession: mockGetSession } }) as never);

// SAFETY: the component only destructures setSession from the store hook
vi.mock(
  import('@/stores/auth-store'),
  () =>
    ({ useAuthStore: vi.fn<() => { setSession: () => void }>(() => ({ setSession: vi.fn<() => void>() })) }) as never,
);

// SAFETY: the component only reads userId/setUserInfo via the hook or getState, which the stub provides
vi.mock(import('@/stores/workspace-store'), () => {
  const store = {
    userId: null,
    setUserInfo: vi.fn<() => void>(),
  };
  return {
    useWorkspaceStore: Object.assign(
      vi.fn<() => typeof store>(() => store),
      {
        getState: () => store,
      },
    ),
  } as never;
});

// SAFETY: translators here only need to map a key to itself
vi.mock(import('next-intl'), () => ({ useTranslations: () => (key: string) => key }) as never);

// SAFETY: only toast.success/error are used by the component
vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<() => void>(),
        error: vi.fn<() => void>(),
      },
    }) as never,
);

// SAFETY: child dialogs only need the mutate/mutateAsync functions of the mutation hooks
vi.mock(
  import('@/lib/api/boards/queries'),
  () =>
    ({
      useDeleteBoard: vi.fn<() => { mutate: () => void; mutateAsync: () => void }>(() => ({
        mutate: vi.fn<() => void>(),
        mutateAsync: vi.fn<() => void>(),
      })),
      useUpdateBoard: vi.fn<() => { mutateAsync: () => void }>(() => ({ mutateAsync: vi.fn<() => void>() })),
    }) as never,
);

describe(BoardOverview, () => {
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
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
  };

  const mockSearchParams = {
    get: vi.fn<() => string | null>(() => null),
    toString: vi.fn<() => string>(() => ''),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { useBoards } = await import('@/hooks/use-boards');
    const { useRouter, usePathname } = await import('@/i18n/navigation');
    const { useSearchParams } = await import('next/navigation');

    vi.mocked(useBoards).mockReturnValue({
      myBoards: mockMyBoards,
      teamBoards: mockTeamBoards,
      loading: false,
      refresh: vi.fn<RefreshFn>(),
      error: null,
    });

    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    vi.mocked(usePathname).mockReturnValue('/boards');
    vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any);
  });

  it('should render loading state when boards are loading', async () => {
    const { useBoards } = await import('@/hooks/use-boards');
    vi.mocked(useBoards).mockReturnValue({
      myBoards: [],
      teamBoards: [],
      loading: true,
      refresh: vi.fn<RefreshFn>(),
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
    const options = await screen.findAllByRole('option');
    const option = options.find((el) => el.textContent === 'teamBoards');
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
    const { useBoards } = await import('@/hooks/use-boards');
    vi.mocked(useBoards).mockReturnValue({
      myBoards: [],
      teamBoards: mockTeamBoards,
      loading: false,
      refresh: vi.fn<RefreshFn>(),
      error: null,
    });

    render(<BoardOverview />);
    expect(screen.getByText('noBoardsFound')).toBeInTheDocument();
  });

  it('should show empty state when no team boards found', async () => {
    const { useBoards } = await import('@/hooks/use-boards');
    vi.mocked(useBoards).mockReturnValue({
      myBoards: mockMyBoards,
      teamBoards: [],
      loading: false,
      refresh: vi.fn<RefreshFn>(),
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
    expect(screen.getByText(/Project 1/u)).toBeInTheDocument();
  });

  it('should display board members', () => {
    render(<BoardOverview />);
    expect(screen.getByText(/John Doe/u)).toBeInTheDocument();
  });

  it('should handle login success', async () => {
    const { useSearchParams } = await import('next/navigation');
    const { toast } = await import('sonner');
    const { useBoards } = await import('@/hooks/use-boards');

    const mockRefresh = vi.fn<RefreshFn>();

    vi.mocked(useSearchParams).mockReturnValue({
      ...mockSearchParams,
      get: vi.fn<() => string>(() => 'true'),
    } as any);
    vi.mocked(mockGetSession).mockResolvedValue({
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
      expect(mockGetSession).toHaveBeenCalledWith();
      expect(toast.success).toHaveBeenCalledWith('success');
      expect(mockRefresh).toHaveBeenCalledWith();
      expect(mockRouter.replace).toHaveBeenCalledWith(expect.any(String), { scroll: false });
    });
  });

  it('should handle login error', async () => {
    const { useSearchParams } = await import('next/navigation');
    const { toast } = await import('sonner');

    vi.mocked(useSearchParams).mockReturnValue({
      ...mockSearchParams,
      get: vi.fn<() => string>(() => 'true'),
    } as any);
    vi.mocked(mockGetSession).mockRejectedValue(new Error('Session error'));

    render(<BoardOverview />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('error');
    });
  });

  it('should handle visibility change', async () => {
    const { useBoards } = await import('@/hooks/use-boards');
    const mockRefresh = vi.fn<RefreshFn>();

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

    expect(mockRefresh).toHaveBeenCalledWith();
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

    await expect(screen.findByTestId('edit-board-button')).resolves.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('edit-board-button'));
    await expect(screen.findByText('editBoardTitle')).resolves.toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens the new board dialog from the trigger', async () => {
    render(<BoardOverview />);
    fireEvent.click(screen.getByTestId('new-board-trigger'));
    await expect(screen.findByTestId('new-board-dialog-title')).resolves.toHaveTextContent('newBoardTitle');
  });

  it('should show 0 projects when board has no projects', () => {
    render(<BoardOverview />);
    const zeroProjects = screen.getAllByText(/projects:.*0/u);
    expect(zeroProjects.length).toBeGreaterThan(0);
  });

  it('should display owner name for team boards', () => {
    render(<BoardOverview />);
    expect(screen.getByText(/Jane Doe/u)).toBeInTheDocument();
  });
});
