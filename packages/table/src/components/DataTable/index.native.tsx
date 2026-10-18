/**
 * DataTable - compound component for data tables (native variant).
 *
 * Uses FlashList for virtualization on native platforms.
 * Exports the same interface as the web version.
 */

import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { Button, Field, useFormField } from '@repo/forms';
import { Table } from '@repo/table-primitives';
import { useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, EmptyState, useDirection, ScrollView } from '@repo/ui';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { flexRender } from '@tanstack/react-table';
import type { Cell, ColumnDefTemplate, Row, SortDirection } from '@tanstack/react-table';
import React, { useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FontSizeTokens } from 'tamagui';
import { Text, View, useMedia, withStaticProperties } from 'tamagui';

import { useDataTable } from '../../hooks/use-data-table';
import type {
  BulkAction,
  DataTableColumn,
  DataTableColumnType,
  DataTableData,
  DataTableField,
  SelectAllScope,
} from '../../types';
import { DEFAULT_PAGE_SIZE_OPTIONS, INFINITE_TRIGGER_ROWS } from '../../utils/pagination-defaults';
import { withInterp } from '../../utils/with-interp';
import { DataTableBulkActions } from '../DataTableBulkActions';
import { DataTableCell } from '../DataTableCell';
import { DataTableColumnPinning } from '../DataTableColumnPinning';
import { DataTableExport } from '../DataTableExport';
import { DataTableFilters } from '../DataTableFilters';
import { DataTableGrouping } from '../DataTableGrouping';
import { DataTablePagination } from '../DataTablePagination';
import { DataTableSearch } from '../DataTableSearch';
import { DataTableToolbar } from '../DataTableToolbar';
import { DataTableViewOptions } from '../DataTableViewOptions';

import { CellContent } from './CellContent';
import { dataTableChrome, resolveDataTableIntent, rowIntentProps } from './data-table-chrome';
import { DataTableContext } from './data-table-context';
import { DataTableStateContext } from './data-table-state-context';
import type { DataTableStateContextValue } from './data-table-state-context';
import { DataTableDocumentList } from './DataTableDocumentList';
import { DataTableInfiniteTail } from './DataTableInfiniteTail';
import { DataTableMobileCards, rowZebraAttr } from './DataTableMobileCards';
import type { DataTableRootProps } from './DataTableRoot';
import { NativeInfiniteSentinel } from './NativeInfiniteSentinel';
import { tableRowStateProps } from './row-state-chrome';

export { DataTableContext } from './data-table-context';
export { DataTableStateContext, useDataTableState } from './data-table-state-context';
export type { DataTableStateContextValue } from './data-table-state-context';
export type { DataTableRootProps } from './DataTableRoot';

/**
 * Renders a tanstack cell definition natively. RN drops raw string/number
 * children inside a View ("Text strings must be rendered within a <Text>
 * component"), and both tanstack's default cell and common custom cells
 * (`cell: (info) => info.getValue()`) return primitives — on native those
 * cells rendered blank. flexRender defers the call into an element, hiding
 * the primitive from the caller, so this wrapper calls the renderer in its
 * own render (hooks stay legal — same stability as flexRender's element)
 * and wraps primitive output in <Text>.
 */
// oxlint-disable-next-line typescript/promise-function-async -- returns a ReactNode; React 19's ReactNode union includes Promise
const NativeCellContent = <TProps extends object>({
  cellDef,
  ctx,
  fontSize,
}: {
  cellDef: ColumnDefTemplate<TProps> | undefined;
  ctx: TProps;
  fontSize?: FontSizeTokens;
}) => {
  // SAFETY: a column template renders a ReactNode (TanStack's flexRender contract)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-runtime-typeof -- TanStack types the template's render function as returning any; typeof tells a template function from a static value
  const rendered = (typeof cellDef === 'function' ? cellDef(ctx) : cellDef) as React.ReactNode;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- RN needs primitive render output wrapped in <Text>; typeof is the discriminant
  if (typeof rendered === 'string' || typeof rendered === 'number') {
    return <Text {...(fontSize === undefined ? {} : { fontSize })}>{String(rendered)}</Text>;
  }
  return rendered ?? null;
};

type FieldFilterType = Exclude<DataTableColumnType, 'money'>;

const filterTypeByField: Partial<Record<DataTableField, FieldFilterType>> = {
  stepper: 'number',
  slider: 'number',
  progress: 'number',
  rating: 'number',
  duration: 'number',
  datepicker: 'date',
  datetimepicker: 'date',
  timepicker: 'date',
  daterangepicker: 'date',
  multidatepicker: 'date',
  checkbox: 'boolean',
  switch: 'boolean',
  select: 'select',
  combobox: 'select',
  radiogroup: 'select',
  togglegroup: 'select',
};

/** Maps field type to filter-compatible types */
const mapFieldToFilterType = (field?: DataTableField): FieldFilterType =>
  field === undefined ? 'text' : (filterTypeByField[field] ?? 'text');

const DEFAULT_TABLE_LABEL = 'Data table';

const noBulkActions: BulkAction[] = [];

const sizeFromToken = (sizeToken: string): 'sm' | 'md' | 'lg' => {
  if (sizeToken === '$3') {
    return 'sm';
  }
  if (sizeToken === '$5') {
    return 'lg';
  }
  return 'md';
};

const cellHeightBySize = { sm: '$6', md: '$8', lg: '$10' } as const;

const cellLocationFor = (isFirst: boolean, isLast: boolean): 'first' | 'last' | 'middle' => {
  if (isFirst) {
    return 'first';
  }
  return isLast ? 'last' : 'middle';
};

