import { ConfirmDialog, DropdownMenu } from '@repo/ui';
import { Button, zIndex } from '@repo/forms';
import { useAccentOnSurface, useResolvedKnobs } from '@repo/theme';
import { DotsThreeIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, XStack, isWeb, useMedia } from 'tamagui';

import type { BulkAction } from '../../types';
import { iconSizeForToken } from '../../utils/chromeIcons';
import { withInterp } from '../../utils/withInterp';
import { useDataTableState } from '../DataTable/DataTableStateContext';

export type { BulkAction };

export interface DataTableBulkActionsProps<T = any> {
  selectedItems?: T[];
  onClearSelection?: () => void;
  actions: BulkAction<T>[];
  maxVisibleActions?: number;
  showSelectionCount?: boolean;
  selectionKey?: keyof T;
  /** Sticky edge for the selection bar (house `bulkBarPlacement`). Default top. */
  placement?: 'top' | 'bottom';
}

export function DataTableBulkActions<T = any>(props: DataTableBulkActionsProps<T>) {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values
  // For BulkActions, the table's row selection model provides selected rows
  const selectedItems =
    props.selectedItems ?? (ctx ? (ctx.table.getSelectedRowModel().rows.map((r: any) => r.original) as T[]) : []);

  const onClearSelection =
    props.onClearSelection ??
    (ctx
      ? () => {
          ctx.table.resetRowSelection();
        }
      : () => {});

  const {
    actions,
    maxVisibleActions = 5,
    showSelectionCount = true,
    selectionKey: _selectionKey = 'id' as keyof T,
    placement: placementProp,
  } = props;

  const [confirmAction, setConfirmAction] = useState<BulkAction<T> | null>(null);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // UX-P04 / Axiom 12: the selection count is accent-hued text on the bar
  // surface (page), so it needs the page-readable accent — `$accentColor` (the
  // on-fill foreground) measured 1.88:1 as dark-scheme page text.
  const countColor = useAccentOnSurface();
  const placement = placementProp ?? (knobProps.bulkBarPlacement === 'bottom' ? 'bottom' : 'top');
  // Below $sm the actions do not fit one row beside the count and Clear:
  // the count and Clear share the first line and the actions wrap beneath.
  const { sm } = useMedia();
  const stacked = !sm;

  // DG-TBL-03 scope switch: with page scope, once the visible page is fully
  // selected offer expanding the selection to every matching (filtered) row.
  // The count above always reflects the true selection size across pages.
  // Whether all matching rows are selected is asked of the table directly
  // (getIsAllRowsSelected = all FILTERED rows) — comparing selectedItems.length
  // to matchingCount lies when a stale selection outside the current filter
  // inflates the count.
  const selectAllScope = ctx?.selectAllScope ?? 'page';
  const matchingCount = ctx ? ctx.table.getFilteredRowModel().rows.length : 0;
  const showSelectAllMatching = Boolean(
    ctx &&
    selectAllScope === 'page' &&
    matchingCount > 0 &&
    ctx.table.getIsAllPageRowsSelected() &&
    !ctx.table.getIsAllRowsSelected(),
  );

  // D-15: selection derives from the CORE row model, so it survives filter
  // changes and can include rows the current filter hides. The count stays
  // honest to both the model and the view by annotating the hidden remainder
  // ("N selected (+M filtered out)") instead of silently counting invisible
  // rows or pruning the user's selection. Only computable in context mode —
  // an explicit selectedItems prop carries no filter relationship.
  const filteredOutCount =
    props.selectedItems === undefined && ctx
      ? selectedItems.length - ctx.table.getFilteredSelectedRowModel().rows.length
      : 0;

  const handleExecuteAction = async (action: BulkAction<T>) => {
    // DG-DX-01/02: a bulk destructive action is at least severity medium
    // (bulk hint), and medium+ requires the confirm gate — so destructive
    // actions confirm even without an explicit `requiresConfirmation`.
    if (action.requiresConfirmation || action.variant === 'destructive') {
      setConfirmAction(action);
      return;
    }

    await executeAction(action);
  };

  const executeAction = async (action: BulkAction<T>) => {
    setIsExecuting(action.id);
    try {
      await action.onExecute(selectedItems, onClearSelection);
    } catch (error) {
      console.error('Bulk action failed:', error);
    } finally {
      setIsExecuting(null);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmAction) {
      return;
    }
    const action = confirmAction;
    // The canonical dialog closes on confirm; busy feedback lives on the
    // bulk-bar button (`loading` while executing), mirroring DestructiveAction.
    setConfirmAction(null);
    void executeAction(action);
  };

  const visibleActions = actions.slice(0, maxVisibleActions);
  const overflowActions = actions.slice(maxVisibleActions);

  if (selectedItems.length === 0) {
    return null;
  }

  const summary = (
    <>
      {showSelectionCount && (
        <Text
          {...knobProps.label}
          fontWeight="400"
          color={countColor}>
          {/* D-15: one whole-sentence key per variant (never concatenated
              fragments — word order is locale-owned); withInterp fills the
              params when no i18n instance is mounted (house table pattern). */}
          {filteredOutCount > 0
            ? withInterp(
                t('{{n}} selected (+{{hidden}} filtered out)', {
                  n: selectedItems.length,
                  hidden: filteredOutCount,
                }),
                { n: selectedItems.length, hidden: filteredOutCount },
              )
            : withInterp(t('{{n}} selected', { n: selectedItems.length }), {
                n: selectedItems.length,
              })}
        </Text>
      )}

      {showSelectAllMatching && (
        <Button
          size={knobProps.sizeToken}
          onPress={() => ctx?.table.toggleAllRowsSelected(true)}
          aria-label={`Select all ${matchingCount} matching rows`}
          {...knobProps.borderRadius}>
          {`Select all ${matchingCount}`}
        </Button>
      )}
    </>
  );

  const clearButton = (
    <Button
      size={knobProps.sizeToken}
      onPress={onClearSelection}
      aria-label="Clear selection"
      {...knobProps.borderRadius}>
      Clear
    </Button>
  );

  const actionGroup = (
    <XStack
      {...knobProps.gap}
      flexWrap="wrap"
      {...(stacked ? {} : { flex: 1 })}>
      {visibleActions.map((action) => (
        <Button
          key={action.id}
          size={knobProps.sizeToken}
          error={action.variant === 'destructive'}
          disabled={action.disabled}
          // DG-ST-03: reason renders via the Button explain affordance;
          // executing is derived busy state (spinner), not a bare disable.
          disabledReason={action.disabledReason}
          loading={isExecuting === action.id}
          onPress={async () => handleExecuteAction(action)}
          {...knobProps.borderRadius}>
          {action.label}
        </Button>
      ))}

      {overflowActions.length > 0 && (
        <BulkActionsOverflowMenu
          actions={overflowActions}
          selectedItems={selectedItems}
          onExecuteAction={handleExecuteAction}
          isExecuting={isExecuting}
        />
      )}
    </XStack>
  );

  return (
    <>
      <View
        flexDirection={stacked ? 'column' : 'row'}
        alignItems={stacked ? 'stretch' : 'center'}
        {...knobProps.borderRadius}
        {...knobProps.panelPadding}
        gap="$3"
        backgroundColor="$color2"
        borderColor="$color6"
        // Tamagui turns "sticky" into "absolute" on native, which floats the
        // bar over the first rows; native keeps it in flow instead.
        {...(isWeb
          ? {
              position: 'sticky' as const,
              top: placement === 'top' ? 0 : undefined,
              bottom: placement === 'bottom' ? 0 : undefined,
            }
          : {})}
        zIndex={zIndex.stickyHeader}
        data-bulk-bar-placement={placement}>
        {stacked ? (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            gap="$3">
            {summary}
            {clearButton}
          </XStack>
        ) : (
          summary
        )}
        {actionGroup}
        {stacked ? null : clearButton}
      </View>

      {/* LC-16: confirm routes through the canonical DestructiveAction→ConfirmDialog
          gate (alertdialog role, focus trap, Escape cancels, cancel never disabled)
          instead of a hand-rolled overlay. */}
      <ConfirmDialog
        open={confirmAction != null}
        title={confirmAction ? (confirmAction.confirmTitle ?? `Confirm ${confirmAction.label}`) : ''}
        body={
          confirmAction
            ? (confirmAction.confirmMessage ??
              `Are you sure you want to ${confirmAction.label.toLowerCase()} ${selectedItems.length} item${
                selectedItems.length > 1 ? 's' : ''
              }?`)
            : undefined
        }
        confirmLabel={confirmAction?.label}
        destructive={confirmAction?.variant === 'destructive'}
        onConfirm={handleConfirmAction}
        onCancel={() => {
          setConfirmAction(null);
        }}
      />
    </>
  );
}

