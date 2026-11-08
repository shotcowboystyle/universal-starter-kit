/**
 * Image dialog popover for inserting images via URL
 */

import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { PopoverContent } from '@repo/ui';
import { useCallback, useState } from 'react';
import { Input, Popover, Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';
import type { RichEditorRef } from '../types';

import { ImageIcon } from './icons';
import { SHORTCUTS } from './shortcuts';
import { ToolbarButton } from './ToolbarButton';

// ===========================================================================
// Types
// ===========================================================================

export interface ImageDialogProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Whether the dialog is disabled */
  disabled?: boolean;
}

// ===========================================================================
// ImageDialog
// ===========================================================================

export const ImageDialog = ({ editorRef, disabled }: ImageDialogProps) => {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const handleInsert = useCallback(() => {
    const trimmed = imageUrl.trim();
    if (trimmed) {
      editorRef.current?.executeCommand('image', { src: trimmed });
      setImageUrl('');
      setOpen(false);
    }
  }, [imageUrl, editorRef]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <Popover.Trigger asChild>
        <ToolbarButton
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t('Insert Image')}
          tooltip={SHORTCUTS.image}>
          <ImageIcon />
        </ToolbarButton>
      </Popover.Trigger>
      <PopoverContent {...knobProps.panelPadding}>
        <Popover.Arrow
          borderColor="$borderColor"
          backgroundColor="$background"
        />
        <YStack
          gap="$2"
          minWidth={250}>
          <Text
            fontSize={knobProps.sizeToken}
            fontWeight="600">
            {t('Insert Image')}
          </Text>
          <Input
            size="$3"
            placeholder="https://example.com/image.jpg"
            value={imageUrl}
            onChangeText={setImageUrl}
            onSubmitEditing={handleInsert}
            autoFocus
          />
          <XStack
            gap="$2"
            justifyContent="flex-end">
            <Button
              size="$2"
              theme="active"
              onPress={handleInsert}
              disabled={!imageUrl.trim()}
              aria-label={t('Insert image')}>
              {t('Insert')}
            </Button>
          </XStack>
        </YStack>
      </PopoverContent>
    </Popover>
  );
};
