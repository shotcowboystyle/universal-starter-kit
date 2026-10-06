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

export const createTask = async (data: Record<string, unknown>) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create task');
  }
  return await response.json();
};

export const updateTask = async (id: string, data: Record<string, unknown>) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update task');
  }
  return await response.json();
};

export const deleteTask = async (id: string) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to delete task');
  }
};

export const moveTask = async (taskId: string, projectId: string, orderInProject: number) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/tasks/${taskId}/move`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      projectId,
      orderInProject,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to move task');
  }
  return await response.json();
};

export const getTasks = async (projectId?: string, assigneeId?: string) => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (projectId) {
    params.append('projectId', projectId);
  }
  if (assigneeId) {
    params.append('assigneeId', assigneeId);
  }

  const query = params.toString();
  const url = query ? `${API_URL}/tasks?${query}` : `${API_URL}/tasks`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return await response.json();
};
