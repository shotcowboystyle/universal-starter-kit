import { MIN_PRESS_TARGET, pressTargetHitSlop, pressTargetStyle, useResolvedKnobs } from '@repo/theme';
import { PushPinIcon } from '@phosphor-icons/react';
import type { Table as ReactTable } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { Text, View, isWeb, styled } from 'tamagui';

import { t } from '../../shared/t';
import { iconSizeForToken } from '../../utils/chromeIcons';
import { useDataTableState } from '../DataTable/DataTableStateContext';

// DG-LAY-04 / SP-FIXED: the pin glyph stays small (~22px incl. padding) but the
// press target is floored at 44×44 via hitSlop; negative margins keep header
// row height and column flow unchanged (same pattern as ColumnHeaderFilter).
const PIN_TRIGGER_VISUAL = 22;
const PIN_TRIGGER_OUTSET = Math.max(0, Math.ceil((MIN_PRESS_TARGET - PIN_TRIGGER_VISUAL) / 2));

interface DataTableColumnPinningProps<TData> {
  table?: ReactTable<TData>;
  onPinChange?: (columnId: string, position?: 'left' | 'right') => void;
  maxPinnedColumns?: number;
  allowPinning?: boolean;
  /** Table-level disabled state (UX-011): pin buttons stay visible but inert. */
  disabled?: boolean;
}

const StickyColumn = styled(View, {
  name: 'DataTableStickyColumnFrame',
  backgroundColor: '$background',
  zIndex: 1,
  variants: {
    // Pin buckets are named left/right (TanStack state) but anchor to the
    // reading start/end so RTL mirrors (RTL backlog B3).
    position: {
      left: {
        insetInlineStart: 0,
      },
      right: {
        insetInlineEnd: 0,
        ...(isWeb
          ? { borderInlineStartWidth: 1, borderInlineEndWidth: 0 }
          : { borderStartWidth: 1, borderEndWidth: 0 }),
      },
    },
  } as const,
});

const PinnedIndicator = styled(View, {
  name: 'DataTablePinnedIndicatorFrame',
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 3,
  backgroundColor: '$accentBackground',
  variants: {
    position: {
      left: {
        insetInlineStart: 0,
      },
      right: {
        insetInlineEnd: 0,
      },
    },
  } as const,
});

export type StickyColumnProps = React.ComponentProps<typeof StickyColumn>;
export type PinnedIndicatorProps = React.ComponentProps<typeof PinnedIndicator>;

