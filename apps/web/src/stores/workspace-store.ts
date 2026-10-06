import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createBoardSlice } from './board-store';
import { createProjectSlice } from './project-store';
import { createTaskSlice } from './task-store';
import type { WorkspaceState } from './types';

export type { BoardSliceState, ProjectSliceState, TaskSliceState } from './types';

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get, api) => ({
      // User slice (inline - too small for separate file)
      userId: null,
      userEmail: null,
      setUserInfo: (email: string, userId: string) => {
        if (!email || !userId) {
          throw new Error('Email and userId are required');
        }
        set((state) =>
          state.userEmail === email && state.userId === userId ? state : { ...state, userEmail: email, userId },
        );
      },

      // Filter slice (inline - too small for separate file)
      filter: { status: null, search: '' },
      setFilter: (filter) => {
        set((state) => ({ filter: { ...state.filter, ...filter } }));
      },

      // Reset slice (inline - too small for separate file)
      resetInBoards: () => {
        set({
          projects: [],
          currentBoardId: null,
          filter: { status: null, search: '' },
        });
      },

      // Composed slices
      // oxlint-disable-next-line typescript/strict-void-return -- zustand persist widens setState to void | Promise<void>, the slice creators expect void
      ...createBoardSlice(set, get, api),
      // oxlint-disable-next-line typescript/strict-void-return -- zustand persist widens setState to void | Promise<void>, the slice creators expect void
      ...createProjectSlice(set, get, api),
      // oxlint-disable-next-line typescript/strict-void-return -- zustand persist widens setState to void | Promise<void>, the slice creators expect void
      ...createTaskSlice(set, get, api),
    }),
    {
      name: 'workspace-store',
      partialize: (state) => ({
        currentBoardId: state.currentBoardId,
        filter: state.filter,
      }),
    },
  ),
);
