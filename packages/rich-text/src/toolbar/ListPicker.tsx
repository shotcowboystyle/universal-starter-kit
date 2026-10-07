/**
 * List picker dropdown for selecting list types
 */

import { DropdownMenu } from '@repo/ui';
import { useRef, useState } from 'react';

import { t } from '../shared/t';
import type { EditorCommand, EditorState, RichEditorRef } from '../types';

import { BulletListIcon, OrderedListIcon, TaskListIcon } from './icons';
import { ToolbarDropdownButton } from './ToolbarButton';

// ===========================================================================
// Types
// ===========================================================================

export interface ListPickerProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state: EditorState;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

// ===========================================================================
// List Options
// ===========================================================================

interface ListOption {
  /** Lazy so t() resolves at render time, not module import */
  label: () => string;
  command: EditorCommand;
  stateKey: keyof EditorState;
  icon: React.FC;
}

const LIST_OPTIONS: ListOption[] = [
  {
    label: () => t('Bullet List'),
    command: 'bulletList',
    stateKey: 'isBulletList',
    icon: BulletListIcon,
  },
  {
    label: () => t('Ordered List'),
    command: 'orderedList',
    stateKey: 'isOrderedList',
    icon: OrderedListIcon,
  },
  {
    label: () => t('Task List'),
    command: 'taskList',
    stateKey: 'isTaskList',
    icon: TaskListIcon,
  },
];

// ===========================================================================
// ListPicker
// ===========================================================================

function getActiveListIcon(state: EditorState) {
  if (state.isOrderedList) {
    return OrderedListIcon;
  }
  if (state.isTaskList) {
    return TaskListIcon;
  }
  return BulletListIcon;
}

function isAnyListActive(state: EditorState): boolean {
  return state.isBulletList || state.isOrderedList || state.isTaskList;
}

export function ListPicker({ editorRef, state, disabled }: ListPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef(false);
  const ActiveIcon = getActiveListIcon(state);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <DropdownMenu.Trigger asChild>
        <ToolbarDropdownButton
          active={isAnyListActive(state)}
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t('Lists')}>
          <ActiveIcon />
        </ToolbarDropdownButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        minWidth={150}
        // Toolbar menus must not steal focus back to the trigger on
        // select-close: focus returns to the editor so typing continues.
        // Escape still restores the trigger via the menu's own close().
        onCloseAutoFocus={(event) => {
          if (selectedRef.current) {
            event.preventDefault();
            selectedRef.current = false;
            editorRef.current?.focus();
          }
        }}>
        {LIST_OPTIONS.map((option) => {
          const Icon = option.icon;
          const label = option.label();
          return (
            <DropdownMenu.Item
              key={option.command}
              icon={<Icon />}
              closeOnSelect={false}
              backgroundColor={state[option.stateKey] ? '$color4' : undefined}
              aria-label={label}
              onSelect={() => {
                selectedRef.current = true;
                editorRef.current?.executeCommand(option.command);
                setOpen(false);
              }}>
              {label}
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
