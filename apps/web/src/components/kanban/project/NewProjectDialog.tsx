'use client';

import { Button, Dialog, DialogContent, DialogOverlay, XStack } from '@repo/ui';
import { useTranslations } from 'next-intl';
import React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useCreateProject } from '@/lib/api/projects/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { projectSchema } from '@/types/projectForm';

import { ProjectForm } from './ProjectForm';

export interface NewProjectDialogProps {
  onProjectAdd?: (title: string, description?: string) => void;
}

type ProjectFormData = z.infer<typeof projectSchema>;

export default function NewProjectDialog({ onProjectAdd }: NewProjectDialogProps) {
  const addProject = useWorkspaceStore((state) => state.addProject);
  const [isOpen, setIsOpen] = React.useState(false);
  const t = useTranslations('kanban.project');

  const createProjectMutation = useCreateProject();

  // The form lives inside the dialog content, which unmounts on close, so it
  // starts from empty default values on every open (no manual reset needed).
  const handleSubmit = async (data: ProjectFormData) => {
    try {
      const projectId = await addProject(data.title, data.description || '', async (projectData) =>
        createProjectMutation.mutateAsync(projectData),
      );

      if (!projectId) {
        toast.error(t('createFailed'));
        return;
      }

      onProjectAdd?.(data.title, data.description ?? undefined);
      toast.success(t('createSuccess'));
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error(t('createFailed'));
    }
  };

  return (
    <Dialog modal open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <Button outlined width="100%" $md={{ width: 200 }} testID="new-project-trigger">
          {t('addNewProject')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <DialogOverlay key="overlay" />
        <DialogContent key="content" maxWidth={425} width="90%" testID="new-project-dialog">
          <Dialog.Title size="$7">{t('addNewProjectTitle')}</Dialog.Title>
          <Dialog.Description>{t('addNewProjectDescription')}</Dialog.Description>
          <ProjectForm onSubmit={handleSubmit}>
            <XStack justifyContent="flex-end" gap="$2">
              <Dialog.Close asChild>
                <Button chromeless>{t('cancel')}</Button>
              </Dialog.Close>
              <Button accent action="submit" testID="submit-project-button">
                {t('addProject')}
              </Button>
            </XStack>
          </ProjectForm>
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}
