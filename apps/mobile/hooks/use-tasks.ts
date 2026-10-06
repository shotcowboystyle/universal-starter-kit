import type { UpdateTaskInput } from '@repo/store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { taskApi } from '@/lib/api/task-api';
import { useAuthStore } from '@/stores/auth';

export const TASK_KEYS = {
  all: ['tasks'] as const,
  lists: () => [...TASK_KEYS.all, 'list'] as const,
  list: (filters: { project?: string; assignee?: string } = {}) =>
    [
      ...TASK_KEYS.lists(),
      ...(filters.project !== undefined && filters.project !== '' ? [{ project: filters.project }] : []),
      ...(filters.assignee !== undefined && filters.assignee !== '' ? [{ assignee: filters.assignee }] : []),
    ] as const,
  details: () => [...TASK_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...TASK_KEYS.details(), id] as const,
};

export const useTasks = (projectId?: string, assigneeId?: string) =>
  useQuery({
    queryKey: TASK_KEYS.list({ project: projectId, assignee: assigneeId }),
    queryFn: async () => await taskApi.getTasks(projectId, assigneeId),
    enabled: (projectId !== undefined && projectId !== '') || (assigneeId !== undefined && assigneeId !== ''),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });

export const useTask = (taskId?: string) =>
  useQuery({
    queryKey: TASK_KEYS.detail(taskId ?? ''),
    queryFn: async () => await taskApi.getTaskById(taskId ?? ''),
    enabled: taskId !== undefined && taskId !== '',
  });

export const useCreateTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taskApi.createTask,
    onSuccess: (newTask) => {
      void queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ project: newTask.project }) });
      if (newTask.assignee != null) {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- API returns either a populated user or its id string
        const assigneeId = typeof newTask.assignee === 'string' ? newTask.assignee : newTask.assignee._id;
        void queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ assignee: assigneeId }) });
      }
    },
  });
};

export const useUpdateTask = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Omit<UpdateTaskInput, 'lastModifier'>) => {
      if (user?._id === undefined || user._id === '') {
        throw new Error('User must be authenticated');
      }
      return await taskApi.updateTask(id, { ...updates, lastModifier: user._id });
    },
    onSuccess: (updatedTask) => {
      void queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(updatedTask._id) });
      void queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ project: updatedTask.project }) });
    },
  });
};

export const useDeleteTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: taskApi.deleteTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TASK_KEYS.lists() });
    },
  });
};

export const useMoveTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      projectId,
      orderInProject,
    }: {
      taskId: string;
      projectId: string;
      orderInProject: number;
    }) => await taskApi.moveTask(taskId, projectId, orderInProject),
    onSuccess: (updatedTask) => {
      void queryClient.invalidateQueries({ queryKey: TASK_KEYS.lists() });
      void queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(updatedTask._id) });
    },
  });
};
