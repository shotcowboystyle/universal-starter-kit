'use client';

import { Button, Dialog, DialogContent, DialogOverlay } from '@repo/ui';
import { useTranslations } from 'next-intl';
import React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { TaskForm } from '@/components/kanban/task/TaskForm';
import { useCreateTask } from '@/lib/api/tasks/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { TaskFormSchema } from '@/types/taskForm';

export interface NewTaskDialogProps {
  projectId: string;
}

export default function NewTaskDialog({ projectId }: NewTaskDialogProps) {
  const addTask = useWorkspaceStore((state) => state.addTask);
  const [addTaskOpen, setAddTaskOpen] = React.useState(false);
  const t = useTranslations('kanban.task');
  const { mutateAsync: createTask } = useCreateTask();

  const handleSubmit = async (values: z.infer<typeof TaskFormSchema>) => {
    // Get the current project to calculate the next orderInProject
    const { projects } = useWorkspaceStore.getState();
    const currentProject = projects.find((p) => p._id === projectId);
    const currentTasks = currentProject?.tasks || [];

    // Calculate the next orderInProject
    const lastOrder = currentTasks.reduce((max, task) => Math.max(max, task.orderInProject ?? -1), -1);
    const nextOrder = lastOrder + 1;

    await addTask(
      projectId,
      values.title,
      values.status!,
      createTask,
      values.description ?? '',
      values.dueDate ?? undefined,
      values.assignee?._id ?? undefined,
      nextOrder,
    );
    toast.success(t('createSuccess', { title: values.title }));
    setAddTaskOpen(false);
  };

  return (
    <Dialog modal open={addTaskOpen} onOpenChange={setAddTaskOpen}>
      <Dialog.Trigger asChild>
        <Button accent size="$4" width="100%" marginVertical="$4" testID="new-task-trigger">
          {t('addNewTask')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <DialogOverlay key="overlay" />
        <DialogContent key="content" width="90%" maxWidth={448} testID="new-task-dialog">
          <Dialog.Title size="$7">{t('addNewTaskTitle')}</Dialog.Title>
          <Dialog.Description>{t('addNewTaskDescription')}</Dialog.Description>
          <TaskForm
            onSubmit={handleSubmit}
            submitLabel={t('createTask')}
            onCancel={() => {
              setAddTaskOpen(false);
            }}
          />
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}
