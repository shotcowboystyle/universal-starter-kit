import type { Board } from '@repo/store';

import { API_ROUTES } from '@/constants/routes';

import { fetchWithAuth } from './fetch-with-auth';

export interface CreateBoardInput {
  title: string;
  description?: string;
  owner?: string;
}

export interface UpdateBoardInput {
  title?: string;
  description?: string | null;
}

export const boardApi = {
  getBoards: async () => await fetchWithAuth<{ myBoards: Board[]; teamBoards: Board[] }>(API_ROUTES.BOARDS),
  getBoardById: async (id: string) => await fetchWithAuth<Board>(`${API_ROUTES.BOARDS}/${id}`),
  createBoard: async (input: CreateBoardInput) =>
    await fetchWithAuth<Board>(API_ROUTES.BOARDS, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateBoard: async (id: string, input: UpdateBoardInput) =>
    await fetchWithAuth<Board>(`${API_ROUTES.BOARDS}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteBoard: async (id: string) =>
    await fetchWithAuth<void>(
      `${API_ROUTES.BOARDS}/${id}`,
      {
        method: 'DELETE',
      },
      true,
    ),
  addBoardMember: async (boardId: string, memberId: string) =>
    await fetchWithAuth<Board>(`${API_ROUTES.BOARDS}/${boardId}/members/${memberId}`, {
      method: 'POST',
    }),
};
