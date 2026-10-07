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

import { dataTableChrome, rowIntentProps } from './dataTableChrome';
import { tableRowStateProps } from './rowStateChrome';

export interface DataTableVirtualizedProps {
  virtualItems: any[];
  totalSize: number;
  bodyScrollRef: React.RefObject<HTMLDivElement | null>;
  virtualizationHeight: number | undefined;
  tableRows: any[];
  headerGroups: any[];
  showRowNumbers: boolean;
  enableRowExpansion: boolean;
  showDeleteRow: boolean;
  readOnly: boolean;
  enableKeyboardNavigation: boolean;
  keyboardNav: any;
  getColSizeProps: (col: any) => any;
  renderRowContent: (row: any, rowIndex: number, isLastRow: boolean, cellElement?: 'div') => React.ReactNode;
  extraColumnsBefore: number;
  extraColumnsAfter: number;
  table: any;
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
  getRowPressProps?: (row: any, rowIndex: number, variant?: 'row' | 'card') => Record<string, any>;
  /** LC-65 row estimate — caller passes size-recipe height. */
  rowHeightPx?: number;
  /** The house tableZebra knob, resolved by DataTableRoot. */
  tableZebraOn?: boolean;
}

export function DataTableVirtualized({
  virtualItems,
  totalSize,
  bodyScrollRef,
  virtualizationHeight,
  tableRows,
  headerGroups,
  showRowNumbers,
  enableRowExpansion,
  showDeleteRow,
  readOnly,
  enableKeyboardNavigation: _enableKeyboardNavigation,
  keyboardNav,
  getColSizeProps,
  renderRowContent,
  hasInfiniteTail = false,
  getRowPressProps,
  rowHeightPx: rowHeightPxProp,
  tableZebraOn = false,
}: DataTableVirtualizedProps) {
  const rowHeightPx = rowHeightPxProp ?? dataTableChrome('$4').rowPx;
  return (
    <div
      style={{
        height: virtualizationHeight,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
      ref={bodyScrollRef as any}
      role="rowgroup">
      <div
        style={{
          height: totalSize,
          width: '100%',
          position: 'relative',
          flexShrink: 0,
        }}>
        {virtualItems.map((virtualRow: any) => {
          const row = tableRows[virtualRow.index];
          if (!row) {
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
                {...({ 'data-testid': 'infinite-append-skeleton' } as any)}>
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
          if (row.getIsGrouped?.()) {
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
                role="row"
                aria-rowindex={virtualRow.index + 1}>
                <View
                  flexDirection="row"
                  alignItems="center"
                  gap="$2"
                  paddingLeft={(row.depth ?? 0) * 16 + 8}
                  cursor="pointer"
                  onPress={() => row.toggleExpanded()}
                  role="button"
                  tabIndex={0}
                  aria-expanded={row.getIsExpanded()}
                  {...({
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        row.toggleExpanded();
                      }
                    },
                  } as any)}>
                  <Text
                    fontFamily="$mono"
                    fontSize="$3">
                    {row.getIsExpanded() ? '▼' : '▶'}
                  </Text>
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
              {...(tableRowStateProps({
                selected: Boolean(row.getIsSelected?.()),
                keyboardFocused: false,
                zebraOn: tableZebraOn,
                index: virtualRow.index,
                pressable: Boolean(getRowPressProps),
              }) as any)}
              {...({
                'data-table-zebra': tableZebraOn ? (virtualRow.index % 2 === 0 ? 'even' : 'odd') : 'off',
              } as any)}
              role="row"
              aria-rowindex={virtualRow.index + 1}
              {...(getRowPressProps ? (getRowPressProps(row, virtualRow.index) as any) : {})}
              {...(rowIntentProps(row.original) as any)}>
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
}
