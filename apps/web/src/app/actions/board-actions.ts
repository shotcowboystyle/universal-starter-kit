'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const cookieStore = await cookies();
  const token = cookieStore.get('jwt')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
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
  return await response.json();
};

export const updateBoard = async (id: string, data: Record<string, unknown>) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/boards/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update board');
  }
  return await response.json();
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
