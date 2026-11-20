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
  stateKey: 'isBulletList' | 'isOrderedList' | 'isTaskList';
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

const renderActiveListIcon = (state: EditorState) => {
  if (state.isOrderedList) {
    return <OrderedListIcon />;
  }
  if (state.isTaskList) {
    return <TaskListIcon />;
  }
  return <BulletListIcon />;
};

const isAnyListActive = (state: EditorState): boolean => state.isBulletList || state.isOrderedList || state.isTaskList;

export const ListPicker = ({ editorRef, state, disabled }: ListPickerProps) => {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef(false);

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
          {renderActiveListIcon(state)}
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
};