const headerCursor = (disabled: boolean, sortable: boolean): 'not-allowed' | 'pointer' | 'default' => {
  if (disabled) {
    return 'not-allowed';
  }
  return sortable ? 'pointer' : 'default';
};

const ariaSortFor = (sortable: boolean, direction: false | SortDirection): React.AriaAttributes['aria-sort'] => {
  if (!sortable) {
    return undefined;
  }
  if (direction === 'asc') {
    return 'ascending';
  }
  return direction === 'desc' ? 'descending' : 'none';
};

// oxlint-disable-next-line anti-slop/no-unknown-returns -- cell values are arbitrary consumer data; the caller narrows to string | number
const readFirstCellValue = <TData,>(row: Row<TData>): unknown => {
  try {
    return row.getVisibleCells()[0]?.getValue();
  } catch {
    // A throwing accessor only means the row has no derived identity; callers fall back to the index label.
    return undefined;
  }
};

// oxlint-disable-next-line eslint/complexity, react-doctor/no-giant-component -- the native root mirrors the web root's prop surface; branches are prop defaults and layout modes
const DataTableRoot = <TData extends DataTableData = DataTableData>({
  data,
  columns,
  initialState,
  controlledState,
  onStateChange,
  onRetry,
  isLoading: isLoadingProp,
  isFetching: isFetchingProp,
  syncWithUrl = false,
  urlDebounceMs = 500,
  urlStrategy,
  manualFiltering = false,
  manualPagination = false,
  manualSorting = false,
  enableFiltering = true,
  filterableFields,
  enableSorting = true,
  enablePagination = true,
  pageSizeOptions,
  paginationMode = 'pages',
  loadPage,
  rowAccumulator,
  enableColumnVisibility = true,
  enableColumnOrdering = false,
  enableColumnResizing = false,
  enableGlobalSearch = true,
  enableViews = false,
  columnLayout = 'equal',
  layout = 'auto',
  enableVirtualization = false,
  virtualizationHeight,
  virtualizationOverscan = 5,
  enableRowExpansion = false,
  renderSubComponent,
  getSubRows,
  enableRowSelection = false,
  selectAllScope: selectAllScopeProp,
  bulkActions,
  enableColumnPinning = false,
  maxPinnedColumns = 3,
  enableGrouping = false,
  enableKeyboardNavigation: _enableKeyboardNavigation = false,
  onRowPress,
  rowLabel,
  readOnly = false,
  onCellChange,
  name,
  form: formProp,
  showRowNumbers = false,
  showAddRow = false,
  showDeleteRow = false,
  minRows = 0,
  maxRows,
  defaultRow,
  onDataChange,
  rowCount,
  pageCount,
  renderToolbar,
  renderPagination,
  renderFilters,
  className: _className,
  size,
  compact = false,
  disabled = false,
  accent,
  error,
  warning,
  success,
  children,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  ...props
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- prop defaults, layout modes and form mode; split would only move the branches
}: DataTableRootProps<TData>) => {
  const { t } = useTranslation();
  const { sm } = useMedia();
  // Native: `list` is subject-led document rows (same as web). Cards stay
  // the certified compact pattern; `table` pins the grid.
  const showList = layout === 'list';
  const showCards = !showList && (layout === 'cards' || (layout === 'auto' && !sm));
  const intent = resolveDataTableIntent({ accent, error, warning, success });
  const { knobProps, disabledState } = useResolvedKnobs({
    intent,
    component: 'DataTable',
    compact,
  });
  const chrome = dataTableChrome(knobProps.sizeToken);
  const bulkBarPlacement = knobProps.bulkBarPlacement === 'bottom' ? 'bottom' : 'top';
  // House selectAllScope knob (DG-TBL-03): prop overrides knob; default page.
  const selectAllScope: SelectAllScope =
    selectAllScopeProp ?? (knobProps.selectAllScope === 'filtered' ? 'filtered' : 'page');
  const rowHeightPx = chrome.rowPx;
  // Collapsed expand-caret points toward inline-end, so it mirrors in RTL via
  // glyph swap (useDirection, Axiom 15); rotation sign flips so expanded
  // still points down.
  const isRTL = useDirection() === 'rtl';
  const ExpandCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const expandedCaretRotation = isRTL ? 'rotate(-90deg)' : 'rotate(90deg)';
  const { resolvedForm } = useFormField({ form: formProp });

  const isFormMode = name !== undefined && name !== '' && resolvedForm !== undefined;

  const { table, state, actions, computed } = useDataTable({
    data,
    columns,
    initialState,
    controlledState,
    onStateChange,
    syncWithUrl,
    urlDebounceMs,
    urlStrategy,
    manualFiltering,
    manualPagination,
    manualSorting,
    enableFiltering,
    filterableFields,
    enableSorting,
    enablePagination,
    paginationMode,
    loadPage,
    rowAccumulator,
    enableColumnVisibility,
    enableColumnOrdering,
    enableColumnResizing,
    columnLayout,
    enableGlobalSearch,
    enableViews,
    enableVirtualization,
    virtualizationHeight,
    virtualizationOverscan,
    enableRowExpansion,
    getSubRows,
    renderSubComponent,
    enableRowSelection,
    enableColumnPinning,
    maxPinnedColumns,
    enableGrouping,
    enableKeyboardNavigation: false,
    rowCount,
    pageCount,
    isLoading: isLoadingProp,
    isFetching: isFetchingProp,
  });

  const resolvedBulkActions = bulkActions ?? noBulkActions;

  const scopeAllSelected =
    selectAllScope === 'filtered' ? table.getIsAllRowsSelected() : table.getIsAllPageRowsSelected();
  const scopeSomeSelected =
    selectAllScope === 'filtered' ? table.getIsSomeRowsSelected() : table.getIsSomePageRowsSelected();
  const selectAllChecked = enableRowSelection && scopeAllSelected;
  const selectAllIndeterminate = enableRowSelection && scopeSomeSelected && !scopeAllSelected;

  const toggleSelectAll = useCallback(() => {
    if (selectAllScope === 'filtered') {
      table.toggleAllRowsSelected();
    } else {
      table.toggleAllPageRowsSelected();
    }
  }, [selectAllScope, table]);

  const resolvedSize: 'sm' | 'md' | 'lg' = size ?? sizeFromToken(knobProps.sizeToken);

  const cellHeight = cellHeightBySize[resolvedSize];

  const headerGroups = table.getHeaderGroups();
  const rowModelRows = table.getRowModel().rows;
  // Infinite mode reveals accumulated pages only; loader mode's row model is
  // already just the accumulated rows, so the slice is a no-op there.
  const { infinite } = computed;
  const tableRows = infinite ? rowModelRows.slice(0, infinite.visibleRowCount) : rowModelRows;
  const heldRowsRef = useRef(tableRows);
  if (tableRows.length > 0) {
    // oxlint-disable-next-line react/refs -- keep-previous-rows: the render-phase write is idempotent for a given row model
    heldRowsRef.current = tableRows;
  }
  const tableQueryInFlight = state.isFetching === true || state.isPlaceholderData === true || state.isLoading === true;
  const infiniteInFlight = infinite?.isAppending === true || infinite?.isInitialLoading === true;
  const queryInFlight = tableQueryInFlight || infiniteInFlight;
  // oxlint-disable-next-line react/refs -- keep-previous-rows: hold the last non-empty rows while a query is in flight
  const holdRows = tableRows.length === 0 && queryInFlight && heldRowsRef.current.length > 0;
  const displayRows = holdRows ? heldRowsRef.current : tableRows;
  const footerGroups = table.getFooterGroups();

  const flashListRef = useRef<FlashListRef<(typeof tableRows)[0]>>(null);

  const getColSizeProps = useCallback(
    (
      col: {
        getSize: () => number;
        columnDef: { size?: number; minSize?: number; maxSize?: number };
      },
      isLastCell = false,
    ) => {
      if (enableColumnResizing) {
        return {
          width: col.getSize(),
          minWidth: col.columnDef.minSize ?? 0,
          maxWidth: col.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
          flex: 0,
        };
      }
      if (col.columnDef.size != null) {
        return {
          width: col.columnDef.size,
          minWidth: col.columnDef.minSize ?? col.columnDef.size,
          flex: 0,
        };
      }
      return {
        flex: isLastCell ? 1 : 0,
        flexShrink: isLastCell ? 1 : 0,
        flexGrow: isLastCell ? 1 : 0,
      };
    },
    [enableColumnResizing],
  );

  const isVirtualized = enableVirtualization && virtualizationHeight != null && virtualizationHeight > 0;
  // Only the grid virtualizes on native; list and cards render in flow.
  const isVirtualGrid = isVirtualized && !showList && !showCards;

  // DataTableColumnPinning is a hook-style helper (it calls useState/useMemo/
  // useCallback internally), so it must run unconditionally at the top level —
  // the previous useMemo wrapper made its hooks conditional (crash class the
  // web variant already fixed).
  // oxlint-disable-next-line react/capitalized-calls -- hook-style helper (see above), not a component
  const pinningHelpers = DataTableColumnPinning({
    table,
    maxPinnedColumns,
    allowPinning: true,
    disabled,
  });
  const pinning = enableColumnPinning ? pinningHelpers : null;

  const extraColumnsBefore = (showRowNumbers ? 1 : 0) + (enableRowExpansion ? 1 : 0);
  const extraColumnsAfter = showDeleteRow && !readOnly ? 1 : 0;

  const handleCellChange = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cell values are arbitrary consumer data, handed through to onCellChange untouched
    async (rowIndex: number, columnId: string, newValue: unknown) => {
      if (readOnly || disabled) {
        return;
      }
      const previousValue: unknown = data[rowIndex]?.[columnId];
      // Bail on no-op commits so a field that re-emits the same primitive value
      // (e.g. OTP sync effects) cannot force a new data array every render.
      if (Object.is(previousValue, newValue)) {
        return;
      }
      if (onCellChange) {
        const result = await onCellChange(rowIndex, columnId, newValue, previousValue);
        if (result === false) {
          return;
        }
      }
      if (!isFormMode && onDataChange) {
        const newData = [...data];
        newData[rowIndex] = { ...newData[rowIndex], [columnId]: newValue };
        onDataChange(newData);
      }
    },
    [readOnly, disabled, data, onCellChange, isFormMode, onDataChange],
  );

  const atMaxRows = useCallback(
    (rowTotal: number) => maxRows !== undefined && maxRows !== 0 && rowTotal >= maxRows,
    [maxRows],
  );

  const handleAddRow = useCallback(() => {
    if (readOnly || disabled || atMaxRows(data.length)) {
      return;
    }
    // SAFETY: a new row is the consumer's defaultRow plus the idx counter; missing fields are filled by the editors
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- Partial<TData> cannot be asserted to TData directly
    const newRow = { ...defaultRow, idx: data.length + 1 } as unknown as TData;
    if (!isFormMode && onDataChange) {
      onDataChange([...data, newRow]);
    }
  }, [readOnly, disabled, atMaxRows, data, defaultRow, isFormMode, onDataChange]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      if (readOnly || disabled || data.length <= minRows) {
        return;
      }
      if (!isFormMode && onDataChange) {
        onDataChange(data.filter((_, idx) => idx !== rowIndex));
      }
    },
    [readOnly, disabled, minRows, data, isFormMode, onDataChange],
  );

  const isCompact = resolvedSize === 'sm' || compact;
  const renderCellContent = useCallback(
    (cell: Cell<TData, unknown>, rowIndex: number, rowData: TData) => {
      // SAFETY: every DataTable column def is built from a DataTableColumn
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack hands back the base ColumnDef
      const columnDef = cell.column.columnDef as DataTableColumn;
      const columnId = cell.column.id;
      const value = cell.getValue();

      if (columnDef.cell !== undefined && columnDef.cell !== '' && columnDef.field === undefined) {
        return (
          <CellContent
            cellDef={columnDef.cell}
            ctx={cell.getContext()}
            fontSize={knobProps.label.fontSize}
          />
        );
      }

      return (
        <DataTableCell
          value={value}
          field={columnDef.field}
          fieldProps={columnDef.fieldProps}
          // oxlint-disable-next-line anti-slop/no-unknown-parameters -- DataTableCell emits arbitrary consumer values
          onChange={(newValue: unknown) => {
            void handleCellChange(rowIndex, columnId, newValue);
          }}
          readOnly={readOnly}
          disabled={disabled}
          columnId={columnId}
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack header is a string or a render function; typeof is the discriminant
          columnLabel={typeof columnDef.header === 'string' ? columnDef.header : undefined}
          rowIndex={rowIndex}
          rowData={rowData}
        />
      );
    },
    [handleCellChange, readOnly, disabled, knobProps.label.fontSize],
  );

  const renderRowContent = useCallback(
    (row: Row<TData>, rowIndex: number) => {
      const rowData = row.original;
      return (
        <>
          {showRowNumbers && (
            <Table.Cell
              cellWidth={chrome.rowNumberCol}
              cellHeight={cellHeight}
              cellLocation="first">
              <Text
                fontSize={knobProps.sizeToken}
                color="$color10">
                {rowIndex + 1}
              </Text>
            </Table.Cell>
          )}
          {enableRowExpansion && (
            <Table.Cell
              cellWidth={chrome.expandCol}
              cellHeight={cellHeight}
              cellLocation={showRowNumbers ? 'middle' : 'first'}>
              {row.getCanExpand() ? (
                <View
                  onPress={() => {
                    if (disabled) {
                      return;
                    }
                    row.toggleExpanded();
                  }}
                  cursor={disabled ? 'not-allowed' : 'pointer'}
                  aria-disabled={disabled || undefined}
                  padding="$1"
                  aria-expanded={row.getIsExpanded()}
                  aria-label={
                    row.getIsExpanded()
                      ? withInterp(t('Collapse row {{row}}', { row: rowIndex + 1 }), {
                          row: rowIndex + 1,
                        })
                      : withInterp(t('Expand row {{row}}', { row: rowIndex + 1 }), {
                          row: rowIndex + 1,
                        })
                  }>
                  <ExpandCaretIcon
                    size={chrome.iconPx}
                    style={{ transform: row.getIsExpanded() ? expandedCaretRotation : 'none' }}
                  />
                </View>
              ) : (
                <View width={chrome.iconPx} />
              )}
            </Table.Cell>
          )}
          {row.getVisibleCells().map((cell, cellIndex) => {
            const isFirstDataCell = cellIndex === 0 && !showRowNumbers && !enableRowExpansion;
            const isLastDataCell = cellIndex === row.getVisibleCells().length - 1 && !showDeleteRow;
            const cellLocation = cellLocationFor(isFirstDataCell, isLastDataCell);
            return (
              <Table.Cell
                key={cell.id}
                {...getColSizeProps(cell.column, isLastDataCell)}
                cellHeight={cellHeight}
                cellLocation={cellLocation}
                minWidth={0}>
                {renderCellContent(cell, rowIndex, rowData)}
              </Table.Cell>
            );
          })}
          {showDeleteRow && !readOnly && (
            <Table.Cell
              cellWidth={chrome.deleteCol}
              cellHeight={cellHeight}
              cellLocation="last"
              justifyContent="center">
              <Button
                chromeless
                circular
                icon={TrashIcon}
                disabled={disabled || data.length <= minRows}
                onPress={() => {
                  handleDeleteRow(rowIndex);
                }}
                aria-label={withInterp(t('Delete row {{row}}', { row: rowIndex + 1 }), {
                  row: rowIndex + 1,
                })}
              />
            </Table.Cell>
          )}
        </>
      );
    },
    [
      showRowNumbers,
      enableRowExpansion,
      showDeleteRow,
      readOnly,
      disabled,
      cellHeight,
      chrome.rowNumberCol,
      chrome.expandCol,
      chrome.iconPx,
      chrome.deleteCol,
      knobProps.sizeToken,
      getColSizeProps,
      renderCellContent,
      handleDeleteRow,
      data.length,
      minRows,
      t,
      ExpandCaretIcon,
      expandedCaretRotation,
    ],
  );

  const tableZebraOn = knobProps.tableZebra === 'on';

  // ---- Row press (onRowPress): the ROW is one pressable unit ----
  // Native twin of the web contract: press anywhere on the row activates.
  // Inner controls need no isolation walk here — native nested pressables
  // claim the gesture responder, so a child press never bubbles to the row
  // (see utils/row-press.ts). Roving tabindex is a web-only concern.
  const rowPressActive = Boolean(onRowPress) && !disabled;

  const deriveRowIdentity = useCallback(
    (row: (typeof tableRows)[0]): string | undefined => {
      const fromAccessor = rowLabel?.(row.original);
      if (fromAccessor !== undefined && fromAccessor !== '') {
        return fromAccessor;
      }
      const firstCellValue = readFirstCellValue(row);
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- cell values are arbitrary consumer data; typeof is the only discriminant
      if ((typeof firstCellValue === 'string' && firstCellValue.length > 0) || typeof firstCellValue === 'number') {
        return String(firstCellValue);
      }
      return undefined;
    },
    [rowLabel],
  );

  const deriveRowLabel = useCallback(
    (row: (typeof tableRows)[0], index: number): string =>
      deriveRowIdentity(row) ?? withInterp(t('Row {{row}}', { row: index + 1 }), { row: index + 1 }),
    [deriveRowIdentity, t],
  );

  // Selection-toggle name: row identity beats a bare index ("Select row
  // Bulbasaur", falling back to "Select row 3"), the same source the grid
  // and the card list both read.
  const deriveSelectRowLabel = useCallback(
    (row: (typeof tableRows)[0], index: number): string => {
      const identity = deriveRowIdentity(row) ?? String(index + 1);
      return withInterp(t('Select row {{row}}', { row: identity }), { row: identity });
    },
    [deriveRowIdentity, t],
  );

  const getRowPressProps = useCallback(
    // The card list asks for the "card" variant. Native carries no DOM row
    // role for it to override, so both variants land on role="button".
    (row: (typeof tableRows)[0], index: number, _variant: 'row' | 'card' = 'row') => {
      if (!rowPressActive) {
        return {};
      }
      return {
        onPress: () => onRowPress?.(row.original, index),
        role: 'button' as const,
        'aria-label': deriveRowLabel(row, index),
      };
    },
    [rowPressActive, onRowPress, deriveRowLabel],
  );

  const renderRow = useCallback(
    (row: (typeof tableRows)[0], index: number) => (
      <Table.Row
        {...tableRowStateProps({
          selected: row.getIsSelected(),
          zebraOn: tableZebraOn,
          index,
          pressable: rowPressActive,
        })}
        rowLocation="middle"
        // oxlint-disable-next-line react-doctor/no-array-index-as-key -- row.id leads the key; index kept so lint-only pass does not change remount behavior
        key={`${row.id}-${index}`}
        aria-rowindex={index + 1}
        aria-label={withInterp(t('Row {{row}}', { row: index + 1 }), { row: index + 1 })}
        data-table-zebra={rowZebraAttr(tableZebraOn, index)}
        {...getRowPressProps(row, index)}
        {...rowIntentProps(row.original)}>
        {renderRowContent(row, index)}
      </Table.Row>
    ),
    [renderRowContent, tableZebraOn, t, getRowPressProps, rowPressActive],
  );

  const {
    setGlobalFilter: handleGlobalFilterChange,
    clearFilters: handleClearFilters,
    saveView: handleSaveView,
    loadView: handleLoadView,
    setPagination: handlePaginationChange,
  } = actions;

  // oxlint-disable-next-line typescript/promise-function-async -- returns a ReactNode; React 19's ReactNode union includes Promise
  const renderToolbarComponent = useCallback(() => {
    if (renderToolbar) {
      return renderToolbar({
        globalFilter: state.globalFilter ?? '',
        onGlobalFilterChange: actions.setGlobalFilter,
        onClearFilters: actions.clearFilters,
        onSaveView: actions.saveView,
        onLoadView: actions.loadView,
        views: state.views,
        activeViewId: state.activeViewId,
        isFetching: Boolean(state.isFetching),
      });
    }
    return (
      <DataTableToolbar
        globalFilter={state.globalFilter ?? ''}
        onGlobalFilterChange={handleGlobalFilterChange}
        onClearFilters={handleClearFilters}
        onSaveView={handleSaveView}
        onLoadView={handleLoadView}
        views={state.views}
        activeViewId={state.activeViewId}
        enableViews={enableViews}
        enableGlobalSearch={enableGlobalSearch}
        enableFiltering={enableFiltering}
        isFetching={Boolean(state.isFetching)}
      />
    );
  }, [
    renderToolbar,
    state.globalFilter,
    state.views,
    state.activeViewId,
    state.isFetching,
    actions,
    handleGlobalFilterChange,
    handleClearFilters,
    handleSaveView,
    handleLoadView,
    enableViews,
    enableGlobalSearch,
    enableFiltering,
  ]);

  // oxlint-disable-next-line typescript/promise-function-async -- returns a ReactNode; React 19's ReactNode union includes Promise
  const renderPaginationComponent = useCallback(() => {
    const resolvedPageSizeOptions = pageSizeOptions ?? [...DEFAULT_PAGE_SIZE_OPTIONS];
    if (renderPagination) {
      return renderPagination({
        pagination: state.pagination,
        onPaginationChange: actions.setPagination,
        pageSizeOptions: resolvedPageSizeOptions,
      });
    }
    return (
      <DataTablePagination
        pagination={state.pagination}
        onPaginationChange={handlePaginationChange}
        pageSizeOptions={resolvedPageSizeOptions}
        showInfo={!sm}
      />
    );
  }, [pageSizeOptions, renderPagination, state.pagination, actions.setPagination, handlePaginationChange, sm]);

  const stateContextValue = useMemo<DataTableStateContextValue<TData>>(
    () => ({ table, state, actions, computed, selectAllScope }),
    [table, state, actions, computed, selectAllScope],
  );

  const renderTableInner = useCallback(
    // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one render of every layout mode and state; branches are flags and slots
    (tableData: TData[], setTableData?: (d: TData[]) => void) => {
      const effectiveHandleAddRow = () => {
        if (readOnly || disabled || atMaxRows(tableData.length)) {
          return;
        }
        // SAFETY: a new row is the consumer's defaultRow plus the idx counter; missing fields are filled by the editors
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- Partial<TData> cannot be asserted to TData directly
        const newRow = { ...defaultRow, idx: tableData.length + 1 } as unknown as TData;
        setTableData?.([...tableData, newRow]);
      };
      const effectiveHandleDeleteRow = (rowIndex: number) => {
        if (readOnly || disabled || tableData.length <= minRows) {
          return;
        }
        setTableData?.(tableData.filter((_, idx) => idx !== rowIndex));
      };

      // W9 / DG-ST-01,02,04 — error wins over empty; initial load uses table skeleton.
      if (state.error !== undefined && state.error !== '') {
        return (
          <AsyncBoundary
            error={state.error}
            onRetry={onRetry}
            layout="table"
            errorTitle={t("Couldn't load table")}
            compact
            aria-label={ariaLabel ?? DEFAULT_TABLE_LABEL}
          />
        );
      }
      const loadingFirstPage = state.isLoading === true || infinite?.isInitialLoading === true;
      const nothingToHold = state.isFetching !== true && state.isPlaceholderData !== true;
      if (loadingFirstPage && displayRows.length === 0 && nothingToHold) {
        return (
          <AsyncBoundary
            loading
            layout="table"
            aria-label={ariaLabel ?? DEFAULT_TABLE_LABEL}
          />
        );
      }

      const chromeDisabledProps = disabled ? disabledState.chromeKnobProps : {};

      let gridBody: React.ReactNode;
      if (displayRows.length === 0) {
        gridBody = (
          <Table.Row>
            <Table.Cell>
              {queryInFlight ? null : (
                <EmptyState
                  compact
                  aria-live="polite"
                  title={computed.hasActiveFilters ? t('No results found') : t('No data available')}
                />
              )}
            </Table.Cell>
          </Table.Row>
        );
      } else if (isVirtualized) {
        gridBody = (
          <View style={{ height: virtualizationHeight }}>
            <FlashList
              keyboardShouldPersistTaps="handled"
              ref={flashListRef}
              data={displayRows}
              drawDistance={rowHeightPx * virtualizationOverscan}
              keyExtractor={(row) => row.id}
              renderItem={({ item, index }) => renderRow(item, index)}
              {...(infinite && !infinite.exhausted
                ? {
                    onEndReached: infinite.loadMore,
                    onEndReachedThreshold: (INFINITE_TRIGGER_ROWS * rowHeightPx) / virtualizationHeight,
                  }
                : {})}
            />
          </View>
        );
      } else {
        gridBody = displayRows.map((row, index) => {
          const mainRow = renderRow(row, index);
          const showSubRow = enableRowExpansion && renderSubComponent !== undefined && row.getIsExpanded();
          const subRow =
            showSubRow && (row.subRows?.length ?? 0) === 0 ? (
              <Table.Row
                key={`${row.id}-sub`}
                backgroundColor="$color2">
                <Table.Cell
                  {...{
                    colSpan: table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter,
                  }}>
                  {renderSubComponent(row)}
                </Table.Cell>
              </Table.Row>
            ) : null;
          return (
            <React.Fragment key={row.id}>
              {mainRow}
              {subRow}
            </React.Fragment>
          );
        });
      }

      let layoutBody: React.ReactNode;
      if (showList) {
        layoutBody = (
          <DataTableDocumentList
            tableRows={displayRows}
            enableRowSelection={enableRowSelection}
            disabled={disabled}
            hasActiveFilters={computed.hasActiveFilters}
            renderCellContent={renderCellContent}
            compact={isCompact}
            selectRowLabel={deriveSelectRowLabel}
            queryInFlight={queryInFlight}
            {...(rowPressActive ? { getRowPressProps } : {})}
          />
        );
      } else if (showCards) {
        layoutBody = (
          <View
            flexDirection="column"
            gap="$2">
            <DataTableMobileCards
              tableRows={displayRows}
              enableRowSelection={enableRowSelection}
              showRowNumbers={showRowNumbers}
              showDeleteRow={showDeleteRow}
              readOnly={readOnly}
              disabled={disabled}
              dataLength={tableData.length}
              minRows={minRows}
              hasActiveFilters={computed.hasActiveFilters}
              renderCellContent={renderCellContent}
              onDeleteRow={isFormMode ? effectiveHandleDeleteRow : handleDeleteRow}
              selectAllChecked={selectAllChecked}
              selectAllIndeterminate={selectAllIndeterminate}
              onToggleSelectAll={toggleSelectAll}
              compact={isCompact}
              selectRowLabel={deriveSelectRowLabel}
              queryInFlight={queryInFlight}
              {...(rowPressActive ? { getRowPressProps } : {})}
            />
            {enablePagination && !infinite && (
              <View
                width="100%"
                {...chromeDisabledProps}>
                {renderPaginationComponent()}
              </View>
            )}
          </View>
        );
      } else {
        layoutBody = (
          <ScrollView
            horizontal
            maxWidth="100%">
            <View
              flex={1}
              flexDirection="column"
              width="100%"
              paddingBottom={enablePagination ? '$10' : undefined}
              aria-label={`${ariaLabel ?? DEFAULT_TABLE_LABEL} content`}>
              <Table
                alignCells={{ x: 'start', y: 'center' }}
                alignHeaderCells={{ x: 'start', y: 'center' }}
                cellHeight={cellHeight}
                {...knobProps.borderRadiusNested}
                width="100%"
                aria-label={ariaLabel ?? DEFAULT_TABLE_LABEL}
                aria-rowcount={computed.totalPages * state.pagination.pageSize}
                aria-colcount={table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter}>
                <Table.Head
                  zIndex="$1"
                  aria-label="Table headers">
                  {headerGroups.map((headerGroup, groupIndex) => (
                    <Table.Row
                      key={headerGroup.id}
                      backgroundColor="$color2"
                      rowLocation={groupIndex === 0 ? 'first' : 'middle'}
                      borderTopRightRadius={knobProps.borderRadiusNested.borderRadius}
                      borderTopLeftRadius={knobProps.borderRadiusNested.borderRadius}
                      borderBottomLeftRadius="$0"
                      borderBottomRightRadius="$0"
                      aria-rowindex={groupIndex}>
                      {showRowNumbers && (
                        <Table.HeaderCell
                          cellWidth={chrome.rowNumberCol}
                          cellHeight={cellHeight}>
                          <Text
                            fontSize={knobProps.sizeToken}
                            fontWeight="600">
                            #
                          </Text>
                        </Table.HeaderCell>
                      )}
                      {enableRowExpansion && (
                        <Table.HeaderCell
                          cellWidth={chrome.expandCol}
                          cellHeight={cellHeight}>
                          <View width={chrome.iconPx} />
                        </Table.HeaderCell>
                      )}
                      {headerGroup.headers.map((header, headerIndex) => {
                        const isSortableHeader = header.column.getCanSort();
                        const sortDirection = header.column.getIsSorted();
                        const isLastHeader = headerIndex === headerGroup.headers.length - 1 && !showDeleteRow;
                        return (
                          <Table.HeaderCell
                            key={header.id}
                            id={`${header.column.id}-header`}
                            onPress={
                              isSortableHeader && !disabled ? header.column.getToggleSortingHandler() : undefined
                            }
                            cursor={headerCursor(disabled, isSortableHeader)}
                            position="relative"
                            aria-sort={ariaSortFor(isSortableHeader, sortDirection)}
                            {...getColSizeProps(header.column, isLastHeader)}>
                            <View
                              flexDirection="row"
                              gap="$2"
                              alignItems="center"
                              justifyContent="flex-start"
                              flex={1}>
                              <Text
                                fontSize={knobProps.sizeToken}
                                selectable={false}
                                userSelect="none">
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(header.column.columnDef.header, header.getContext())}
                              </Text>
                              {isSortableHeader && (
                                <Text
                                  aria-hidden={true}
                                  role="presentation"
                                  color={sortDirection === false ? '$color8' : '$color10'}>
                                  {sortDirection === 'asc' && <CaretDownIcon size={chrome.iconPx} />}
                                  {sortDirection === 'desc' && (
                                    <CaretDownIcon
                                      size={chrome.iconPx}
                                      style={{ transform: 'rotate(180deg)' }}
                                    />
                                  )}
                                  {sortDirection === false && <CaretUpDownIcon size={chrome.iconPx} />}
                                </Text>
                              )}
                              {pinning && (
                                <View
                                  flexDirection="row"
                                  gap="$1">
                                  {/* One compact cycle control (left →
                                            right → unpin) mirrors web. */}
                                  <pinning.PinButton columnId={header.column.id} />
                                </View>
                              )}
                            </View>
                          </Table.HeaderCell>
                        );
                      })}
                      {showDeleteRow && !readOnly && (
                        <Table.HeaderCell
                          cellWidth={chrome.deleteCol}
                          cellHeight={cellHeight}
                          cellLocation="last"
                        />
                      )}
                    </Table.Row>
                  ))}
                </Table.Head>

                <Table.Body aria-label="Table data">{gridBody}</Table.Body>

                {footerGroups.length > 0 && (
                  <Table.Foot>
                    {footerGroups.map((footerGroup) => (
                      <Table.Row key={footerGroup.id}>
                        {footerGroup.headers.map((header) => (
                          <Table.Cell key={header.id}>
                            {header.isPlaceholder ? null : (
                              <NativeCellContent
                                cellDef={header.column.columnDef.footer}
                                ctx={header.getContext()}
                              />
                            )}
                          </Table.Cell>
                        ))}
                      </Table.Row>
                    ))}
                  </Table.Foot>
                )}
              </Table>
            </View>
          </ScrollView>
        );
      }

      return (
        <DataTableContext.Provider
          size={resolvedSize}
          compact={isCompact}>
          <DataTableStateContext.Provider value={stateContextValue}>
            <View
              flexDirection="column"
              gap="$6"
              aria-label={ariaLabel ?? DEFAULT_TABLE_LABEL}
              aria-describedby={ariaDescribedBy}
              aria-live="polite"
              aria-atomic="false"
              aria-busy={queryInFlight || undefined}
              {...knobProps.containerRadius}
              // UX-011 / Axiom 6 HONEST STATE: `disabled` makes the whole
              // assembly inert (pointerEvents none blocks every touch) and
              // says so (aria-disabled). LC-40 assembly fragment carries the
              // dimWhole visual; keepLabel washes per-control chrome (cells,
              // buttons receive their own `disabled`).
              aria-disabled={disabled || undefined}
              {...(disabled
                ? {
                    ...disabledState.assemblyKnobProps,
                    pointerEvents: 'none' as const,
                  }
                : {})}
              {...props}>
              {(enableGlobalSearch || enableFiltering || enableViews) && (
                <View
                  width="100%"
                  {...chromeDisabledProps}>
                  {renderToolbarComponent()}
                </View>
              )}
              {enableRowSelection && bulkBarPlacement === 'top' ? (
                <View
                  width="100%"
                  {...chromeDisabledProps}>
                  <DataTableBulkActions
                    actions={resolvedBulkActions}
                    maxVisibleActions={5}
                    showSelectionCount
                    placement="top"
                  />
                </View>
              ) : null}
              {children}
              {renderFilters?.({
                filters: state.filters ?? [],
                onFiltersChange: actions.setFilters,
                onAddFilter: (filter) => {
                  actions.addFilter(filter);
                },
                onRemoveFilter: actions.removeFilter,
                onClearFilters: actions.clearFilters,
                availableColumns: columns.map((col) => ({
                  id: col.id ?? '',
                  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack header is a string or a render function; typeof is the discriminant
                  label: typeof col.header === 'string' ? col.header : (col.id ?? ''),
                  type: mapFieldToFilterType(col.field),
                })),
              })}

              {layoutBody}

              {infinite ? (
                <DataTableInfiniteTail
                  infinite={infinite}
                  visibleCount={tableRows.length}
                  showAppendSkeleton={!isVirtualGrid}
                  rowHeightPx={rowHeightPx}
                  fontSize={knobProps.sizeToken}
                  gapProps={knobProps.gap}
                  sentinel={
                    !isVirtualGrid && !infinite.exhausted ? (
                      <NativeInfiniteSentinel
                        // oxlint-disable-next-line react/jsx-handler-names -- loadMore is the infinite controller's own action name
                        onVisible={infinite.loadMore}
                        leadPx={INFINITE_TRIGGER_ROWS * rowHeightPx}
                      />
                    ) : null
                  }
                />
              ) : null}

              {enableRowSelection && bulkBarPlacement === 'bottom' ? (
                <View
                  width="100%"
                  {...chromeDisabledProps}>
                  <DataTableBulkActions
                    actions={resolvedBulkActions}
                    maxVisibleActions={5}
                    showSelectionCount
                    placement="bottom"
                  />
                </View>
              ) : null}

              {showAddRow && !readOnly && (
                <View>
                  <Button
                    icon={PlusIcon}
                    disabled={disabled || (maxRows !== undefined && tableData.length >= maxRows)}
                    onPress={isFormMode ? effectiveHandleAddRow : handleAddRow}
                    aria-label={t('Add Row')}>
                    {t('Add Row')}
                  </Button>
                </View>
              )}

              {!showCards && enablePagination && !infinite && (
                <View
                  width="100%"
                  {...chromeDisabledProps}>
                  {renderPaginationComponent()}
                </View>
              )}
            </View>
          </DataTableStateContext.Provider>
        </DataTableContext.Provider>
      );
    },
    [
      resolvedSize,
      isCompact,
      stateContextValue,
      chrome.rowNumberCol,
      chrome.expandCol,
      chrome.iconPx,
      chrome.deleteCol,
      onRetry,
      atMaxRows,
      ariaLabel,
      ariaDescribedBy,
      knobProps,
      props,
      enableGlobalSearch,
      enableFiltering,
      enableViews,
      renderToolbarComponent,
      children,
      renderFilters,
      state,
      actions,
      columns,
      cellHeight,
      enablePagination,
      computed,
      table,
      extraColumnsBefore,
      extraColumnsAfter,
      headerGroups,
      showRowNumbers,
      enableRowExpansion,
      showDeleteRow,
      readOnly,
      getColSizeProps,
      pinning,
      tableRows,
      isVirtualized,
      virtualizationHeight,
      virtualizationOverscan,
      renderRow,
      renderSubComponent,
      footerGroups,
      showList,
      showCards,
      renderPaginationComponent,
      showAddRow,
      maxRows,
      isFormMode,
      handleAddRow,
      handleDeleteRow,
      minRows,
      defaultRow,
      disabled,
      disabledState,
      renderCellContent,
      rowPressActive,
      getRowPressProps,
      enableRowSelection,
      selectAllChecked,
      selectAllIndeterminate,
      toggleSelectAll,
      deriveSelectRowLabel,
      displayRows,
      queryInFlight,
      infinite,
      isVirtualGrid,
      rowHeightPx,
      bulkBarPlacement,
      resolvedBulkActions,
      t,
    ],
  );

  if (isFormMode) {
    return (
      <Field
        form={resolvedForm}
        name={name}
        mode="array">
        {(field) => {
          // SAFETY: the array field under `name` holds this table's rows
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the form API types field values as unknown
          const formData = (field.state.value as TData[] | undefined) ?? [];
          const setFormData = (next: TData[]) => {
            field.handleChange(next);
          };
          return renderTableInner(formData, setFormData);
        }}
      </Field>
    );
  }

  // oxlint-disable-next-line react/refs -- renderTableInner reads heldRowsRef through displayRows; see holdRows
  return renderTableInner(data, onDataChange);
};

export const DataTable = withStaticProperties(DataTableRoot, {
  Toolbar: DataTableToolbar,
  Filters: DataTableFilters,
  Pagination: DataTablePagination,
  BulkActions: DataTableBulkActions,
  SelectionToolbar: DataTableBulkActions,
  Export: DataTableExport,
  Search: DataTableSearch,
  ViewOptions: DataTableViewOptions,
  Grouping: DataTableGrouping,
});

export type DataTableComponent = typeof DataTable;