export function DataTableColumnPinning<TData>(props: DataTableColumnPinningProps<TData>) {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values
  const table = props.table ?? (ctx?.table as ReactTable<TData> | undefined);

  if (!table) {
    throw new Error(
      'DataTableColumnPinning requires a `table` prop or must be used inside a DataTable compound component.',
    );
  }

  const { onPinChange, maxPinnedColumns = 3, allowPinning = true, disabled = false } = props;

  const { knobProps } = useResolvedKnobs();
  const iconPx = iconSizeForToken(String(knobProps.sizeToken));

  // Get fresh table state on each render
  const pinnedColumns = table.getState().columnPinning || {
    left: [],
    right: [],
  };

  const togglePin = useCallback(
    (columnId: string, position?: 'left' | 'right') => {
      const currentPinning = table.getState().columnPinning || {
        left: [],
        right: [],
      };
      const isCurrentlyPinnedLeft = (currentPinning.left ?? []).includes(columnId);
      const isCurrentlyPinnedRight = (currentPinning.right ?? []).includes(columnId);

      const newPinned = { ...currentPinning };

      // Unpin if already pinned
      if (isCurrentlyPinnedLeft) {
        newPinned.left = (currentPinning.left ?? []).filter((id) => id !== columnId);
        onPinChange?.(columnId);
      } else if (isCurrentlyPinnedRight) {
        newPinned.right = (currentPinning.right ?? []).filter((id) => id !== columnId);
        onPinChange?.(columnId);
      } else {
        // Pin to specified position
        if (position === 'left') {
          if ((currentPinning.left ?? []).length < maxPinnedColumns) {
            newPinned.left = [...(currentPinning.left ?? []), columnId];
            onPinChange?.(columnId, 'left');
          } else {
            return; // Don't pin if max limit reached
          }
        } else if (position === 'right') {
          if ((currentPinning.right ?? []).length < maxPinnedColumns) {
            newPinned.right = [...(currentPinning.right ?? []), columnId];
            onPinChange?.(columnId, 'right');
          } else {
            return; // Don't pin if max limit reached
          }
        }
      }

      // Update table state
      table.setColumnPinning(newPinned);
    },
    [maxPinnedColumns, onPinChange, table],
  );

  const isPinned = useCallback(
    (columnId: string) =>
      (pinnedColumns.left ?? []).includes(columnId) || (pinnedColumns.right ?? []).includes(columnId),
    [pinnedColumns],
  );

  const getPinPosition = useCallback(
    (columnId: string): 'left' | 'right' | undefined => {
      if ((pinnedColumns.left ?? []).includes(columnId)) {
        return 'left';
      }
      if ((pinnedColumns.right ?? []).includes(columnId)) {
        return 'right';
      }
      return undefined;
    },
    [pinnedColumns],
  );

  const canPin = useCallback(
    (position: 'left' | 'right') =>
      position === 'left'
        ? (pinnedColumns.left ?? []).length < maxPinnedColumns
        : (pinnedColumns.right ?? []).length < maxPinnedColumns,
    [pinnedColumns, maxPinnedColumns],
  );

  /**
   * Single-control cycle: unpinned → pinned first side → pinned other side →
   * unpinned. Skips a side at its max; both sides maxed = no-op.
   */
  const cyclePin = useCallback(
    (columnId: string, firstPosition: 'left' | 'right' = 'left') => {
      const currentPinning = table.getState().columnPinning || { left: [], right: [] };
      const left = currentPinning.left ?? [];
      const right = currentPinning.right ?? [];
      const current = left.includes(columnId)
        ? ('left' as const)
        : right.includes(columnId)
          ? ('right' as const)
          : undefined;
      const other = firstPosition === 'left' ? ('right' as const) : ('left' as const);

      const set = (next?: 'left' | 'right') => {
        const newPinned = {
          left: left.filter((id) => id !== columnId),
          right: right.filter((id) => id !== columnId),
        };
        if (next) {
          newPinned[next] = [...newPinned[next], columnId];
        }
        table.setColumnPinning(newPinned);
        onPinChange?.(columnId, next);
      };

      if (current === undefined) {
        if (canPin(firstPosition)) {
          set(firstPosition);
          return;
        }
        if (canPin(other)) {
          set(other);
          return;
        }
        return;
      }
      if (current === firstPosition && canPin(other)) {
        set(other);
        return;
      }
      set(undefined);
    },
    [table, onPinChange, canPin],
  );

  const PinButton = useCallback(
    ({ columnId, position }: { columnId: string; position?: 'left' | 'right' }) => {
      if (!allowPinning) {
        return null;
      }

      const firstPosition = position ?? 'left';
      const other = firstPosition === 'left' ? ('right' as const) : ('left' as const);
      const currentPosition = getPinPosition(columnId);
      const pinned = currentPosition !== undefined;

      // Next action in the cycle (mirrors cyclePin) so the accessible name
      // always announces what pressing will do. A disabled table keeps the
      // button visible but inert (LC-40 keeps the "none" dim treatment).
      const next: 'left' | 'right' | 'unpin' | 'none' = disabled
        ? 'none'
        : currentPosition === undefined
          ? canPin(firstPosition)
            ? firstPosition
            : canPin(other)
              ? other
              : 'none'
          : currentPosition === firstPosition && canPin(other)
            ? other
            : 'unpin';

      // DG-A11Y-06 / Axiom 12: names are differentiated per column and use the
      // human column label (string header) when available, not the raw id.
      const header = table.getColumn(columnId)?.columnDef.header;
      const columnLabel = typeof header === 'string' ? header : columnId;
      const label =
        next === 'unpin'
          ? t('Unpin {{column}} column', { column: columnLabel })
          : next === 'right'
            ? t('Pin {{column}} column right', { column: columnLabel })
            : t('Pin {{column}} column left', { column: columnLabel });

      return (
        // LC-54 amendment (2026-08-13): the grown press target NEVER paints —
        // hover/press fills on this box spread across the full 44px floor and
        // bled into the neighboring header band via the negative outsets.
        // Floor-wide feedback is subtree opacity; the painted hover chrome
        // rides the glyph-scale ring inside (ColumnHeaderFilter anatomy).
        <View
          cursor={next === 'none' ? 'default' : 'pointer'}
          {...pressTargetStyle()}
          alignItems="center"
          justifyContent="center"
          marginVertical={-PIN_TRIGGER_OUTSET}
          marginHorizontal={-PIN_TRIGGER_OUTSET}
          hitSlop={pressTargetHitSlop(PIN_TRIGGER_VISUAL)}
          // Axiom 6 HONEST STATE: a pinned column is an active signal — it
          // keeps full strength; the idle affordance rests dimmed. An inert
          // trigger (LC-40: table disabled / both sides maxed) keeps its dim
          // in every state — feedback would promise an action it won't take.
          opacity={next === 'none' ? 0.4 : pinned ? 1 : 0.7}
          hoverStyle={{ opacity: next === 'none' ? 0.4 : 1 }}
          pressStyle={{ opacity: next === 'none' ? 0.4 : 0.9 }}
          onPress={(e: any) => {
            e?.stopPropagation?.();
            if (next === 'none') {
              return;
            }
            cyclePin(columnId, firstPosition);
          }}
          role="button"
          aria-label={label}
          aria-disabled={next === 'none' || undefined}>
          <View
            padding="$1"
            borderRadius="$2"
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            gap={knobProps.gap.gap}
            {...(next === 'none' ? undefined : { hoverStyle: { backgroundColor: '$color4' } })}>
            <PushPinIcon
              size={iconPx}
              color={pinned ? 'var(--accentColor)' : 'var(--color10)'}
              weight={pinned ? 'fill' : 'regular'}
            />
            {pinned && currentPosition ? (
              <Text
                {...knobProps.label}
                fontWeight="400"
                color="$color10">
                {currentPosition === 'left' ? 'L' : 'R'}
              </Text>
            ) : null}
          </View>
        </View>
      );
    },
    [allowPinning, disabled, getPinPosition, canPin, cyclePin, table, iconPx, knobProps],
  );

  const pinnedLeftColumns = useMemo(
    () => table.getAllColumns().filter((column) => (pinnedColumns.left ?? []).includes(column.id)),
    [table, pinnedColumns.left],
  );

  const pinnedRightColumns = useMemo(
    () => table.getAllColumns().filter((column) => (pinnedColumns.right ?? []).includes(column.id)),
    [table, pinnedColumns.right],
  );

  const scrollableColumns = useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          (column) =>
            !(pinnedColumns.left ?? []).includes(column.id) && !(pinnedColumns.right ?? []).includes(column.id),
        ),
    [table, pinnedColumns],
  );

  // Pinned cells are R-NONE/SF-TRANSPARENT like every other cell — they carry
  // only the sticky occlusion fill and their own seam border, so they take the
  // radius-only fragment (D-03); a border-bearing one ringed each pinned cell.
  const ThemedStickyColumn = useCallback(
    (props: React.ComponentProps<typeof StickyColumn>) => (
      <StickyColumn
        {...knobProps.containerRadius}
        {...props}
      />
    ),
    [knobProps.containerRadius],
  );

  return {
    pinnedColumns,
    pinnedLeftColumns,
    pinnedRightColumns,
    scrollableColumns,
    togglePin,
    isPinned,
    getPinPosition,
    canPin,
    PinButton,
    StickyColumn: ThemedStickyColumn,
    PinnedIndicator,
  };
}

