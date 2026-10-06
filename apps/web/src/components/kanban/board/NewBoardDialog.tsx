'use client';

import { Button, Dialog, DialogContent, DialogOverlay, XStack } from '@repo/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useBoards } from '@/hooks/useBoards';
import { useRouter } from '@/i18n/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { boardSchema } from '@/types/boardForm';

import { BoardForm } from './BoardForm';

interface NewBoardDialogProps {
  children: React.ReactNode;
}

type BoardFormData = z.infer<typeof boardSchema>;

export default function NewBoardDialog({ children }: NewBoardDialogProps) {
  const [open, setOpen] = useState(false);
  const { addBoard } = useWorkspaceStore();
  const { refresh } = useBoards();
  const router = useRouter();
  const t = useTranslations('kanban.actions');

  const handleSubmit = async (data: BoardFormData) => {
    try {
      const boardId = await addBoard(data.title, data.description);
      toast.success(t('boardCreatedSuccess'));
      setOpen(false);
      await refresh();
      router.push(`/boards/${boardId}`);
    } catch (error) {
      console.error(error);
      toast.error(t('boardCreateFailed'));
    }
  };

  return (
    <Dialog modal open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <DialogOverlay key="overlay" />
        <DialogContent key="content" maxWidth={480} width="90%" testID="new-board-dialog">
          <Dialog.Title size="$7" testID="new-board-dialog-title">
            {t('newBoardTitle')}
          </Dialog.Title>
          <Dialog.Description>{t('newBoardDescription')}</Dialog.Description>
          <BoardForm onSubmit={handleSubmit}>
            <XStack justifyContent="flex-end" gap="$2">
              <Dialog.Close asChild>
                <Button chromeless testID="cancel-button">
                  {t('cancel')}
                </Button>
              </Dialog.Close>
              <Button accent action="submit" testID="create-button">
                {t('create')}
              </Button>
            </XStack>
          </BoardForm>
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}
