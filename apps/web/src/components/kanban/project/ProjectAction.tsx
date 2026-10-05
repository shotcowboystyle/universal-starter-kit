'use client';

import { Button, ConfirmDialog, Dialog, DialogContent, DialogOverlay, DropdownMenu, XStack } from '@repo/ui';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useDeleteProject, useUpdateProject } from '@/lib/api/projects/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { projectSchema } from '@/types/projectForm';

import { ProjectForm } from './ProjectForm';

interface ProjectActionsProps {
  id: string;
  title: string;
  description?: string;
  ownerId: string; // Add ownerId to check permissions
}

type ProjectFormData = z.infer<typeof projectSchema>;

export function ProjectActions({ id, title, description, ownerId }: ProjectActionsProps) {
  // Check if current user is the project owner
  const { userId } = useWorkspaceStore();
  const isOwner = userId === ownerId;
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [editEnable, setEditEnable] = React.useState(false);
  const updateProject = useWorkspaceStore((state) => state.updateProject);
  const removeProject = useWorkspaceStore((state) => state.removeProject);
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();

  const t = useTranslations('kanban.project');
  const tKanban = useTranslations('kanban');

  async function onSubmit(values: ProjectFormData) {
    if (!userId) {
      toast.error(t('userNotAuthenticated'));
      return;
    }

    try {
      await updateProject(
        id,
        values.title,
        values.description ?? undefined, // Convert null to undefined
        async (id, data) => {
          const updateData = {
            id,
            title: data.title,
            description: data.description || null,
            owner: userId,
          };

          return updateProjectMutation.mutateAsync(updateData);
        },
      );
      toast.success(t('updateSuccess'));
      setEditEnable(false);
    } catch (error) {
      toast.error(t('updateFailed', { error: (error as Error).message }));
    }
  }

  async function onConfirmDelete() {
    try {
      await removeProject(id, async (projectId) => deleteProjectMutation.mutateAsync(projectId));
      toast.success(t('deleteSuccess', { title }));
    } catch (error) {
      toast.error(t('deleteFailed', { error: (error as Error).message }));
    }
  }

  return (
    <>
      <Dialog modal open={editEnable} onOpenChange={setEditEnable}>
        <Dialog.Portal>
          <DialogOverlay key="overlay" />
          <DialogContent key="content" maxWidth={480} width="90%" testID="edit-project-dialog">
            <Dialog.Title size="$7">{t('editProjectTitle')}</Dialog.Title>
            <ProjectForm onSubmit={onSubmit} defaultValues={{ title, description }}>
              <XStack justifyContent="flex-end" gap="$2">
                <Dialog.Close asChild>
                  <Button outlined>{t('cancel')}</Button>
                </Dialog.Close>
                <Button accent action="submit" testID="save-project-button">
                  {t('save')}
                </Button>
              </XStack>
            </ProjectForm>
          </DialogContent>
        </Dialog.Portal>
      </Dialog>

      <DropdownMenu placement="bottom-end">
        <DropdownMenu.Trigger asChild>
          <Button
            chromeless
            size="$3"
            icon={MoreHorizontal}
            testID="project-option-button"
            aria-label={`${title} actions`}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item
            testID="edit-project-button"
            disabled={!isOwner}
            disabledReason={tKanban('noPermission')}
            onSelect={() => {
              setEditEnable(true);
            }}>
            {t('edit')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            destructive
            testID="delete-project-button"
            disabled={!isOwner}
            disabledReason={tKanban('noPermission')}
            onSelect={() => {
              setShowDeleteDialog(true);
            }}>
            {t('delete')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        destructive
        title={t('confirmDeleteTitle', { title })}
        body={t('confirmDeleteDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