export function useColumnPinning<TData>(
  table: ReactTable<TData>,
  options?: {
    maxPinnedColumns?: number;
    allowPinning?: boolean;
    initialPinnedColumns?: {
      left?: string[];
      right?: string[];
    };
  },
) {
  const [pinnedState, setPinnedState] = useState({
    left: options?.initialPinnedColumns?.left ?? [],
    right: options?.initialPinnedColumns?.right ?? [],
  });

  const pinColumn = useCallback(
    (columnId: string, position: 'left' | 'right') => {
      setPinnedState((prev) => {
        const newState = { ...prev };
        // Remove from other position if exists
        newState.left = prev.left.filter((id) => id !== columnId);
        newState.right = prev.right.filter((id) => id !== columnId);

        // Add to new position
        if (position === 'left') {
          newState.left = [...newState.left, columnId];
        } else {
          newState.right = [...newState.right, columnId];
        }

        table.setColumnPinning(newState);
        return newState;
      });
    },
    [table],
  );

  const unpinColumn = useCallback(
    (columnId: string) => {
      setPinnedState((prev) => {
        const newState = {
          left: prev.left.filter((id) => id !== columnId),
          right: prev.right.filter((id) => id !== columnId),
        };
        table.setColumnPinning(newState);
        return newState;
      });
    },
    [table],
  );

  const resetPinning = useCallback(() => {
    const emptyState = { left: [], right: [] };
    setPinnedState(emptyState);
    table.setColumnPinning(emptyState);
  }, [table]);

  return {
    pinnedState,
    pinColumn,
    unpinColumn,
    resetPinning,
  };
}
