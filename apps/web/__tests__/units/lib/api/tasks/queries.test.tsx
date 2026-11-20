import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { useCreateTask, useDeleteTask, useTask, useTasks, useUpdateTask } from '@/lib/api/tasks/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { TaskStatus } from '@/types/db-interface';
import type { Task } from '@/types/db-interface';
import { TASK_KEYS } from '@/types/task-api';

// Mock taskApi
const taskApiMock = vi.hoisted(() => ({
  getTasks: vi.fn<(...args: unknown[]) => Promise<object>>(),
  getTaskById: vi.fn<(...args: unknown[]) => Promise<object>>(),
  createTask: vi.fn<(...args: unknown[]) => Promise<object>>(),
  updateTask: vi.fn<(...args: unknown[]) => Promise<object>>(),
  deleteTask: vi.fn<(...args: unknown[]) => Promise<object>>(),
}));

vi.mock(import('@/lib/api/task-api'), () => ({
  taskApi: taskApiMock as never,
}));

// Mock workspace store
vi.mock(import('@/stores/workspace-store'), () => ({
  useWorkspaceStore: vi.fn<() => string>() as never,
}));

describe('Task Query Hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
    (useWorkspaceStore as unknown as Mock).mockReturnValue('user-123');
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe(useTasks, () => {
    it('should fetch tasks by projectId', async () => {
      const mockTasks = [
        { _id: '1', title: 'Task 1', project: 'project1' },
        { _id: '2', title: 'Task 2', project: 'project1' },
      ];
      taskApiMock.getTasks.mockResolvedValue(mockTasks);

      const { result } = renderHook(() => useTasks('project1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toStrictEqual(mockTasks);
      expect(taskApiMock.getTasks).toHaveBeenCalledWith('project1', undefined);
    });

    it('should fetch tasks by assigneeId', async () => {
      const mockTasks = [{ _id: '1', title: 'Task 1', assignee: 'user1' }];
      taskApiMock.getTasks.mockResolvedValue(mockTasks);

      const { result } = renderHook(() => useTasks(undefined, 'user1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toStrictEqual(mockTasks);
      expect(taskApiMock.getTasks).toHaveBeenCalledWith(undefined, 'user1');
    });

    it('should not fetch when both ids are undefined', () => {
      const { result } = renderHook(() => useTasks(), { wrapper });

      expect(result.current.data).toBeUndefined();
      expect(taskApiMock.getTasks).not.toHaveBeenCalled();
    });
  });

  describe(useTask, () => {
    it('should fetch single task', async () => {
      const mockTask = { _id: '1', title: 'Task 1', project: 'project1' };
      taskApiMock.getTaskById.mockResolvedValue(mockTask);

      const { result } = renderHook(() => useTask('1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toStrictEqual(mockTask);
      expect(taskApiMock.getTaskById).toHaveBeenCalledWith('1');
    });

    it('should not fetch when taskId is undefined', () => {
      const { result } = renderHook(() => useTask(), { wrapper });

      expect(result.current.data).toBeUndefined();
      expect(taskApiMock.getTaskById).not.toHaveBeenCalled();
    });

    it('should respect enabled option', () => {
      const { result } = renderHook(() => useTask('1', { enabled: false }), { wrapper });

      expect(result.current.data).toBeUndefined();
      expect(taskApiMock.getTaskById).not.toHaveBeenCalled();
    });

    it('should not retry on 404 error', async () => {
      const mockError = { response: { status: 404 } };
      taskApiMock.getTaskById.mockRejectedValue(mockError);

      const { result } = renderHook(() => useTask('1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(taskApiMock.getTaskById).toHaveBeenCalledOnce();
    });

    it('should retry on non-404 errors', async () => {
      // Create a new query client that allows retries
      const retryQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            // Retry 2 times = 3 total attempts
            retry: 2,
            // Fast retries for testing
            retryDelay: 1,
          },
        },
      });

      const retryWrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={retryQueryClient}>{children}</QueryClientProvider>
      );

      const mockError = { response: { status: 500 } };
      taskApiMock.getTaskById.mockRejectedValue(mockError);

      const { result } = renderHook(() => useTask('1'), { wrapper: retryWrapper });

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        // Increase timeout for retries
        { timeout: 10_000 },
      );

      // With retryDelay: 1, it should retry quickly. Check it was called at least 3 times
      expect(taskApiMock.getTaskById).toHaveBeenCalledWith('1');
      expect(taskApiMock.getTaskById.mock.calls.length).toBeGreaterThanOrEqual(3);
    }, 10_000);
  });

  describe(useCreateTask, () => {
    it('should create task with string assignee', async () => {
      const newTask = {
        _id: '3',
        title: 'New Task',
        project: 'project1',
        assignee: 'user1',
      };
      taskApiMock.createTask.mockResolvedValue(newTask);

      const { result } = renderHook(() => useCreateTask(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync({
          title: 'New Task',
          board: 'board1',
          project: 'project1',
          assignee: 'user1',
        });
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: TASK_KEYS.list({ project: 'project1' }),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: TASK_KEYS.list({ assignee: 'user1' }),
        });
      });

      expect(taskApiMock.createTask).toHaveBeenCalledWith({
        title: 'New Task',
        board: 'board1',
        project: 'project1',
        assignee: 'user1',
      });
    });

    it('should create task with object assignee', async () => {
      const newTask = {
        _id: '3',
        title: 'New Task',
        project: 'project1',
        assignee: { _id: 'user1' },
      };
      taskApiMock.createTask.mockResolvedValue(newTask);

      const { result } = renderHook(() => useCreateTask(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          title: 'New Task',
          board: 'board1',
          project: 'project1',
          assignee: { _id: 'user1' },
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(taskApiMock.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          assignee: 'user1',
        }),
      );
    });
  });

  describe(useUpdateTask, () => {
    it('should throw error if user is not authenticated', async () => {
      (useWorkspaceStore as unknown as Mock).mockReturnValue(null);

      const { result } = renderHook(() => useUpdateTask(), { wrapper });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ id: '1', title: 'Test' });
        }),
      ).rejects.toThrow('User must be authenticated to update a task');
    });

    it('should update task title', async () => {
      const updatedTask = { _id: '1', title: 'Updated Task', project: 'project1' };
      taskApiMock.updateTask.mockResolvedValue(updatedTask);

      // Set up query data for optimistic update
      queryClient.setQueryData<Task>(TASK_KEYS.detail('1'), {
        _id: '1',
        title: 'Old Task',
        project: 'project1',
        status: TaskStatus.TODO,
        creator: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
        lastModifier: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
        board: 'board1',
        createdAt: new Date(),
        updatedAt: new Date(),
        orderInProject: 0,
      });

      const { result } = renderHook(() => useUpdateTask(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: '1', title: 'Updated Task' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(taskApiMock.updateTask).toHaveBeenCalledWith('1', {
        title: 'Updated Task',
        lastModifier: 'user-123',
      });
    });

    it('should update task with multiple fields', async () => {
      const updatedTask = {
        _id: '1',
        title: 'Updated Task',
        description: 'New description',
        status: TaskStatus.IN_PROGRESS,
        project: 'project1',
      };
      taskApiMock.updateTask.mockResolvedValue(updatedTask);

      const { result } = renderHook(() => useUpdateTask(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          id: '1',
          title: 'Updated Task',
          description: 'New description',
          status: TaskStatus.IN_PROGRESS,
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(taskApiMock.updateTask).toHaveBeenCalledWith('1', {
        title: 'Updated Task',
        description: 'New description',
        status: TaskStatus.IN_PROGRESS,
        lastModifier: 'user-123',
      });
    });

    it('should handle assignee update to null', async () => {
      const updatedTask = { _id: '1', title: 'Task', project: 'project1' };
      taskApiMock.updateTask.mockResolvedValue(updatedTask);

      const { result } = renderHook(() => useUpdateTask(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          id: '1',
          assigneeId: null,
        });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(taskApiMock.updateTask).toHaveBeenCalledWith('1', {
        assigneeId: null,
        lastModifier: 'user-123',
      });
    });
  });

  describe(useDeleteTask, () => {
    it('should delete task and update task list', async () => {
      const taskToDelete: Task = {
        _id: '2',
        title: 'Task to Delete',
        project: 'project1',
        status: TaskStatus.TODO,
        creator: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
        lastModifier: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
        board: 'board1',
        createdAt: new Date(),
        updatedAt: new Date(),
        orderInProject: 1,
      };

      // Set up query data
      queryClient.setQueryData<Task>(TASK_KEYS.detail('2'), taskToDelete);
      queryClient.setQueryData<Task[]>(TASK_KEYS.lists(), [
        {
          _id: '1',
          title: 'Task 1',
          project: 'project1',
          status: TaskStatus.TODO,
          creator: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
          lastModifier: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
          board: 'board1',
          createdAt: new Date(),
          updatedAt: new Date(),
          orderInProject: 0,
        },
        taskToDelete,
        {
          _id: '3',
          title: 'Task 3',
          project: 'project1',
          status: TaskStatus.TODO,
          creator: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
          lastModifier: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
          board: 'board1',
          createdAt: new Date(),
          updatedAt: new Date(),
          orderInProject: 2,
        },
      ]);
      taskApiMock.deleteTask.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useDeleteTask(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync('2');
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: TASK_KEYS.list({ project: 'project1' }),
          refetchType: 'active',
        });
      });

      expect(taskApiMock.deleteTask).toHaveBeenCalledWith('2');
    });

    it('should handle deletion without task details', async () => {
      queryClient.setQueryData<Task[]>(TASK_KEYS.lists(), [
        {
          _id: '1',
          title: 'Task 1',
          project: 'project1',
          status: TaskStatus.TODO,
          creator: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
          lastModifier: { _id: 'user1', name: 'User 1', email: 'user1@example.com' },
          board: 'board1',
          createdAt: new Date(),
          updatedAt: new Date(),
          orderInProject: 0,
        },
      ]);
      taskApiMock.deleteTask.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useDeleteTask(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('unknown-task');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(taskApiMock.deleteTask).toHaveBeenCalledWith('unknown-task');
    });
  });
});
