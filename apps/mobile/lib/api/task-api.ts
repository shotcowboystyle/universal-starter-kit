import type { Task, CreateTaskInput, UpdateTaskInput } from '@repo/store';

import { API_ROUTES } from '@/constants/routes';

import { fetchWithAuth } from './fetch-with-auth';

export interface TaskPermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export const taskApi = {
  getTasks: async (projectId?: string, assigneeId?: string) => {
    const params = new URLSearchParams();
    if (projectId !== undefined && projectId !== '') {
      params.append('projectId', projectId);
    }
    if (assigneeId !== undefined && assigneeId !== '') {
      params.append('assigneeId', assigneeId);
    }

    const query = params.toString();
    const url = query ? `${API_ROUTES.TASKS}?${query}` : API_ROUTES.TASKS;
    return await fetchWithAuth<Task[]>(url);
  },
  getTaskById: async (id: string) => await fetchWithAuth<Task>(`${API_ROUTES.TASKS}/${id}`),
  createTask: async (input: CreateTaskInput) =>
    await fetchWithAuth<Task>(API_ROUTES.TASKS, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTask: async (id: string, input: UpdateTaskInput) =>
    await fetchWithAuth<Task>(`${API_ROUTES.TASKS}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteTask: async (id: string) => {
    await fetchWithAuth<null>(
      `${API_ROUTES.TASKS}/${id}`,
      {
        method: 'DELETE',
      },
      true,
    );
  },
  getTaskPermissions: async (taskId: string) =>
    await fetchWithAuth<TaskPermissions>(`${API_ROUTES.TASKS}/${taskId}/permissions`),
  moveTask: async (taskId: string, projectId: string, orderInProject: number) =>
    await fetchWithAuth<Task>(`${API_ROUTES.TASKS}/${taskId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId, orderInProject }),
    }),
};
