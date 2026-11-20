/**
 * Bubble menu shown when an image node is selected.
 * Provides options to update alt text or remove the image.
 */

import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';

import { ToolbarButton } from './ToolbarButton';

export interface ImageBubbleProps {
  editor: Editor | null;
}

export const ImageBubble = ({ editor }: ImageBubbleProps) => {
  const { knobProps } = useResolvedKnobs();
  const [editing, setEditing] = useState(false);
  const [altText, setAltText] = useState('');

  const handleEdit = useCallback(() => {
    if (!editor) {
      return;
    }
    // SAFETY: the image node schema declares `alt` as a string or null.
    const { alt } = editor.getAttributes('image') as { alt?: string | null };
    setAltText(alt ?? '');
    setEditing(true);
  }, [editor]);

  const handleSave = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().updateAttributes('image', { alt: altText }).run();
    setEditing(false);
  }, [editor, altText]);

  const handleDelete = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().deleteSelection().run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      className="rt-bubble-menu"
      shouldShow={({ editor: e }) => e.isActive('image')}>
      <XStack
        backgroundColor="$background"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={knobProps.borderRadius.borderRadius}
        padding="$1.5"
        gap="$1.5"
        alignItems="center"
        elevation={knobProps.elevation}>
        {editing ? (
          <YStack gap="$1.5">
            <Text
              fontSize={12}
              fontWeight="600">
              {t('Alt text')}
            </Text>
            <Input
              size="$2"
              placeholder={t('Describe this image...')}
              value={altText}
              onChangeText={setAltText}
              onSubmitEditing={handleSave}
              autoFocus
              minWidth={220}
            />
            <XStack
              gap="$1"
              justifyContent="flex-end">
              <Button
                size="$2"
                onPress={() => {
                  setEditing(false);
                }}
                aria-label={t('Cancel')}>
                {t('Cancel')}
              </Button>
              <Button
                size="$2"
                theme="active"
                onPress={handleSave}
                aria-label={t('Save alt text')}>
                {t('Save')}
              </Button>
            </XStack>
          </YStack>
        ) : (
          <>
            <Text
              fontSize={12}
              color="$color10"
              maxWidth={200}
              numberOfLines={1}>
              {editor.getAttributes('image').alt ?? t('No alt text')}
            </Text>
            <ToolbarButton
              onPress={handleEdit}
              aria-label={t('Edit alt text')}
              tooltip={t('Edit alt text')}>
              <PencilSimpleIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              onPress={handleDelete}
              aria-label={t('Delete image')}
              tooltip={t('Delete image')}>
              <TrashIcon size={14} />
            </ToolbarButton>
          </>
        )}
      </XStack>
    </BubbleMenu>
  );
};
