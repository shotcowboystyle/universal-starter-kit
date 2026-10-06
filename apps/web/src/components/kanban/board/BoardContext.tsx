'use client';

import { createContext, useContext, useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useBoards } from '@/hooks/use-boards';
import { useWorkspaceStore } from '@/stores/workspace-store';

interface BoardContextValue {
  currentUserId: string;
  isBoardOwner: boolean;
  isBoardMember: boolean;
  isAuthenticated: boolean;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export const BoardProvider = ({ children }: { children: React.ReactNode }) => {
  const currentBoardId = useWorkspaceStore((state) => state.currentBoardId);
  const { user: currentUser, isAuthenticated } = useAuth();
  const { myBoards, teamBoards } = useBoards();
  const currentUserId = currentUser?._id ?? '';

  const isBoardOwner = useMemo(() => {
    if (currentBoardId == null || currentBoardId === '' || currentUserId === '' || !isAuthenticated) {
      return false;
    }
    const currentBoard = myBoards.find((board) => board._id === currentBoardId);
    if (!currentBoard) {
      return false;
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- API union is `string | populated object`; a typeof check is the only way to tell them apart
    const ownerId = typeof currentBoard.owner === 'string' ? currentBoard.owner : currentBoard.owner?._id;
    return ownerId === currentUserId;
  }, [currentBoardId, currentUserId, myBoards, isAuthenticated]);

  const isBoardMember = useMemo(() => {
    if (currentBoardId == null || currentBoardId === '' || currentUserId === '' || !isAuthenticated) {
      return false;
    }
    const currentBoard = [...myBoards, ...teamBoards].find((board) => board._id === currentBoardId);
    if (!currentBoard) {
      return false;
    }
    return currentBoard.members.some((member) => member._id === currentUserId);
  }, [currentBoardId, currentUserId, myBoards, teamBoards, isAuthenticated]);

  const value = useMemo(
    () => ({ currentUserId, isBoardOwner, isBoardMember, isAuthenticated }),
    [currentUserId, isBoardOwner, isBoardMember, isAuthenticated],
  );

  return <BoardContext value={value}>{children}</BoardContext>;
};

export const useBoardContext = () => {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error('useBoardContext must be used within a BoardProvider');
  }
  return context;
};
