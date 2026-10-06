import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAddBoardMember,
  useBoard,
  useBoards,
  useCreateBoard,
  useDeleteBoard,
  useUpdateBoard,
} from '@/lib/api/boards/queries';
import { BOARD_KEYS } from '@/types/board-api';

// Mock boardApi
const boardApiMock = vi.hoisted(() => ({
  getBoards: vi.fn<(...args: unknown[]) => Promise<object>>(),
  getBoardById: vi.fn<(...args: unknown[]) => Promise<object>>(),
  createBoard: vi.fn<(...args: unknown[]) => Promise<object>>(),
  updateBoard: vi.fn<(...args: unknown[]) => Promise<object>>(),
  deleteBoard: vi.fn<(...args: unknown[]) => Promise<object>>(),
  addBoardMember: vi.fn<(...args: unknown[]) => Promise<object>>(),
}));

vi.mock(import('@/lib/api/board-api'), () => ({
  boardApi: boardApiMock as never,
}));

describe('Board Query Hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe(useBoards, () => {
    it('should fetch boards successfully', async () => {
      const mockBoards = {
        myBoards: [{ _id: '1', title: 'Board 1' } as any],
        teamBoards: [{ _id: '2', title: 'Board 2' } as any],
      };
      boardApiMock.getBoards.mockResolvedValue(mockBoards);

      const { result } = renderHook(() => useBoards(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toStrictEqual(mockBoards);
      expect(boardApiMock.getBoards).toHaveBeenCalledOnce();
    });

    it('should handle fetch error', async () => {
      const mockError = new Error('Failed to fetch boards');
      boardApiMock.getBoards.mockRejectedValue(mockError);

      const { result } = renderHook(() => useBoards(), { wrapper });

      // useBoards has retry: 3 with exponential backoff, so wait longer
      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        // Long timeout for retries with exponential backoff
        { timeout: 60_000 },
      );

      expect(result.current.error).toStrictEqual(mockError);
      // Should have retried 3 times (4 total calls)
      expect(boardApiMock.getBoards).toHaveBeenCalledTimes(4);
    }, 70_000);
  });

  describe(useBoard, () => {
    it('should fetch single board successfully', async () => {
      const mockBoard = { _id: '1', title: 'Board 1' };
      boardApiMock.getBoardById.mockResolvedValue(mockBoard);

      const { result } = renderHook(() => useBoard('1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toStrictEqual(mockBoard);
      expect(boardApiMock.getBoardById).toHaveBeenCalledWith('1');
    });

    it('should not fetch when boardId is undefined', () => {
      const { result } = renderHook(() => useBoard(), { wrapper });

      expect(result.current.data).toBeUndefined();
      expect(boardApiMock.getBoardById).not.toHaveBeenCalled();
    });
  });

  describe(useCreateBoard, () => {
    it('should create board and invalidate queries', async () => {
      const newBoard = { _id: '3', title: 'New Board' };
      boardApiMock.createBoard.mockResolvedValue(newBoard);

      const { result } = renderHook(() => useCreateBoard(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync({ title: 'New Board' } as any);
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.list(),
        });
      });

      const [callArgs] = boardApiMock.createBoard.mock.calls;
      expect(callArgs[0]).toStrictEqual({ title: 'New Board' });
    });
  });

  describe(useUpdateBoard, () => {
    it('should update board and invalidate queries', async () => {
      const updatedBoard = { _id: '1', title: 'Updated Board' };
      boardApiMock.updateBoard.mockResolvedValue(updatedBoard);

      const { result } = renderHook(() => useUpdateBoard(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync({ id: '1', title: 'Updated Board' });
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.list(),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.detail('1'),
        });
      });

      expect(boardApiMock.updateBoard).toHaveBeenCalledWith('1', { title: 'Updated Board' });
    });
  });

  describe(useDeleteBoard, () => {
    it('should delete board and remove from cache', async () => {
      boardApiMock.deleteBoard.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useDeleteBoard(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const removeSpy = vi.spyOn(queryClient, 'removeQueries');

      await act(async () => {
        await result.current.mutateAsync('1');
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.list(),
        });
        expect(removeSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.detail('1'),
        });
      });

      const [deleteCallArgs] = boardApiMock.deleteBoard.mock.calls;
      expect(deleteCallArgs[0]).toBe('1');
    });
  });

  describe(useAddBoardMember, () => {
    it('should add board member and invalidate queries', async () => {
      const updatedBoard = { _id: '1', title: 'Board 1', members: ['user1', 'user2'] };
      boardApiMock.addBoardMember.mockResolvedValue(updatedBoard);

      const { result } = renderHook(() => useAddBoardMember(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync({ boardId: '1', memberId: 'user2' });
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.detail('1'),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: BOARD_KEYS.list(),
        });
      });

      expect(boardApiMock.addBoardMember).toHaveBeenCalledWith('1', 'user2');
    });
  });
});
