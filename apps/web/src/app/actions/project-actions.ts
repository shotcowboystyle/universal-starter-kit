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

export const createProject = async (data: {
  title: string;
  description?: string;
  boardId: string;
  owner: string;
  orderInBoard?: number;
}) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create project');
  }
  return await response.json();
};

export const updateProject = async (id: string, data: Record<string, unknown>) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/projects/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update project');
  }
  return await response.json();
};

export const deleteProject = async (id: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/projects/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to delete project');
  }
};

export const getProjects = async (boardId: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/projects?boardId=${boardId}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  return await response.json();
};
