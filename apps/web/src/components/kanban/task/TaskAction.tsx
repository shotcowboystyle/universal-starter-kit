'use client';

import type { Task } from '@repo/store';
import { Button, ConfirmDialog, Dialog, DialogContent, DialogOverlay, DropdownMenu, Text } from '@repo/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';

import { TaskForm } from '@/components/kanban/task/TaskForm';
import { useDeleteTask, useTask, useUpdateTask } from '@/lib/api/tasks/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { TaskStatus } from '@/types/db-interface';
import { TASK_KEYS } from '@/types/task-api';
import type { TaskFormSchema } from '@/types/task-form';

interface TaskActionsProps {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string;
  dueDate?: Date | null;
  assigneeId?: string;
  projectId: string;
  boardId: string;
  onUpdate?: () => void;
}

interface TaskScope {
  queryClient: QueryClient;
  id: string;
  boardId: string;
  projectId: string;
}

const RELATED_ROOT_KEYS = new Set<unknown>(['tasks', 'board', 'project']);

const emptyToNull = (value?: string | null) => (value === undefined || value === null || value === '' ? null : value);

const relatedKeys = ({ id, boardId, projectId }: TaskScope): QueryKey[] => [
  TASK_KEYS.detail(id),
  TASK_KEYS.lists(),
  ['board', boardId, 'tasks'],
  ['project', projectId, 'tasks'],
];

const cancelAndRemoveQueries = (queryClient: QueryClient, queryKey: QueryKey) => {
  void queryClient.cancelQueries({ queryKey });
  queryClient.removeQueries({ queryKey });
};

const removeTaskFromQueries = (queryClient: QueryClient, queryKey: QueryKey, taskId: string) => {
  queryClient.setQueryData<Task[] | undefined>(queryKey, (old) => {
    if (!Array.isArray(old)) {
      return old;
    }
    return old.filter((item) => item._id !== taskId);
  });
};

const refreshAfterUpdate = async (scope: TaskScope, onUpdate?: () => void) => {
  const { queryClient, id } = scope;
  // Invalidate the specific task and task lists
  void queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(id), refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: TASK_KEYS.lists(), refetchType: 'active' });

  const keys = relatedKeys(scope);
  await Promise.all(
    keys.map(async (queryKey) => {
      await queryClient.invalidateQueries({ queryKey });
    }),
  );
  await Promise.all(
    keys.map(async (queryKey) => {
      await queryClient.refetchQueries({ queryKey });
    }),
  );

  // Call parent component callback
  if (onUpdate) {
    onUpdate();
  }

  // Force re-render
  for (const { queryKey } of queryClient.getQueryCache().findAll()) {
    if (Array.isArray(queryKey) && (queryKey[0] === 'board' || queryKey[0] === 'project' || queryKey[0] === 'tasks')) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }
};

const removeTaskOptimistically = (scope: TaskScope) => {
  const { queryClient, id, boardId, projectId } = scope;
  try {
    // Cancel any ongoing requests for this task
    void queryClient.cancelQueries({ queryKey: TASK_KEYS.detail(id) });

    removeTaskFromQueries(queryClient, TASK_KEYS.lists(), id);
    removeTaskFromQueries(queryClient, ['board', boardId, 'tasks'], id);
    removeTaskFromQueries(queryClient, ['project', projectId, 'tasks'], id);

    cancelAndRemoveQueries(queryClient, TASK_KEYS.detail(id));
    // Also remove any other potential queries that might contain this task
    cancelAndRemoveQueries(queryClient, ['task', id, 'details']);
  } catch (error) {
    console.error('Error during optimistic update:', error);
  }
};

const cleanupAfterDelete = async (scope: TaskScope, onUpdate?: () => void) => {
  const { queryClient, id, boardId, projectId } = scope;
  try {
    // Invalidate all related queries to ensure data consistency
    await Promise.all(
      [TASK_KEYS.lists(), ['board', boardId, 'tasks'], ['project', projectId, 'tasks']].map(async (queryKey) => {
        await queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      }),
    );

    // Ensure task detail queries are removed
    cancelAndRemoveQueries(queryClient, TASK_KEYS.detail(id));
    cancelAndRemoveQueries(queryClient, ['task', id, 'details']);

    // Call parent's update callback if provided
    if (onUpdate) {
      try {
        onUpdate();
      } catch (updateError) {
        console.error('Error in onUpdate callback:', updateError);
      }
    }
  } catch (cleanupError) {
    console.error('Error during cleanup after successful delete:', cleanupError);
  }
};

const restoreAfterDeleteError = (scope: TaskScope, previousTask: Task | undefined, refresh: () => void) => {
  const { queryClient, id } = scope;
  // Restore the task data
  if (previousTask) {
    queryClient.setQueryData(TASK_KEYS.detail(id), previousTask);
  }

  // Invalidate all relevant queries to restore correct state
  try {
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const [head] = query.queryKey;
        const firstKey: unknown = Array.isArray(head) ? head[0] : head;
        return RELATED_ROOT_KEYS.has(firstKey);
      },
      refetchType: 'active',
    });
  } catch (invalidateError) {
    console.error('Error during query invalidation:', invalidateError);
    refresh();
  }
};

interface DefaultValuesInput extends Omit<TaskActionsProps, 'id' | 'onUpdate'> {
  task: Task | undefined;
}

