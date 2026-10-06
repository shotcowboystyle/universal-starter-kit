'use client';

import type { Task } from '@repo/store';
import { Button, ConfirmDialog, Dialog, DialogContent, DialogOverlay, DropdownMenu, Text } from '@repo/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { TaskForm } from '@/components/kanban/task/TaskForm';
import { useDeleteTask, useTask, useUpdateTask } from '@/lib/api/tasks/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { TaskStatus } from '@/types/dbInterface';
import { TASK_KEYS } from '@/types/taskApi';
import { TaskFormSchema } from '@/types/taskForm';

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

export function TaskActions({
  id,
  title,
  description,
  dueDate,
  assigneeId,
  status,
  projectId,
  boardId,
  onUpdate,
}: TaskActionsProps) {
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
    // Don't retry if the task is not found (404)
    retry: true, // Let the hook handle the retry logic
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

  // Prepare default values for the form
  const defaultValues = {
    title,
    description: description || '',
    status: status,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    // Prefer the fetched task's assignee so the picker can show the name immediately
    assignee: assigneeId
      ? {
          _id: assigneeId,
          name: task?.assignee?._id === assigneeId ? (task.assignee.name ?? null) : null,
          email: task?.assignee?._id === assigneeId ? task.assignee.email : undefined,
        }
      : undefined,
    projectId,
    boardId,
  };

  // Handle form submission
  const handleSubmit = async (values: z.infer<typeof TaskFormSchema>) => {
    try {
      const { title, description, status, dueDate, assignee } = values;

      // The current user ID is now handled by the useUpdateTask hook

      await updateTaskMutation.mutateAsync(
        {
          id,
          title,
          description: description || null,
          status,
          dueDate: dueDate || null,
          assigneeId: assignee?._id || null,
          // lastModifier is now handled by the useUpdateTask hook
        },
        {
          onSuccess: async (_data) => {
            // Invalidate both the specific task and task lists
            queryClient.invalidateQueries({
              queryKey: TASK_KEYS.detail(id),
              refetchType: 'all',
            });
            queryClient.invalidateQueries({
              queryKey: TASK_KEYS.lists(),
              refetchType: 'active',
            });

            toast.success(t('updateSuccess', { title }));
            setIsEditDialogOpen(false);

            // Invalidate all related queries
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(id) }),
              queryClient.invalidateQueries({ queryKey: TASK_KEYS.lists() }),
              queryClient.invalidateQueries({
                queryKey: ['board', boardId, 'tasks'],
              }),
              queryClient.invalidateQueries({
                queryKey: ['project', projectId, 'tasks'],
              }),
            ]);

            // Refetch all related queries
            const refetchPromises = [
              queryClient.refetchQueries({ queryKey: TASK_KEYS.detail(id) }),
              queryClient.refetchQueries({ queryKey: TASK_KEYS.lists() }),
              queryClient.refetchQueries({
                queryKey: ['board', boardId, 'tasks'],
              }),
              queryClient.refetchQueries({
                queryKey: ['project', projectId, 'tasks'],
              }),
            ];

            await Promise.all(refetchPromises);

            // Call parent component callback
            if (onUpdate) {
              onUpdate();
            }

            // Force re-render
            const queryCache = queryClient.getQueryCache();
            queryCache.findAll().forEach(({ queryKey }) => {
              if (
                Array.isArray(queryKey) &&
                (queryKey[0] === 'board' || queryKey[0] === 'project' || queryKey[0] === 'tasks')
              ) {
                queryClient.invalidateQueries({ queryKey });
              }
            });
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

  // Handle task deletion
  const handleDelete = async () => {
    try {
      // 1. Save current task data for rollback
      const previousTask = queryClient.getQueryData(TASK_KEYS.detail(id));

      // 2. Create a function to safely update queries
      const updateQueries = (queryKey: QueryKey, taskId: string) => {
        queryClient.setQueryData<Task[] | undefined>(queryKey, (old) => {
          if (!old || !Array.isArray(old)) {
            return old;
          }
          return old.filter((task) => task._id !== taskId);
        });
      };

      // 3. Create a function to safely cancel and remove queries
      const cancelAndRemoveQueries = (queryKey: QueryKey) => {
        queryClient.cancelQueries({ queryKey });
        queryClient.removeQueries({ queryKey });
      };

      // 4. Optimistically update all related queries
      try {
        // Cancel any ongoing requests for this task
        queryClient.cancelQueries({ queryKey: TASK_KEYS.detail(id) });

        // Update all list queries
        updateQueries(TASK_KEYS.lists(), id);
        updateQueries(['board', boardId, 'tasks'], id);
        updateQueries(['project', projectId, 'tasks'], id);

        // Remove the task detail query
        cancelAndRemoveQueries(TASK_KEYS.detail(id));

        // Also remove any other potential queries that might contain this task
        cancelAndRemoveQueries(['task', id, 'details']);
      } catch (error) {
        console.error('Error during optimistic update:', error);
      }

      // Mark as deleted immediately to prevent any further fetches
      setIsDeleted(true);

      // 5. Execute the delete mutation
      await deleteTaskMutation.mutateAsync(id, {
        onSuccess: async () => {
          try {
            // Invalidate all related queries to ensure data consistency
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: TASK_KEYS.lists(),
                refetchType: 'active' as const,
              }),
              queryClient.invalidateQueries({
                queryKey: ['board', boardId, 'tasks'],
                refetchType: 'active' as const,
              }),
              queryClient.invalidateQueries({
                queryKey: ['project', projectId, 'tasks'],
                refetchType: 'active' as const,
              }),
            ]);

            // Ensure task detail queries are removed
            cancelAndRemoveQueries(TASK_KEYS.detail(id));
            cancelAndRemoveQueries(['task', id, 'details']);

            // Call parent's update callback if provided
            if (onUpdate) {
              try {
                await onUpdate();
              } catch (updateError) {
                console.error('Error in onUpdate callback:', updateError);
              }
            }

            toast.success(t('deleteSuccess'));
          } catch (cleanupError) {
            console.error('Error during cleanup after successful delete:', cleanupError);
            toast.success(t('deleteSuccess'));
          }
        },
        onError: (error) => {
          console.error('Error in delete mutation:', error);

          // Restore the task data
          if (previousTask) {
            queryClient.setQueryData(TASK_KEYS.detail(id), previousTask);
          }

          // Invalidate all relevant queries to restore correct state
          try {
            queryClient.invalidateQueries({
              predicate: (query) => {
                const queryKey = query.queryKey as readonly (string | readonly string[])[];
                const firstKey = Array.isArray(queryKey[0]) ? queryKey[0][0] : queryKey[0];
                return ['tasks', 'board', 'project'].includes(firstKey as string);
              },
              refetchType: 'active' as const,
            });
          } catch (invalidateError) {
            console.error('Error during query invalidation:', invalidateError);
            router.refresh();
          }

          toast.error(t('deleteError'));
        },
      });
    } catch (error) {
      console.error('Error in delete handler:', error);
      toast.error(t('deleteError'));
    } finally {
      setShowDeleteDialog(false);
    }
  };

  // Loading and error states
  if (isLoadingTask && !isDeleted) {
    return (
      <Text paddingHorizontal="$2" paddingVertical="$1.5">
        Loading...
      </Text>
    );
  }

  if ((!task && !isDeleted) || isDeleted) {
    // If task is deleted or not found, and we're not in a loading state,
    // return null to unmount the component
    return null;
  }

  // If we don't have task data, don't render anything
  if (!task) {
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
          <DialogContent key="content" width="90%" maxWidth={448} testID="edit-task-dialog">
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
            onSelect: () => setIsEditDialogOpen(true),
          },
          { separator: true },
          {
            label: t('delete'),
            destructive: true,
            disabled: !canDelete,
            disabledReason: tKanban('noPermission'),
            onSelect: () => setShowDeleteDialog(true),
          },
        ]}>
        <Button chromeless size="$2" icon={Ellipsis} aria-label={t('actions')} testID="task-actions-trigger" />
      </DropdownMenu>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        destructive
        title={t('confirmDeleteTitle', { title })}
        body={t('confirmDeleteDescription', { title })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={handleDelete}
      />
    </>
  );
}
