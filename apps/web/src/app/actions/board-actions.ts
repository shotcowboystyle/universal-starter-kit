'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { API_URL } from '@/constants/routes';
import type { UpdateBoardInput } from '@/types/board-api';

const boardResponseSchema = z.looseObject({ _id: z.string(), title: z.string() });

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const cookieStore = await cookies();
  const token = cookieStore.get('jwt')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token !== undefined && token !== '' && { Authorization: `Bearer ${token}` }),
  };
};

export const createBoard = async (data: { title: string; description?: string; owner: string }) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/boards`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create board');
  }
  return boardResponseSchema.parse(await response.json());
};

export const updateBoard = async (id: string, data: UpdateBoardInput) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/boards/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update board');
  }
  return boardResponseSchema.parse(await response.json());
};

export const deleteBoard = async (id: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/boards/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to delete board');
  }
};
