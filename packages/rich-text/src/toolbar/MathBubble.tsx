/**
 * Bubble menu shown when an inline math node is selected.
 * Displays the TeX source with edit (live validation) and remove actions —
 * the editing surface GitLab gives dollar math in its content editor.
 */

import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useEffect, useState } from 'react';
import { Input, Text, XStack, YStack } from 'tamagui';

import { renderKatexHtml } from '../editor/lazy-katex';
import { t } from '../shared/t';

import { ToolbarButton } from './ToolbarButton';

export interface MathBubbleProps {
  editor: Editor | null;
}

export const MathBubble = ({ editor }: MathBubbleProps) => {
  const { knobProps } = useResolvedKnobs();
  const [editing, setEditing] = useState(false);
  const [latex, setLatex] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Live TeX validation while editing (KaTeX is already loaded by the
  // rendered node; the first call lazy-loads it). An empty expression has no
  // error; `handleLatexChange` clears it so the effect never sets state
  // synchronously.
  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      const result = await renderKatexHtml(latex);
      if (!cancelled) {
        setError(result.ok ? null : result.error);
      }
    };
    if (editing && latex.trim() !== '') {
      void validate();
    }
    return () => {
      cancelled = true;
    };
  }, [latex, editing]);

  const handleLatexChange = useCallback((next: string) => {
    setLatex(next);
    if (next.trim() === '') {
      setError(null);
    }
  }, []);

  const handleEdit = useCallback(() => {
    if (!editor) {
      return;
    }
    // SAFETY: the inlineMath node schema declares `latex` as a string.
    const { latex: source } = editor.getAttributes('inlineMath') as { latex?: string | null };
    setLatex(source ?? '');
    setError(null);
    setEditing(true);
  }, [editor]);

  const handleSave = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().updateInlineMath({ latex: latex.trim() }).run();
    setEditing(false);
  }, [editor, latex]);

  const handleRemove = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().deleteSelection().run();
    setEditing(false);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      className="rt-bubble-menu"
      shouldShow={({ editor: e }) => e.isActive('inlineMath')}
      options={{ placement: 'top', offset: 6 }}>
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
              placeholder="x^2 + y^2"
              value={latex}
              onChangeText={handleLatexChange}
              onSubmitEditing={handleSave}
              aria-label={t('TeX expression')}
              autoFocus
              minWidth={220}
              fontFamily="$mono"
            />
            {error !== null && error !== '' ? (
              <Text
                color="$red11"
                fontSize={11}
                maxWidth={260}
                role="alert">
                {error}
              </Text>
            ) : null}
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
                aria-label={t('Save math')}>
                {t('Save')}
              </Button>
            </XStack>
          </YStack>
        ) : (
          <>
            <Text
              fontSize={12}
              fontFamily="$mono"
              maxWidth={220}
              numberOfLines={1}
              color="$color11">
              {editor.getAttributes('inlineMath').latex ?? t('empty')}
            </Text>
            <ToolbarButton
              onPress={handleEdit}
              aria-label={t('Edit math')}
              tooltip={t('Edit math')}>
              <PencilSimpleIcon size={14} />
            </ToolbarButton>
            <ToolbarButton
              onPress={handleRemove}
              aria-label={t('Remove math')}
              tooltip={t('Remove math')}>
              <TrashIcon size={14} />
            </ToolbarButton>
          </>
        )}
      </XStack>
    </BubbleMenu>
  );
};
