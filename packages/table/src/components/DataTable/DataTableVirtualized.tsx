/**
 * DataTableVirtualized - virtual scroll mode for DataTable.
 *
 * Uses TanStack Virtual to render only visible rows, enabling
 * performant display of large datasets. Renders absolute-positioned
 * rows inside a scrollable container with a filler area for
 * column border extension.
 */

import { Skeleton } from '@repo/ui';
import { Text, View } from 'tamagui';

import { dataTableChrome, rowIntentProps } from './data-table-chrome';
import { rowZebraAttr } from './DataTableMobileCards';
import { tableRowStateProps } from './row-state-chrome';

/** The slice of a TanStack Virtual item this body reads. */
export interface VirtualizedItem {
  index: number;
  start: number;
  size: number;
}

/** The slice of a TanStack `Row` this body reads (data rows and group rows). */
export interface VirtualizedTableRow {
  id: string;
  depth?: number;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- arbitrary consumer row data; only `_intent` is read, by rowIntentProps
  original?: Record<string, unknown>;
  groupingValue?: unknown;
  subRows?: readonly unknown[];
  getIsGrouped?: () => boolean;
  getIsExpanded?: () => boolean;
  toggleExpanded?: () => void;
  getIsSelected?: () => boolean;
}

export interface DataTableVirtualizedProps<TRow extends VirtualizedTableRow = VirtualizedTableRow> {
  virtualItems: readonly VirtualizedItem[];
  totalSize: number;
  bodyScrollRef: React.RefObject<HTMLDivElement | null>;
  virtualizationHeight: number | undefined;
  tableRows: readonly TRow[];
  headerGroups: readonly unknown[];
  showRowNumbers: boolean;
  enableRowExpansion: boolean;
  showDeleteRow: boolean;
  readOnly: boolean;
  enableKeyboardNavigation: boolean;
  keyboardNav: unknown;
  getColSizeProps: (col: never) => object;
  renderRowContent: (row: TRow, rowIndex: number, isLastRow: boolean, cellElement?: 'div') => React.ReactNode;
  extraColumnsBefore: number;
  extraColumnsAfter: number;
  table: unknown;
  /**
   * Infinite mode: the virtual count includes one extra tail row past the
   * loaded rows. It renders a skeleton (append affordance) and extends the
   * scroll range so appended pages grow geometry seamlessly.
   */
  hasInfiniteTail?: boolean;
  /**
   * onRowPress support: press/keyboard/AT props for one pressable row
   * (built by DataTableRoot; spread on the row host so virtual rows keep
   * the same activation + roving-focus contract as grid rows).
   */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- open-ended prop bag built by the root and spread onto the row host
  getRowPressProps?: (row: TRow, rowIndex: number, variant?: 'row' | 'card') => Record<string, unknown>;
  /** LC-65 row estimate — caller passes size-recipe height. */
  rowHeightPx?: number;
  /** The house tableZebra knob, resolved by DataTableRoot. */
  tableZebraOn?: boolean;
}

export const DataTableVirtualized = <TRow extends VirtualizedTableRow>({
  virtualItems,
  totalSize,
  bodyScrollRef,
  virtualizationHeight,
  tableRows,
  renderRowContent,
  hasInfiniteTail = false,
  getRowPressProps,
  rowHeightPx: rowHeightPxProp,
  tableZebraOn = false,
}: DataTableVirtualizedProps<TRow>) => {
  const rowHeightPx = rowHeightPxProp ?? dataTableChrome('$4').rowPx;
  return (
    <div
      style={{
        height: virtualizationHeight,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
      ref={bodyScrollRef}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- virtual body is an absolutely positioned div scroller; a real tbody cannot host it
      role="rowgroup">
      <div
        style={{
          height: totalSize,
          width: '100%',
          position: 'relative',
          flexShrink: 0,
        }}>
        {virtualItems.map((virtualRow) => {
          const row = tableRows[virtualRow.index];
          if (row === undefined) {
            // Infinite tail row (index === tableRows.length): bounded append
            // skeleton, never an infinite spinner.
            if (!hasInfiniteTail || virtualRow.index !== tableRows.length) {
              return null;
            }
            return (
              <View
                key="infinite-tail"
                position="absolute"
                top={0}
                left={0}
                width="100%"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: virtualRow.size,
                  minHeight: rowHeightPx,
                }}
                flexDirection="row"
                alignItems="center"
                paddingHorizontal="$2"
                aria-hidden
                data-testid="infinite-append-skeleton">
                <Skeleton
                  width="100%"
                  height={rowHeightPx - 8}
                />
              </View>
            );
          }
          const isLastRow = virtualRow.index === tableRows.length - 1;

          // Grouped row: render the group header (expand toggle + value +
          // count) instead of data cells. Without this branch a TanStack
          // group row fell through renderRowContent and painted garbage
          // cells with no way to expand the group.
          if (row.getIsGrouped?.() === true) {
            return (
              <View
                key={row.id}
                position="absolute"
                top={0}
                left={0}
                width="100%"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: virtualRow.size,
                  minHeight: rowHeightPx,
                }}
                flexDirection="row"
                alignItems="center"
                backgroundColor="$color3"
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- absolutely positioned virtual row; a real tr is not a valid child of the div scroller
                role="row"
                aria-rowindex={virtualRow.index + 1}>
                <View
                  flexDirection="row"
                  alignItems="center"
                  gap="$2"
                  paddingLeft={(row.depth ?? 0) * 16 + 8}
                  cursor="pointer"
                  onPress={() => row.toggleExpanded?.()}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui View on web and native; a DOM button cannot nest inside the row host
                  role="button"
                  tabIndex={0}
                  aria-expanded={row.getIsExpanded?.()}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      row.toggleExpanded?.();
                    }
                  }}>
                  <Text
                    fontFamily="$mono"
                    fontSize="$3">
                    {row.getIsExpanded?.() === true ? '▼' : '▶'}
                  </Text>
                  {/* oxlint-disable-next-line typescript/no-base-to-string -- TanStack types groupingValue as unknown; it is the primitive the grouped accessor returned */}
                  <Text fontWeight="600">{String(row.groupingValue ?? '—')}</Text>
                  <Text
                    color="$placeholderColor"
                    fontSize="$2">
                    ({row.subRows?.length ?? 0})
                  </Text>
                </View>
              </View>
            );
          }

          return (
            <View
              key={row.id}
              position="absolute"
              top={0}
              left={0}
              width="100%"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                height: virtualRow.size,
                minHeight: rowHeightPx,
              }}
              flexDirection="row"
              {...tableRowStateProps({
                selected: row.getIsSelected?.() === true,
                keyboardFocused: false,
                zebraOn: tableZebraOn,
                index: virtualRow.index,
                pressable: getRowPressProps !== undefined,
              })}
              data-table-zebra={rowZebraAttr(tableZebraOn, virtualRow.index)}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- absolutely positioned virtual row; a real tr is not a valid child of the div scroller
              role="row"
              aria-rowindex={virtualRow.index + 1}
              {...getRowPressProps?.(row, virtualRow.index)}
              {...rowIntentProps(row.original)}>
              {/* div cells (role="cell" via the primitive): a real <td> is
                  not a valid child of the absolutely-positioned div rows */}
              {renderRowContent(row, virtualRow.index, isLastRow, 'div')}
            </View>
          );
        })}
      </div>
      {/* Filler to extend background when rows don't fill viewport */}
      <View
        flexDirection="row"
        backgroundColor="$color1"
        flex={1}
        minHeight={0}
        aria-hidden={true}
      />
    </div>
  );
};
