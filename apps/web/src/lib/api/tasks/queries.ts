import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Task, TaskStatus } from '@/types/db-interface';
import type { UpdateTaskInput } from '@/types/task-api';
import { TASK_KEYS } from '@/types/task-api';

import { taskApi } from '../task-api';

const hasValue = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== '';

const toAssigneeId = (assignee?: string | { _id: string }) =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the string | { _id } union
  typeof assignee === 'string' ? assignee : assignee?._id;

const buildAssignee = (previousAssignee: Task['assignee'], assigneeId: string): NonNullable<Task['assignee']> =>
  // Same assignee keeps the existing user info; otherwise use placeholders until the next fetch fills them in
  previousAssignee !== undefined && previousAssignee._id === assigneeId
    ? { ...previousAssignee }
    : { _id: assigneeId, name: 'Loading...', email: 'loading@example.com' };

export const useTasks = (projectId?: string, assigneeId?: string) =>
  useQuery<Task[]>({
    queryKey: TASK_KEYS.list({
      project: projectId,
      assignee: assigneeId,
    }),
    queryFn: async () => await taskApi.getTasks(projectId, assigneeId),
    enabled: hasValue(projectId) || hasValue(assigneeId),
    // Ensure we always get fresh data when the component mounts
    staleTime: 0,
    // 5 minutes
    gcTime: 5 * 60 * 1000,
  });

interface UseTaskOptions {
  enabled?: boolean;
  retry?: boolean | ((failureCount: number, error: Error) => boolean);
}

export const useTask = (taskId?: string, options: UseTaskOptions = {}) => {
  const { enabled = true, retry } = options;

  return useQuery({
    queryKey: TASK_KEYS.detail(taskId ?? ''),
    queryFn: async () => await taskApi.getTaskById(taskId ?? ''),
    enabled: hasValue(taskId) && enabled,
    retry:
      retry ??
      ((failureCount: number, error: Error) => {
        // SAFETY: HTTP clients attach an optional `response` to the thrown error; every property is optional-chained
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Error has no `response` in its type
        if ((error as { response?: { status?: number } }).response?.status === 404) {
          return false;
        }
        return failureCount < 3;
      }),
  });
};

export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      status?: TaskStatus;
      dueDate?: Date;
      board: string;
      project: string;
      assignee?: string | { _id: string };
      orderInProject?: number;
    }) => {
      // Ensure assignee is a string (user ID)
      const assigneeId = toAssigneeId(input.assignee);
      return await taskApi.createTask({
        title: input.title,
        description: input.description,
        status: input.status,
        dueDate: input.dueDate,
        board: input.board,
        project: input.project,
        assignee: assigneeId,
        orderInProject: input.orderInProject,
      });
    },
    onSuccess: (variables) => {
      // Invalidate the tasks list query to refetch
      void queryClient.invalidateQueries({
        queryKey: TASK_KEYS.list({ project: variables.project }),
      });

      // Also invalidate the assignee's tasks if applicable
      const assigneeId = toAssigneeId(variables.assignee);

      if (hasValue(assigneeId)) {
        void queryClient.invalidateQueries({
          queryKey: TASK_KEYS.list({ assignee: assigneeId }),
        });
      }
    },
  });
};

