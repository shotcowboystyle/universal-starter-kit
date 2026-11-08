/**
 * Bubble menu shown when cursor is on a link.
 * Displays the URL with options to visit, edit, or unlink.
 */

import { ArrowSquareOutIcon, LinkBreakIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';

import { ToolbarButton } from './ToolbarButton';

export interface LinkBubbleProps {
  editor: Editor | null;
}

/** The current link mark's href, or null when it has none */
const linkHref = (editor: Editor): string | null => {
  // SAFETY: the link mark schema declares `href` as a string or null.
  const { href } = editor.getAttributes('link') as { href?: string | null };
  return href ?? null;
};

const openLink = (editor: Editor) => {
  const href = linkHref(editor);
  if (href !== null && href !== '') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
};

export const LinkBubble = ({ editor }: LinkBubbleProps) => {
  const { knobProps } = useResolvedKnobs();
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState('');

  const handleEdit = useCallback(() => {
    if (!editor) {
      return;
    }
    setEditUrl(linkHref(editor) ?? '');
    setEditing(true);
  }, [editor]);

  const handleSave = useCallback(() => {
    if (!editor) {
      return;
    }
    const trimmed = editUrl.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    }
    setEditing(false);
  }, [editor, editUrl]);

  const handleUnlink = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEditing(false);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      className="rt-bubble-menu"
      shouldShow={({ editor: e }) => e.isActive('link')}>
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
            <Input
              size="$2"
              placeholder="https://example.com"
              value={editUrl}
              onChangeText={setEditUrl}
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
                aria-label={t('Save link')}>
                {t('Save')}
              </Button>
            </XStack>
          </YStack>
        ) : (
          <>
            <Text
              fontSize={12}
              color="$blue10"
              maxWidth={200}
              numberOfLines={1}
              cursor="pointer"
              onPress={() => {
                openLink(editor);
              }}>
              {linkHref(editor) ?? t('No URL')}
            </Text>
            <ToolbarButton
              onPress={() => {
                openLink(editor);
              }}
              aria-label={t('Open link')}
              tooltip={t('Open link')}>
              <ArrowSquareOutIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              onPress={handleEdit}
              aria-label={t('Edit link')}
              tooltip={t('Edit link')}>
              <PencilSimpleIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              onPress={handleUnlink}
              aria-label={t('Remove link')}
              tooltip={t('Unlink')}>
              <LinkBreakIcon size={14} />
            </ToolbarButton>
          </>
        )}
      </XStack>
    </BubbleMenu>
  );
};