// Bulk Actions Overflow Menu

interface BulkActionsOverflowMenuProps<T = any> {
  actions: BulkAction<T>[];
  selectedItems: T[];
  onExecuteAction: (action: BulkAction<T>) => void;
  isExecuting: string | null;
}

function BulkActionsOverflowMenu<T = any>({
  actions,
  selectedItems: _selectedItems,
  onExecuteAction,
  isExecuting,
}: BulkActionsOverflowMenuProps<T>) {
  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(String(knobProps.sizeToken));
  return (
    <DropdownMenu
      items={actions.map((action) => ({
        key: action.id,
        label: isExecuting === action.id ? '...' : action.label,
        icon: action.icon,
        disabled: action.disabled ?? isExecuting === action.id,
        // DG-ST-03: menu rows explain inline; a running action is explained
        // as busy rather than dangling bare-disabled.
        disabledReason: action.disabledReason ?? (isExecuting === action.id ? 'Running...' : undefined),
        destructive: action.variant === 'destructive',
        onSelect: () => {
          onExecuteAction(action);
        },
      }))}>
      <Button
        size={knobProps.sizeToken}
        icon={<DotsThreeIcon size={iconPx} />}
        aria-label="More bulk actions"
        {...knobProps.borderRadius}
      />
    </DropdownMenu>
  );
}