// Prepare default values for the form
const buildDefaultValues = ({
  title,
  description,
  status,
  dueDate,
  assigneeId,
  projectId,
  boardId,
  task,
}: DefaultValuesInput) => {
  const hasAssignee = assigneeId !== undefined && assigneeId !== '';
  // Prefer the fetched task's assignee so the picker can show the name immediately
  const fetchedAssignee = task?.assignee?._id === assigneeId ? task?.assignee : undefined;
  return {
    title,
    description: description ?? '',
    status,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    assignee: hasAssignee
      ? { _id: assigneeId, name: fetchedAssignee?.name ?? null, email: fetchedAssignee?.email }
      : undefined,
    projectId,
    boardId,
  };
};

export const TaskActions = ({
  id,
  title,
  description,
  dueDate,
  assigneeId,
  status,
  projectId,
  boardId,
  onUpdate,
}: TaskActionsProps) => {
  // State for dialogs and component state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  // Translations
  const t = useTranslations('kanban.task');
  const tKanban = useTranslations('kanban');
  const router = useRouter();

  // Fetch task data to ensure we have the latest
  const { data: task, isLoading: isLoadingTask } = useTask(id, {
    // Disable the query if the task is marked as deleted
    enabled: !isDeleted,
    // Let the hook handle the retry logic; don't retry if the task is not found (404)
    retry: true,
  });

  // Query and mutation hooks
  const queryClient = useQueryClient();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();

  // Get current user ID from workspace store
  const { userId } = useWorkspaceStore();

  // Determine permissions based on user role
  const isCreator = task?.creator?._id === userId;
  const isAssignee = task?.assignee?._id === userId;

  // Permission logic:
  // - Creator can edit and delete
  // - Assignee can only edit
  // - Others can't do anything
  const canEdit = isCreator || isAssignee;
  const canDelete = isCreator;

  const defaultValues = buildDefaultValues({
    title,
    description,
    status,
    dueDate,
    assigneeId,
    projectId,
    boardId,
    task,
  });

  const taskScope: TaskScope = { queryClient, id, boardId, projectId };

  // Handle form submission
  const handleSubmit = async (values: z.infer<typeof TaskFormSchema>) => {
    try {
      // The current user ID is now handled by the useUpdateTask hook
      await updateTaskMutation.mutateAsync(
        {
          id,
          title: values.title,
          description: emptyToNull(values.description),
          status: values.status,
          dueDate: values.dueDate ?? null,
          assigneeId: emptyToNull(values.assignee?._id),
          // lastModifier is now handled by the useUpdateTask hook
        },
        {
          onSuccess: () => {
            toast.success(t('updateSuccess', { title: values.title }));
            setIsEditDialogOpen(false);
            void refreshAfterUpdate(taskScope, onUpdate);
          },
          onError: (error) => {
            console.error('Error updating task:', error);
            toast.error(t('updateError'));
          },
        },
      );
    } catch (error) {
      console.error('Error in task update handler:', error);
      toast.error(t('updateError'));
    }
  };

  const handleDeleteSuccess = async () => {
    await cleanupAfterDelete(taskScope, onUpdate);
    toast.success(t('deleteSuccess'));
  };

  // Handle task deletion
  const handleDelete = async () => {
    try {
      // Save current task data for rollback
      const previousTask = queryClient.getQueryData<Task>(TASK_KEYS.detail(id));

      removeTaskOptimistically(taskScope);

      // Mark as deleted immediately to prevent any further fetches
      setIsDeleted(true);

      await deleteTaskMutation.mutateAsync(id, {
        onSuccess: () => {
          void handleDeleteSuccess();
        },
        onError: (error) => {
          console.error('Error in delete mutation:', error);
          restoreAfterDeleteError(taskScope, previousTask, () => {
            router.refresh();
          });
          toast.error(t('deleteError'));
        },
      });
    } catch (error) {
      console.error('Error in delete handler:', error);
      toast.error(t('deleteError'));
    }
    setShowDeleteDialog(false);
  };

  // Loading and error states
  if (isLoadingTask && !isDeleted) {
    return (
      <Text
        paddingHorizontal="$2"
        paddingVertical="$1.5">
        Loading...
      </Text>
    );
  }

  // If task is deleted or not found, and we're not in a loading state,
  // return null to unmount the component
  if (!task || isDeleted) {
    return null;
  }

  return (
    <>
      <Dialog
        modal
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleted) {
            setIsEditDialogOpen(open);
          }
        }}>
        <Dialog.Portal>
          <DialogOverlay key="overlay" />
          <DialogContent
            key="content"
            width="90%"
            maxWidth={448}
            testID="edit-task-dialog">
            <Dialog.Title size="$7">{t('editTaskTitle')}</Dialog.Title>
            <Dialog.Description>{t('editTaskDescription')}</Dialog.Description>
            <TaskForm
              defaultValues={defaultValues}
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsEditDialogOpen(false);
              }}
              submitLabel={t('updateTask')}
            />
          </DialogContent>
        </Dialog.Portal>
      </Dialog>

      <DropdownMenu
        placement="bottom-end"
        items={[
          {
            label: t('edit'),
            disabled: !canEdit,
            disabledReason: tKanban('noPermission'),
            onSelect: () => {
              setIsEditDialogOpen(true);
            },
          },
          { separator: true },
          {
            label: t('delete'),
            destructive: true,
            disabled: !canDelete,
            disabledReason: tKanban('noPermission'),
            onSelect: () => {
              setShowDeleteDialog(true);
            },
          },
        ]}>
        <Button
          chromeless
          size="$2"
          icon={Ellipsis}
          aria-label={t('actions')}
          testID="task-actions-trigger"
        />
      </DropdownMenu>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        destructive
        title={t('confirmDeleteTitle', { title })}
        body={t('confirmDeleteDescription', { title })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </>
  );
};
