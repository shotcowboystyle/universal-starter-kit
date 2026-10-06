'use server';

import { cookies } from 'next/headers';

import { parseJson } from '@/lib/api/parse-json';
import type { Task } from '@/types/db-interface';
import type { CreateTaskInput, UpdateTaskInput } from '@/types/task-api';

const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
const API_URL = envApiUrl === undefined || envApiUrl === '' ? 'http://localhost:3001' : envApiUrl;

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const cookieStore = await cookies();
  const token = cookieStore.get('jwt')?.value;
  return {
    'Content-Type': 'application/json',
    ...(token !== undefined && token !== '' && { Authorization: `Bearer ${token}` }),
  };
};

export const createTask = async (data: CreateTaskInput) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create task');
  }
  return parseJson<Task>(await response.text());
};

export const updateTask = async (id: string, data: UpdateTaskInput) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update task');
  }
  return parseJson<Task>(await response.text());
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
  return parseJson<Task>(await response.text());
};

export const getTasks = async (projectId?: string, assigneeId?: string) => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (projectId !== undefined && projectId !== '') {
    params.append('projectId', projectId);
  }
  if (assigneeId !== undefined && assigneeId !== '') {
    params.append('assigneeId', assigneeId);
  }

  const query = params.toString();
  const url = query === '' ? `${API_URL}/tasks` : `${API_URL}/tasks?${query}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return parseJson<Task[]>(await response.text());
};