// Row Selection Hook

export interface UseRowSelectionOptions<T = any> {
  data: T[];
  selectionKey?: keyof T;
  initialSelection?: T[];
  onSelectionChange?: (selectedItems: T[]) => void;
}

export interface UseRowSelectionReturn<T = any> {
  selectedItems: T[];
  selectedIds: Set<string | number>;
  isSelected: (item: T) => boolean;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  toggleItem: (item: T) => void;
  toggleAll: () => void;
  selectItems: (items: T[]) => void;
  clearSelection: () => void;
  selectAll: () => void;
}

export function useRowSelection<T = any>({
  data,
  selectionKey = 'id' as keyof T,
  initialSelection = [],
  onSelectionChange,
}: UseRowSelectionOptions<T>): UseRowSelectionReturn<T> {
  const [selectedItems, setSelectedItems] = useState<T[]>(initialSelection);

  const selectedIds = new Set(selectedItems.map((item) => item[selectionKey] as string | number));

  const isSelected = (item: T): boolean => selectedIds.has(item[selectionKey] as string | number);

  const isAllSelected = data.length > 0 && selectedItems.length === data.length;
  const isIndeterminate = selectedItems.length > 0 && selectedItems.length < data.length;

  const toggleItem = (item: T) => {
    const itemId = item[selectionKey] as string | number;
    const newSelection = isSelected(item)
      ? selectedItems.filter((selected) => selected[selectionKey] !== itemId)
      : [...selectedItems, item];

    setSelectedItems(newSelection);
    onSelectionChange?.(newSelection);
  };

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedItems([]);
      onSelectionChange?.([]);
    } else {
      setSelectedItems([...data]);
      onSelectionChange?.([...data]);
    }
  };

  const selectItems = (items: T[]) => {
    setSelectedItems(items);
    onSelectionChange?.(items);
  };

  const clearSelection = () => {
    setSelectedItems([]);
    onSelectionChange?.([]);
  };

  const selectAll = () => {
    setSelectedItems([...data]);
    onSelectionChange?.([...data]);
  };

  return {
    selectedItems,
    selectedIds,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggleItem,
    toggleAll,
    selectItems,
    clearSelection,
    selectAll,
  };
}

// Bulk Actions Helper
// Note: Removed hardcoded default actions. Users should define their own actions based on their specific needs.
