/**
 * Heading picker dropdown for selecting heading levels
 */

import { DropdownMenu } from '@repo/ui';
import { useRef, useState } from 'react';
import { Text } from 'tamagui';

import { t } from '../shared/t';
import type { EditorCommand, EditorState, RichEditorRef } from '../types';

import { ToolbarDropdownButton } from './ToolbarButton';

// ===========================================================================
// Types
// ===========================================================================

export interface HeadingPickerProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state: EditorState;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

// ===========================================================================
// Heading Options
// ===========================================================================

interface HeadingOption {
  label: string;
  /** Lazy so t() resolves at render time, not module import */
  description: () => string;
  command: EditorCommand;
  stateKey: keyof EditorState;
  fontSize: string;
  fontWeight: string;
}

const HEADING_OPTIONS: HeadingOption[] = [
  {
    label: 'H1',
    description: () => t('Heading 1'),
    command: 'heading1',
    stateKey: 'isHeading1',
    fontSize: '$5',
    fontWeight: '700',
  },
  {
    label: 'H2',
    description: () => t('Heading 2'),
    command: 'heading2',
    stateKey: 'isHeading2',
    fontSize: '$4',
    fontWeight: '600',
  },
  {
    label: 'H3',
    description: () => t('Heading 3'),
    command: 'heading3',
    stateKey: 'isHeading3',
    fontSize: '$3',
    fontWeight: '600',
  },
  {
    label: 'H4',
    description: () => t('Heading 4'),
    command: 'heading4',
    stateKey: 'isHeading4',
    fontSize: '$2',
    fontWeight: '600',
  },
  {
    label: 'H5',
    description: () => t('Heading 5'),
    command: 'heading5',
    stateKey: 'isHeading5',
    fontSize: '$1',
    fontWeight: '600',
  },
  {
    label: 'H6',
    description: () => t('Heading 6'),
    command: 'heading6',
    stateKey: 'isHeading6',
    fontSize: '$1',
    fontWeight: '600',
  },
  {
    label: 'P',
    description: () => t('Paragraph'),
    command: 'paragraph',
    stateKey: 'isParagraph',
    fontSize: '$3',
    fontWeight: '400',
  },
];

// ===========================================================================
// HeadingPicker
// ===========================================================================

function getActiveHeadingLabel(state: EditorState): string {
  if (state.isHeading1) {
    return 'H1';
  }
  if (state.isHeading2) {
    return 'H2';
  }
  if (state.isHeading3) {
    return 'H3';
  }
  if (state.isHeading4) {
    return 'H4';
  }
  if (state.isHeading5) {
    return 'H5';
  }
  if (state.isHeading6) {
    return 'H6';
  }
  return 'H';
}

function isAnyHeadingActive(state: EditorState): boolean {
  return (
    state.isHeading1 || state.isHeading2 || state.isHeading3 || state.isHeading4 || state.isHeading5 || state.isHeading6
  );
}

export function HeadingPicker({ editorRef, state, disabled }: HeadingPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef(false);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <DropdownMenu.Trigger asChild>
        <ToolbarDropdownButton
          active={isAnyHeadingActive(state)}
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t('Heading')}>
          <Text fontWeight="600">{getActiveHeadingLabel(state)}</Text>
        </ToolbarDropdownButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        minWidth={200}
        // Toolbar menus must not steal focus back to the trigger on
        // select-close: the user expects to keep typing, so focus returns
        // to the editor. Escape still restores the trigger via the menu's
        // own close().
        onCloseAutoFocus={(event) => {
          if (selectedRef.current) {
            event.preventDefault();
            selectedRef.current = false;
            editorRef.current?.focus();
          }
        }}>
        {HEADING_OPTIONS.map((option) => {
          const description = option.description();
          return (
            <DropdownMenu.Item
              key={option.command}
              closeOnSelect={false}
              backgroundColor={state[option.stateKey] ? '$color4' : undefined}
              aria-label={description}
              onSelect={() => {
                selectedRef.current = true;
                editorRef.current?.executeCommand(option.command);
                setOpen(false);
              }}>
              <Text
                fontWeight={option.fontWeight as any}
                fontSize={option.fontSize as any}>
                {option.label}
              </Text>
              <Text color="$color11"> {description}</Text>
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
