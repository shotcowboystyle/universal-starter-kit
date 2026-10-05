'use client';

import { Button, ConfirmDialog, Dialog, DialogContent, DialogOverlay, DropdownMenu, XStack } from '@repo/ui';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useRouter } from '@/i18n/navigation';
import { useDeleteBoard, useUpdateBoard } from '@/lib/api/boards/queries';
import { boardSchema } from '@/types/boardForm';
import { Board } from '@/types/dbInterface';

import { BoardForm } from './BoardForm';

interface BoardActionsProps {
  board: Board;
  onDelete?: () => void;
  /** Custom menu trigger. Defaults to a ghost "…" icon button. */
  children?: React.ReactElement;
}

export function BoardActions({ board, onDelete, children }: BoardActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [editEnable, setEditEnable] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const deleteBoard = useDeleteBoard();
  const updateBoard = useUpdateBoard();

  const router = useRouter();
  const t = useTranslations('kanban.actions');

  const onSubmit = async (values: z.infer<typeof boardSchema>) => {
    try {
      if (!board?._id) {
        throw new Error('Board ID is missing');
      }

      setIsSubmitting(true);
      await updateBoard.mutateAsync(
        { id: board._id, ...values },
        {
          onSuccess: () => {
            setEditEnable(false);
            toast.success(t('boardUpdated', { title: board.title }));
            // The query invalidation is handled by the mutation's onSuccess
            router.refresh();
          },
          onError: (error: Error) => {
            console.error('Error updating board:', error);

            if (error.message.includes('not found')) {
              // If board is not found, refresh the board list
              toast.error('Board not found. The board may have been deleted.');
              router.refresh();
            } else {
              toast.error(`Failed to update board: ${error.message}`);
            }
          },
        },
      );
    } catch (error) {
      console.error('Error updating board:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('not found')) {
        toast.error('Board not found. The board may have been deleted.');
        router.refresh();
      } else {
        toast.error(`Failed to update board: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      const currentPath = window.location.pathname;

      if (currentPath.includes('/board/')) {
        router.push('/boards');
        setTimeout(() => {
          deleteBoard.mutate(board._id);
        }, 0);
        return;
      }

      await deleteBoard.mutateAsync(board._id, {
        onSuccess: () => {
          toast.success(t('boardDeleted'));
          onDelete?.();

          if (window.location.pathname.endsWith('/boards')) {
            router.refresh();
          } else {
            router.push('/boards');
          }
        },
        onError: (error: Error) => {
          console.error('Failed to delete board:', error);
          toast.error(t('boardDeleteFailed', { error: error.message }));
        },
      });
    } catch (error) {
      console.error('Error in handleDelete:', error);
      toast.error(
        t('boardDeleteFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  return (
    <>
      <Dialog modal open={editEnable} onOpenChange={setEditEnable}>
        <Dialog.Portal>
          <DialogOverlay key="overlay" />
          <DialogContent key="content" maxWidth={448} width="90%" testID="edit-board-dialog">
            <Dialog.Title size="$7">{t('editBoardTitle')}</Dialog.Title>
            <Dialog.Description>{t('editBoardDescription')}</Dialog.Description>
            <BoardForm
              defaultValues={{
                title: board.title,
                description: board.description || '',
              }}
              onSubmit={onSubmit}>
              <XStack justifyContent="flex-end" gap="$2">
                <Dialog.Close asChild>
                  <Button outlined>{t('cancel')}</Button>
                </Dialog.Close>
                <Button accent action="submit" loading={isSubmitting} testID="save-board-button">
                  {isSubmitting ? t('saving') : t('saveChanges')}
                </Button>
              </XStack>
            </BoardForm>
          </DialogContent>
        </Dialog.Portal>
      </Dialog>

      <DropdownMenu placement="bottom-end">
        <DropdownMenu.Trigger asChild>
          {children ?? (
            <Button
              chromeless
              size="$3"
              icon={MoreHorizontal}
              testID="board-option-button"
              aria-label={`${board.title} actions`}
            />
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item
            testID="edit-board-button"
            onSelect={() => {
              setEditEnable(true);
            }}>
            {t('edit')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            destructive
            testID="delete-board-button"
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
        title={t('confirmDeleteTitle', { title: board.title })}
        body={t('confirmDeleteDescription')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={handleDelete}
      />
    </>
  );
}
