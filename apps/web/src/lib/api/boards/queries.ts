import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { BOARD_KEYS } from '@/types/board-api';

import { boardApi } from '../board-api';

export const useBoards = () =>
  useQuery({
    queryKey: BOARD_KEYS.list(),
    queryFn: async () => await boardApi.getBoards(),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
    // 10 minutes (formerly cacheTime)
    gcTime: 10 * 60 * 1000,
  });

export const useBoard = (boardId = '') =>
  useQuery({
    queryKey: BOARD_KEYS.detail(boardId),
    queryFn: async () => await boardApi.getBoardById(boardId),
    enabled: boardId !== '',
  });

export const useCreateBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Parameters<typeof boardApi.createBoard>[0]) => await boardApi.createBoard(data),
    onSuccess: () => {
      // Invalidate the boards list query to refetch
      void queryClient.invalidateQueries({
        queryKey: BOARD_KEYS.list(),
      });
    },
  });
};

export const useUpdateBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Parameters<typeof boardApi.updateBoard>[1]) =>
      await boardApi.updateBoard(id, updates),
    onSuccess: (updatedBoard) => {
      // Invalidate both the list and the specific board
      void queryClient.invalidateQueries({
        queryKey: BOARD_KEYS.list(),
      });
      void queryClient.invalidateQueries({
        queryKey: BOARD_KEYS.detail(updatedBoard._id),
      });
    },
  });
};

export const useDeleteBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await boardApi.deleteBoard(id);
    },
    onSuccess: (_, boardId) => {
      // Invalidate the boards list
      void queryClient.invalidateQueries({
        queryKey: BOARD_KEYS.list(),
      });
      // Remove the specific board from the cache
      queryClient.removeQueries({
        queryKey: BOARD_KEYS.detail(boardId),
      });
    },
  });
};

export const useAddBoardMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ boardId, memberId }: { boardId: string; memberId: string }) =>
      await boardApi.addBoardMember(boardId, memberId),
    onSuccess: (updatedBoard) => {
      // Invalidate the board data
      void queryClient.invalidateQueries({
        queryKey: BOARD_KEYS.detail(updatedBoard._id),
      });
      void queryClient.invalidateQueries({
        queryKey: BOARD_KEYS.list(),
      });
    },
  });
};
