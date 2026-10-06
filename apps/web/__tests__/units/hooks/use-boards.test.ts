import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBoards } from '@/hooks/use-boards';
import type { useBoards as UseApiBoards } from '@/lib/api/boards/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Board } from '@/types/db-interface';

vi.mock(import('@/lib/api/boards/queries'), () => ({
  useBoards: vi.fn<typeof UseApiBoards>(),
}));

describe(useBoards, () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      userId: 'user-123',
      userEmail: 'test@example.com',
      projects: [],
      isLoadingProjects: false,
      currentBoardId: null,
      filter: {
        status: null,
        search: '',
      },
    });
    vi.clearAllMocks();
  });

  it('should return empty arrays when no data is available', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');
    vi.mocked(useApiBoards).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    expect(result.current.myBoards).toStrictEqual([]);
    expect(result.current.teamBoards).toStrictEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should split boards by ownership when receiving a flat array', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockBoards: Board[] = [
      {
        _id: 'board-1',
        title: 'My Board',
        description: 'My board description',
        owner: 'user-123',
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'board-2',
        title: 'Team Board',
        description: 'Team board description',
        owner: 'user-456',
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useApiBoards).mockReturnValue({
      data: { myBoards: [mockBoards[0]], teamBoards: [mockBoards[1]] },
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toHaveLength(1);
      expect(result.current.teamBoards).toHaveLength(1);
    });

    expect(result.current.myBoards[0]._id).toBe('board-1');
    expect(result.current.teamBoards[0]._id).toBe('board-2');
  });

  it('should use separate myBoards and teamBoards from API response', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockMyBoards: Board[] = [
      {
        _id: 'board-1',
        title: 'My Board',
        description: 'My board description',
        owner: 'user-123',
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockTeamBoards: Board[] = [
      {
        _id: 'board-2',
        title: 'Team Board',
        description: 'Team board description',
        owner: 'user-456',
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useApiBoards).mockReturnValue({
      data: { myBoards: mockMyBoards, teamBoards: mockTeamBoards },
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toHaveLength(1);
      expect(result.current.teamBoards).toHaveLength(1);
    });

    expect(result.current.myBoards[0]._id).toBe('board-1');
    expect(result.current.teamBoards[0]._id).toBe('board-2');
  });

  it('should normalize boards with missing members and projects', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockBoards: Partial<Board>[] = [
      {
        _id: 'board-1',
        title: 'My Board',
        description: 'My board description',
        owner: 'user-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useApiBoards).mockReturnValue({
      data: { myBoards: mockBoards as Board[], teamBoards: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toHaveLength(1);
    });

    expect(result.current.myBoards[0].members).toStrictEqual([]);
    expect(result.current.myBoards[0].projects).toStrictEqual([]);
  });

  it('should handle owner as object reference', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockBoards: Board[] = [
      {
        _id: 'board-1',
        title: 'My Board',
        description: 'My board description',
        owner: { _id: 'user-123', name: 'Test User', email: 'test@example.com' },
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useApiBoards).mockReturnValue({
      data: { myBoards: mockBoards, teamBoards: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toHaveLength(1);
    });

    expect(result.current.myBoards[0]._id).toBe('board-1');
  });

  it('should return loading state', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    vi.mocked(useApiBoards).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    expect(result.current.loading).toBe(true);
  });

  it('should return error state', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockError = new Error('Failed to fetch boards');

    vi.mocked(useApiBoards).mockReturnValue({
      data: null,
      isLoading: false,
      error: mockError,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    expect(result.current.error).toBe(mockError);
  });

  it('should provide refresh function', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockRefetch = vi.fn<() => Promise<void>>();

    vi.mocked(useApiBoards).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    const { result } = renderHook(() => useBoards());

    void result.current.refresh();

    expect(mockRefetch).toHaveBeenCalledWith();
  });

  it('should handle empty myBoards and teamBoards from API', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    vi.mocked(useApiBoards).mockReturnValue({
      data: { myBoards: [], teamBoards: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toStrictEqual([]);
      expect(result.current.teamBoards).toStrictEqual([]);
    });
  });

  it('should handle null values for myBoards and teamBoards from API', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    vi.mocked(useApiBoards).mockReturnValue({
      data: { myBoards: null, teamBoards: null },
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toStrictEqual([]);
      expect(result.current.teamBoards).toStrictEqual([]);
    });
  });

  it('should categorize boards by owner when receiving flat array', async () => {
    const { useBoards: useApiBoards } = await import('@/lib/api/boards/queries');

    const mockBoards: Board[] = [
      {
        _id: 'board-1',
        title: 'My Board',
        description: 'My board description',
        owner: 'user-123',
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'board-2',
        title: 'Team Board',
        description: 'Team board description',
        owner: 'user-456',
        members: [],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useApiBoards).mockReturnValue({
      data: mockBoards,
      isLoading: false,
      error: null,
      refetch: vi.fn<() => Promise<void>>(),
    } as any);

    const { result } = renderHook(() => useBoards());

    await waitFor(() => {
      expect(result.current.myBoards).toHaveLength(1);
      expect(result.current.teamBoards).toHaveLength(1);
    });

    expect(result.current.myBoards[0]._id).toBe('board-1');
    expect(result.current.teamBoards[0]._id).toBe('board-2');
  });
});
