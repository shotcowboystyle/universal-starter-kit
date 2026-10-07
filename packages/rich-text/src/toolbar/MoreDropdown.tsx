/**
 * "More" overflow dropdown for less-frequently-used toolbar actions.
 * Groups: Subscript, Superscript | Alignment | Horizontal Rule, Clear Formatting
 */

import { DropdownMenu } from '@repo/ui';
import { DotsThreeIcon } from '@phosphor-icons/react';
import type React from 'react';
import { useRef, useState } from 'react';

import { isCommandInCapabilities } from '../editor/capabilities';
import { t } from '../shared/t';
import type { EditorCapabilities, EditorCommand, EditorState, RichEditorRef } from '../types';

import {
  SubscriptIcon,
  SuperscriptIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  HorizontalRuleIcon,
  ClearFormattingIcon,
} from './icons';
import { SHORTCUTS } from './shortcuts';
import { ToolbarButton } from './ToolbarButton';

export interface MoreDropdownProps {
  editorRef: React.RefObject<RichEditorRef | null>;
  state: EditorState;
  /** Capability surface — markdown drops sub/superscript and alignment */
  capabilities?: EditorCapabilities;
  disabled?: boolean;
}

interface MoreItem {
  /** Lazy so t() resolves at render time, not module import */
  label: () => string;
  command: EditorCommand;
  payload?: any;
  icon: React.FC;
  isActive?: (state: EditorState) => boolean;
}

const INLINE_ITEMS: MoreItem[] = [
  {
    label: () => SHORTCUTS.subscript,
    command: 'subscript',
    icon: SubscriptIcon,
    isActive: (s) => s.isSubscript,
  },
  {
    label: () => SHORTCUTS.superscript,
    command: 'superscript',
    icon: SuperscriptIcon,
    isActive: (s) => s.isSuperscript,
  },
];

const ALIGN_ITEMS: MoreItem[] = [
  {
    label: () => SHORTCUTS.alignLeft,
    command: 'alignLeft',
    icon: AlignLeftIcon,
    isActive: (s) => s.textAlign === 'left',
  },
  {
    label: () => SHORTCUTS.alignCenter,
    command: 'alignCenter',
    icon: AlignCenterIcon,
    isActive: (s) => s.textAlign === 'center',
  },
  {
    label: () => SHORTCUTS.alignRight,
    command: 'alignRight',
    icon: AlignRightIcon,
    isActive: (s) => s.textAlign === 'right',
  },
  {
    label: () => SHORTCUTS.alignJustify,
    command: 'alignJustify',
    icon: AlignJustifyIcon,
    isActive: (s) => s.textAlign === 'justify',
  },
];

const BLOCK_ITEMS: MoreItem[] = [
  {
    label: () => SHORTCUTS.horizontalRule,
    command: 'horizontalRule',
    icon: HorizontalRuleIcon,
  },
  {
    label: () => SHORTCUTS.clearFormatting,
    command: 'clearFormatting',
    icon: ClearFormattingIcon,
  },
];

function MoreIcon() {
  // LC-16: shared phosphor glyph (same as every other overflow trigger).
  return (
    <DotsThreeIcon
      size={16}
      weight="bold"
    />
  );
}

function ItemSection({
  items,
  state,
  onSelect,
}: {
  items: MoreItem[];
  state: EditorState;
  onSelect: (command: EditorCommand, payload?: any) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const label = item.label();
        return (
          <DropdownMenu.Item
            key={item.command}
            icon={<Icon />}
            // Toggle-style rows keep the menu open (only hr/clear close it,
            // handled by the parent's onSelect).
            closeOnSelect={false}
            backgroundColor={item.isActive?.(state) ? '$color4' : undefined}
            aria-label={label}
            onSelect={() => {
              onSelect(item.command, item.payload);
            }}>
            {label}
          </DropdownMenu.Item>
        );
      })}
    </>
  );
}

export function MoreDropdown({ editorRef, state, capabilities = 'full', disabled }: MoreDropdownProps) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef(false);

  const handleSelect = (command: EditorCommand, payload?: any) => {
    editorRef.current?.executeCommand(command, payload);
    if (command === 'horizontalRule' || command === 'clearFormatting') {
      selectedRef.current = true;
      setOpen(false);
    }
  };

  // Sections whose commands markdown cannot express disappear whole (LC-52)
  const inlineItems = INLINE_ITEMS.filter((item) => isCommandInCapabilities(item.command, capabilities));
  const alignItems = ALIGN_ITEMS.filter((item) => isCommandInCapabilities(item.command, capabilities));

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start">
      <DropdownMenu.Trigger asChild>
        <ToolbarButton
          disabled={disabled}
          onPress={() => {
            setOpen(true);
          }}
          aria-label={t('More formatting options')}
          tooltip={t('More')}>
          <MoreIcon />
        </ToolbarButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        minWidth={200}
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
        {inlineItems.length > 0 && (
          <>
            <ItemSection
              items={inlineItems}
              state={state}
              onSelect={handleSelect}
            />
            <DropdownMenu.Separator />
          </>
        )}
        {alignItems.length > 0 && (
          <>
            <ItemSection
              items={alignItems}
              state={state}
              onSelect={handleSelect}
            />
            <DropdownMenu.Separator />
          </>
        )}
        <ItemSection
          items={BLOCK_ITEMS}
          state={state}
          onSelect={handleSelect}
        />
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