export const useUpdateTask = () => {
  const queryClient = useQueryClient();
  // Get the current user's ID from the workspace store
  const userId = useWorkspaceStore((state: { userId: string | null }) => state.userId);

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Omit<UpdateTaskInput, 'assigneeId' | 'lastModifier'> & {
        assigneeId?: string | null;
      }) => {
      if (!hasValue(userId)) {
        throw new Error('User must be authenticated to update a task');
      }

      // Create a clean update object with only the fields we want to send
      const apiUpdates: UpdateTaskInput = {
        // Use the current user's ID as the lastModifier
        lastModifier: userId,
      };

      // Only include fields that are defined in the updates
      if (updates.title !== undefined) {
        apiUpdates.title = updates.title;
      }
      if (updates.description !== undefined) {
        apiUpdates.description = updates.description;
      }
      if (updates.status !== undefined) {
        apiUpdates.status = updates.status;
      }
      if (updates.dueDate !== undefined) {
        apiUpdates.dueDate = updates.dueDate;
      }

      // Handle assigneeId separately to ensure it's not sent as undefined
      if ('assigneeId' in updates) {
        apiUpdates.assigneeId = updates.assigneeId ?? null;
      }

      return await taskApi.updateTask(id, apiUpdates);
    },

    // Optimistic updates
    onMutate: async (updatedTask) => {
      const taskId = updatedTask.id;
      const taskQueryKey = TASK_KEYS.detail(taskId);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: taskQueryKey });

      // Snapshot the previous values
      const previousTask = queryClient.getQueryData<Task>(taskQueryKey);

      // Optimistically update to the new value
      if (previousTask) {
        // Create a clean update object with only the fields that were actually updated
        const updateFields: Partial<Task> = {};

        // Only include fields that were actually provided in the update
        if ('title' in updatedTask) {
          updateFields.title = updatedTask.title;
        }
        if ('description' in updatedTask) {
          updateFields.description = updatedTask.description;
        }
        if ('status' in updatedTask) {
          updateFields.status = updatedTask.status;
        }
        if ('dueDate' in updatedTask) {
          updateFields.dueDate = updatedTask.dueDate;
        }

        // Handle assignee update - we need to include all required UserInfo fields
        if ('assigneeId' in updatedTask) {
          const { assigneeId } = updatedTask;
          updateFields.assignee = hasValue(assigneeId) ? buildAssignee(previousTask.assignee, assigneeId) : undefined;
        }

        const newTask = {
          ...previousTask,
          ...updateFields,
          updatedAt: new Date().toISOString(),
          // Ensure _id is always set
          _id: taskId,
        };

        // Update the task in the cache
        queryClient.setQueryData(taskQueryKey, newTask);

        // Also update the task in any lists it might be in
        queryClient.setQueriesData({ queryKey: TASK_KEYS.lists() }, (old: Task[] | undefined) => {
          if (!old) {
            return old;
          }
          return old.map((task) => (task._id === taskId ? { ...task, ...updateFields } : task));
        });
      }

      return { previousTask };
    },

    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (_err, updatedTask, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(TASK_KEYS.detail(updatedTask.id), context.previousTask);
      }
    },

    // Always refetch after error or success to ensure consistency
    onSettled: (_data, _error, variables) => {
      const taskId = variables.id;
      // Invalidate both the specific task and any lists that might contain it
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: TASK_KEYS.detail(taskId),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: TASK_KEYS.lists(),
          refetchType: 'active',
        }),
      ]);
    },
  });
};

export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      await taskApi.deleteTask(taskId);
    },
    onMutate: async (taskId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: TASK_KEYS.lists() });
      await queryClient.cancelQueries({ queryKey: TASK_KEYS.detail(taskId) });

      // Get the task that's being deleted to know its project and order
      const taskToDelete = queryClient.getQueryData<Task>(TASK_KEYS.detail(taskId));

      // Snapshot the previous values
      const previousTasks = queryClient.getQueryData(TASK_KEYS.lists());
      const previousTask = queryClient.getQueryData(TASK_KEYS.detail(taskId));

      // Optimistically update the task list
      if (taskToDelete) {
        queryClient.setQueriesData({ queryKey: TASK_KEYS.lists() }, (old: Task[] | undefined) => {
          if (!old) {
            return old;
          }

          // Filter out the deleted task and update orders for remaining tasks
          const remaining: Task[] = [];
          for (const task of old) {
            if (task._id === taskId) {
              continue;
            }
            // If task is in the same project and has higher order, decrease it by 1
            if (
              task.project === taskToDelete.project &&
              task.orderInProject !== undefined &&
              taskToDelete.orderInProject !== undefined &&
              task.orderInProject > taskToDelete.orderInProject
            ) {
              remaining.push({ ...task, orderInProject: task.orderInProject - 1 });
            } else {
              remaining.push(task);
            }
          }
          return remaining;
        });
      } else {
        // Fallback: just remove the task if we don't have its details
        queryClient.setQueriesData({ queryKey: TASK_KEYS.lists() }, (old: Task[] | undefined) => {
          if (!old) {
            return old;
          }
          return old.filter((task) => task._id !== taskId);
        });
      }

      // Remove the task from the cache
      queryClient.removeQueries({ queryKey: TASK_KEYS.detail(taskId) });

      return { previousTasks, previousTask, taskToDelete };
    },

    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (_err, taskId, context) => {
      if (context?.previousTasks != null) {
        queryClient.setQueryData(TASK_KEYS.lists(), context.previousTasks);
      }
      if (context?.previousTask != null) {
        queryClient.setQueryData(TASK_KEYS.detail(taskId), context.previousTask);
      }
    },

    // Always refetch after error or success to ensure data consistency
    onSettled: (_data, _error, taskId, context) => {
      // If we have the deleted task info, invalidate queries for that specific project
      if (hasValue(context?.taskToDelete?.project)) {
        void queryClient.invalidateQueries({
          queryKey: TASK_KEYS.list({ project: context.taskToDelete.project }),
          refetchType: 'active',
        });
      }

      // Also invalidate general task lists and the specific task
      void queryClient.invalidateQueries({
        queryKey: TASK_KEYS.lists(),
        refetchType: 'active',
      });
      void queryClient.invalidateQueries({
        queryKey: TASK_KEYS.detail(taskId),
        refetchType: 'all',
      });
    },
  });
};
