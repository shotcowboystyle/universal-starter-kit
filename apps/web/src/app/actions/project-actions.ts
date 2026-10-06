'use server';

import { cookies } from 'next/headers';

import { parseJson } from '@/lib/api/parse-json';
import type { Project } from '@/types/db-interface';
import type { UpdateProjectInput } from '@/types/project-api';

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
  return parseJson<Project>(await response.text());
};

export const updateProject = async (id: string, data: UpdateProjectInput) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/projects/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update project');
  }
  return parseJson<Project>(await response.text());
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
  return parseJson<Project[]>(await response.text());
};
