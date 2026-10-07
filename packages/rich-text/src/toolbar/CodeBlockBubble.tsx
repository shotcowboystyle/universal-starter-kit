/**
 * Bubble menu shown when cursor is inside a code block.
 * Provides language selection, copy-to-clipboard, and remove actions.
 */

import { PopoverContent } from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';
import { CheckIcon, CopyIcon, TrashIcon } from '@phosphor-icons/react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, Text, XStack, YStack } from 'tamagui';

import { getBlockVirtualElement } from '../editor/blockAnchor';
import { t } from '../shared/t';
import { DropdownMenuItemFrame } from '../styled';

import { ToolbarButton, ToolbarDropdownButton } from './ToolbarButton';

const LANGUAGES = [
  { value: null, label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'math', label: 'Math (TeX)' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scss', label: 'SCSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'swift', label: 'Swift' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'xml', label: 'XML / HTML' },
  { value: 'yaml', label: 'YAML' },
] as const;

export interface CodeBlockBubbleProps {
  editor: Editor | null;
}

/** Reads the text of the code block the selection sits in */
function getActiveCodeBlockText(editor: Editor): string {
  const { $from } = editor.state.selection;
  for (let { depth } = $from; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'codeBlock') {
      return node.textContent;
    }
  }
  return '';
}

export function CodeBlockBubble({ editor }: CodeBlockBubbleProps) {
  const { knobProps } = useResolvedKnobs();
  const [langOpen, setLangOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const currentLang = editor?.getAttributes('codeBlock')?.language ?? null;
  const rawLabel = LANGUAGES.find((l) => l.value === currentLang)?.label ?? currentLang;
  const currentLabel = currentLang === null ? t('Plain text') : (rawLabel ?? t('Plain text'));

  const setLanguage = useCallback(
    (lang: string | null) => {
      if (!editor) {
        return;
      }
      editor.chain().focus().updateAttributes('codeBlock', { language: lang }).run();
      setLangOpen(false);
    },
    [editor],
  );

  const copyCode = useCallback(async () => {
    if (!editor) {
      return;
    }
    try {
      await navigator.clipboard.writeText(getActiveCodeBlockText(editor));
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.warn('[rich-text] copy failed:', error);
    }
  }, [editor]);

  const removeCodeBlock = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().toggleCodeBlock().run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      className="rt-bubble-menu"
      shouldShow={({ editor: e }) => e.isActive('codeBlock')}
      // Anchor to the <pre> rect (not the caret) so the bubble sits above
      // the block instead of covering its first line, and does not chase
      // the caret while typing.
      getReferencedVirtualElement={() => getBlockVirtualElement(editor, 'codeBlock')}
      options={{ placement: 'top-start', offset: 6 }}>
      <XStack
        backgroundColor="$background"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={knobProps.borderRadius.borderRadius}
        padding="$1"
        gap="$1"
        alignItems="center"
        elevation={knobProps.elevation}>
        <Popover
          open={langOpen}
          onOpenChange={setLangOpen}
          placement="bottom-start">
          <Popover.Trigger asChild>
            <ToolbarDropdownButton
              onPress={() => {
                setLangOpen(true);
              }}
              aria-label={t('Select language')}>
              <Text fontSize={12}>{currentLabel}</Text>
            </ToolbarDropdownButton>
          </Popover.Trigger>
          <PopoverContent
            // SP-EDGE: container owns only its border — items own all padding.
            padding={0}
            overflow="hidden">
            <YStack
              gap="$0.5"
              minWidth={160}
              maxHeight={280}
              overflow="scroll">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItemFrame
                  key={lang.label}
                  active={currentLang === lang.value}
                  onPress={() => {
                    setLanguage(lang.value);
                  }}
                  aria-label={lang.value === null ? t('Plain text') : lang.label}>
                  <Text fontSize={13}>{lang.value === null ? t('Plain text') : lang.label}</Text>
                </DropdownMenuItemFrame>
              ))}
            </YStack>
          </PopoverContent>
        </Popover>

        <ToolbarButton
          onPress={copyCode}
          aria-label={copied ? t('Copied') : t('Copy code')}
          tooltip={copied ? t('Copied') : t('Copy code')}>
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </ToolbarButton>

        <ToolbarButton
          onPress={removeCodeBlock}
          aria-label={t('Remove code block')}
          tooltip={t('Remove code block')}>
          <TrashIcon size={14} />
        </ToolbarButton>
      </XStack>
    </BubbleMenu>
  );
}
