/**
 * Bubble menu shown when cursor is inside a table.
 * Provides row/column add/delete and table management actions.
 */

import { ColumnsPlusRightIcon, RowsPlusBottomIcon, TrashIcon } from '@phosphor-icons/react';
import { OVERLAY_ATTACH_GAP, useResolvedKnobs } from '@repo/theme';
import { PopoverContent } from '@repo/ui';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useState } from 'react';
import { Popover, Text, XStack, YStack } from 'tamagui';

import { getBlockVirtualElement } from '../editor/block-anchor';
import { t } from '../shared/t';
import { DropdownMenuItemFrame, ToolbarSeparatorFrame } from '../styled';
import type { EditorCapabilities } from '../types';

import { ToolbarButton, ToolbarDropdownButton } from './ToolbarButton';

interface TableAction {
  /** Stable identifier (capability filtering) */
  id: string;
  label: () => string;
  action: (editor: Editor) => void;
}

const DELETE_TABLE = 'Delete table';

const ROW_ACTIONS: TableAction[] = [
  {
    id: 'addRowBefore',
    label: () => t('Add row above'),
    action: (e) => {
      e.chain().focus().addRowBefore().run();
    },
  },
  {
    id: 'addRowAfter',
    label: () => t('Add row below'),
    action: (e) => {
      e.chain().focus().addRowAfter().run();
    },
  },
  {
    id: 'deleteRow',
    label: () => t('Delete row'),
    action: (e) => {
      e.chain().focus().deleteRow().run();
    },
  },
];

const COL_ACTIONS: TableAction[] = [
  {
    id: 'addColumnBefore',
    label: () => t('Add column before'),
    action: (e) => {
      e.chain().focus().addColumnBefore().run();
    },
  },
  {
    id: 'addColumnAfter',
    label: () => t('Add column after'),
    action: (e) => {
      e.chain().focus().addColumnAfter().run();
    },
  },
  {
    id: 'deleteColumn',
    label: () => t('Delete column'),
    action: (e) => {
      e.chain().focus().deleteColumn().run();
    },
  },
];

const TABLE_ACTIONS: TableAction[] = [
  {
    id: 'toggleHeaderRow',
    label: () => t('Toggle header row'),
    action: (e) => {
      e.chain().focus().toggleHeaderRow().run();
    },
  },
  {
    id: 'mergeCells',
    label: () => t('Merge cells'),
    action: (e) => {
      e.chain().focus().mergeCells().run();
    },
  },
  {
    id: 'splitCell',
    label: () => t('Split cell'),
    action: (e) => {
      e.chain().focus().splitCell().run();
    },
  },
  {
    id: 'deleteTable',
    label: () => t(DELETE_TABLE),
    action: (e) => {
      e.chain().focus().deleteTable().run();
    },
  },
];

/** GFM pipe tables are simple grids — merge/split have no markdown form (LC-52) */
const MARKDOWN_EXCLUDED_TABLE_ACTIONS = new Set(['mergeCells', 'splitCell']);

export interface TableBubbleProps {
  editor: Editor | null;
  /** Capability surface — markdown drops merge/split (default "full") */
  capabilities?: EditorCapabilities;
}

export const TableBubble = ({ editor, capabilities = 'full' }: TableBubbleProps) => {
  const { knobProps } = useResolvedKnobs();
  const [menuOpen, setMenuOpen] = useState(false);

  const tableActions =
    capabilities === 'markdown'
      ? TABLE_ACTIONS.filter((a) => !MARKDOWN_EXCLUDED_TABLE_ACTIONS.has(a.id))
      : TABLE_ACTIONS;

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      className="rt-bubble-menu"
      shouldShow={({ editor: e }) => e.isActive('table')}
      // Anchor to the table rect (not the caret) so the bubble never covers
      // the first row and holds still while typing in cells (LC-06 spirit:
      // chrome must not sit on top of the content being edited).
      getReferencedVirtualElement={() => getBlockVirtualElement(editor, 'table')}
      options={{ placement: 'top-start', offset: OVERLAY_ATTACH_GAP }}>
      <XStack
        backgroundColor="$background"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius={knobProps.borderRadius.borderRadius}
        padding="$1"
        gap="$1"
        alignItems="center"
        elevation={knobProps.elevation}>
        <ToolbarButton
          onPress={() => {
            editor.chain().focus().addRowAfter().run();
          }}
          aria-label={t('Add row')}
          tooltip={t('Add row below')}>
          <RowsPlusBottomIcon size={14} />
        </ToolbarButton>

        <ToolbarButton
          onPress={() => {
            editor.chain().focus().addColumnAfter().run();
          }}
          aria-label={t('Add column')}
          tooltip={t('Add column after')}>
          <ColumnsPlusRightIcon size={14} />
        </ToolbarButton>

        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          placement="bottom">
          <Popover.Trigger asChild>
            <ToolbarDropdownButton
              onPress={() => {
                setMenuOpen(true);
              }}
              aria-label={t('Table options')}>
              <Text fontSize={12}>{t('Table')}</Text>
            </ToolbarDropdownButton>
          </Popover.Trigger>
          <PopoverContent
            // SP-EDGE: container owns only its border — items own all padding.
            padding={0}
            overflow="hidden">
            <YStack
              gap="$0.5"
              minWidth={180}>
              {ROW_ACTIONS.map((a) => {
                const label = a.label();
                return (
                  <DropdownMenuItemFrame
                    key={label}
                    onPress={() => {
                      a.action(editor);
                      setMenuOpen(false);
                    }}
                    aria-label={label}>
                    <Text fontSize={13}>{label}</Text>
                  </DropdownMenuItemFrame>
                );
              })}
              <XStack paddingVertical="$0.5">
                <ToolbarSeparatorFrame
                  vertical={false}
                  width="100%"
                  height={1}
                  marginHorizontal={0}
                />
              </XStack>
              {COL_ACTIONS.map((a) => {
                const label = a.label();
                return (
                  <DropdownMenuItemFrame
                    key={label}
                    onPress={() => {
                      a.action(editor);
                      setMenuOpen(false);
                    }}
                    aria-label={label}>
                    <Text fontSize={13}>{label}</Text>
                  </DropdownMenuItemFrame>
                );
              })}
              <XStack paddingVertical="$0.5">
                <ToolbarSeparatorFrame
                  vertical={false}
                  width="100%"
                  height={1}
                  marginHorizontal={0}
                />
              </XStack>
              {tableActions.map((a) => {
                const label = a.label();
                return (
                  <DropdownMenuItemFrame
                    key={label}
                    onPress={() => {
                      a.action(editor);
                      setMenuOpen(false);
                    }}
                    aria-label={label}>
                    <Text fontSize={13}>{label}</Text>
                  </DropdownMenuItemFrame>
                );
              })}
            </YStack>
          </PopoverContent>
        </Popover>

        <ToolbarButton
          onPress={() => {
            editor.chain().focus().deleteTable().run();
          }}
          aria-label={t(DELETE_TABLE)}
          tooltip={t(DELETE_TABLE)}>
          <TrashIcon size={14} />
        </ToolbarButton>
      </XStack>
    </BubbleMenu>
  );
};
