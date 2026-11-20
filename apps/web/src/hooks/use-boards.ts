'use client';

import { useMemo } from 'react';

import { useBoards as useApiBoards } from '@/lib/api/boards/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Board } from '@/types/db-interface';

const normalizeBoard = (board: Board): Board => ({
  ...board,
  members: Array.isArray(board.members) ? board.members : [],
  projects: Array.isArray(board.projects) ? board.projects : [],
});

export const useBoards = () => {
  const { userId } = useWorkspaceStore();
  const { data, isLoading, error, refetch } = useApiBoards();

  const { myBoards, teamBoards } = useMemo(() => {
    if (!data) {
      return { myBoards: [], teamBoards: [] };
    }

    if ('myBoards' in data && 'teamBoards' in data) {
      return {
        myBoards: (data.myBoards ?? []).map(normalizeBoard),
        teamBoards: (data.teamBoards ?? []).map(normalizeBoard),
      };
    }

    const boards = Array.isArray(data) ? data : [];
    const mine: Board[] = [];
    const team: Board[] = [];

    // SAFETY: legacy responses were a plain Board[]; Array.isArray only narrows to any[]
    for (const board of boards as Board[]) {
      const normalizedBoard = normalizeBoard(board);
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- owner is either an id string or a populated user object
      const ownerId = typeof normalizedBoard.owner === 'string' ? normalizedBoard.owner : normalizedBoard.owner?._id;

      if (ownerId === userId) {
        mine.push(normalizedBoard);
      } else {
        team.push(normalizedBoard);
      }
    }

    return { myBoards: mine, teamBoards: team };
  }, [data, userId]);

  return {
    myBoards,
    teamBoards,
    loading: isLoading,
    error,
    refresh: refetch,
  };
};
