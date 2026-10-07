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
} from "@phosphor-icons/react";
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { AsyncBoundary, EmptyState, useDirection, ScrollView } from "@repo/ui";
import { Button, Field, useFormField } from "@repo/forms";
import { flexRender } from "@tanstack/react-table";
import { useResolvedKnobs } from "@repo/theme";
import React, { useRef, useMemo, useCallback } from "react";
import type { FontSizeTokens } from "tamagui";
import { Text, View, useMedia, withStaticProperties } from "tamagui";
import { useTranslation } from "react-i18next";
import { useDataTable } from "../../hooks/useDataTable";
import type { BulkAction, DataTableColumn, DataTableField, SelectAllScope } from "../../types";
import { DEFAULT_PAGE_SIZE_OPTIONS, INFINITE_TRIGGER_ROWS } from "../../utils/paginationDefaults";
import { withInterp } from "../../utils/withInterp";
import { DataTableColumnPinning } from "../DataTableColumnPinning";
import { DataTablePagination } from "../DataTablePagination";
import { CellContent } from "./CellContent";
import { DataTableToolbar } from "../DataTableToolbar";
import { DataTableFilters } from "../DataTableFilters";
import { DataTableBulkActions } from "../DataTableBulkActions";
import { DataTableExport } from "../DataTableExport";
import { DataTableSearch } from "../DataTableSearch";
import { DataTableViewOptions } from "../DataTableViewOptions";
import { DataTableGrouping } from "../DataTableGrouping";
import { DataTableCell } from "../DataTableCell";
import { Table } from "@repo/table-primitives";
import { DataTableContext } from "./DataTableContext";
import { DataTableDocumentList } from "./DataTableDocumentList";
import { DataTableInfiniteTail } from "./DataTableInfiniteTail";
import { DataTableMobileCards } from "./DataTableMobileCards";
import { dataTableChrome, resolveDataTableIntent, rowIntentProps } from "./dataTableChrome";
import { NativeInfiniteSentinel } from "./NativeInfiniteSentinel";
import { tableRowStateProps } from "./rowStateChrome";
import { DataTableStateContext } from "./DataTableStateContext";
import type { DataTableStateContextValue } from "./DataTableStateContext";
import type { DataTableRootProps } from "./DataTableRoot";

export { DataTableContext } from "./DataTableContext";
export { DataTableStateContext, useDataTableState } from "./DataTableStateContext";
export type { DataTableStateContextValue } from "./DataTableStateContext";
export type { DataTableRootProps } from "./DataTableRoot";

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
function NativeCellContent({
  cellDef,
  ctx,
  fontSize,
}: {
  cellDef: unknown;
  ctx: unknown;
  fontSize?: any;
}) {
  const rendered = typeof cellDef === "function" ? cellDef(ctx) : cellDef;
  if (typeof rendered === "string" || typeof rendered === "number") {
    return <Text {...(fontSize ? { fontSize } : {})}>{String(rendered)}</Text>;
  }
  return rendered ?? null;
}

/** Maps field type to filter-compatible types */
function mapFieldToFilterType(
  field?: DataTableField,
): "text" | "number" | "date" | "boolean" | "select" {
  switch (field) {
    case "stepper":
    case "slider":
    case "progress":
    case "rating":
    case "duration": {
      return "number";
    }
    case "datepicker":
    case "datetimepicker":
    case "timepicker":
    case "daterangepicker":
    case "multidatepicker": {
      return "date";
    }
    case "checkbox":
    case "switch": {
      return "boolean";
    }
    case "select":
    case "combobox":
    case "radiogroup":
    case "togglegroup": {
      return "select";
    }
    default: {
      return "text";
    }
  }
}

function DataTableRoot<TData extends Record<string, any> = Record<string, any>>({
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
  paginationMode = "pages",
  loadPage,
  rowAccumulator,
  enableColumnVisibility = true,
  enableColumnOrdering = false,
  enableColumnResizing = false,
  enableGlobalSearch = true,
  enableViews = false,
  columnLayout = "equal",
  layout = "auto",
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
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  ...props
}: DataTableRootProps<TData>) {
  const { t } = useTranslation();
  const { sm } = useMedia();
  // Native: `list` is subject-led document rows (same as web). Cards stay
  // the certified compact pattern; `table` pins the grid.
  const showList = layout === "list";
  const showCards = !showList && (layout === "cards" || (layout === "auto" && !sm));
  const intent = resolveDataTableIntent({ accent, error, warning, success });
  const { knobProps, disabledState } = useResolvedKnobs({
    intent,
    component: "DataTable",
    compact,
  });
  const chrome = dataTableChrome(String(knobProps.sizeToken));
  const bulkBarPlacement = knobProps.bulkBarPlacement === "bottom" ? "bottom" : "top";
  // House selectAllScope knob (DG-TBL-03): prop overrides knob; default page.
  const selectAllScope: SelectAllScope =
    selectAllScopeProp ?? (knobProps.selectAllScope === "filtered" ? "filtered" : "page");
  const rowHeightPx = chrome.rowPx;
  // Collapsed expand-caret points toward inline-end, so it mirrors in RTL via
  // glyph swap (useDirection, Axiom 15); rotation sign flips so expanded
  // still points down.
  const isRTL = useDirection() === "rtl";
  const ExpandCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const expandedCaretRotation = isRTL ? "rotate(-90deg)" : "rotate(90deg)";
  const { resolvedForm } = useFormField({ form: formProp });

  const isFormMode = Boolean(name && resolvedForm);

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

  const resolvedBulkActions = (bulkActions ?? []);

  const selectAllChecked =
    enableRowSelection &&
    (selectAllScope === "filtered"
      ? table.getIsAllRowsSelected()
      : table.getIsAllPageRowsSelected());
  const selectAllIndeterminate =
    enableRowSelection &&
    (selectAllScope === "filtered"
      ? table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
      : table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected());

  const toggleSelectAll = useCallback(() => {
    if (selectAllScope === "filtered") {
      table.toggleAllRowsSelected();
    } else {
      table.toggleAllPageRowsSelected();
    }
  }, [selectAllScope, table]);

  const resolvedSize: "sm" | "md" | "lg" =
    size ?? (knobProps.sizeToken === "$3" ? "sm" : knobProps.sizeToken === "$5" ? "lg" : "md");

  const cellHeight = resolvedSize === "sm" ? "$6" : resolvedSize === "lg" ? "$10" : "$8";

  const headerGroups = table.getHeaderGroups();
  const rowModelRows = table.getRowModel().rows;
  // Infinite mode reveals accumulated pages only; loader mode's row model is
  // already just the accumulated rows, so the slice is a no-op there.
  const {infinite} = computed;
  const tableRows = infinite ? rowModelRows.slice(0, infinite.visibleRowCount) : rowModelRows;
  const heldRowsRef = useRef(tableRows);
  if (tableRows.length > 0) {
    heldRowsRef.current = tableRows;
  }
  const queryInFlight = Boolean(
    (state.isFetching ??
    state.isPlaceholderData) ||
    infinite?.isAppending ||
    state.isLoading ??
    infinite?.isInitialLoading,
  );
  const displayRows =
    tableRows.length > 0
      ? tableRows
      : queryInFlight && heldRowsRef.current.length > 0
        ? heldRowsRef.current
        : tableRows;
  const footerGroups = table.getFooterGroups();

  const flashListRef = useRef<FlashListRef<(typeof tableRows)[0]>>(null);

  const getColSizeProps = useCallback(
    (
      col: {
        getSize: () => number;
        columnDef: { size?: number; minSize?: number; maxSize?: number };
      },
      isLastCell?: boolean,
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

  const isVirtualized =
    enableVirtualization && virtualizationHeight != null && virtualizationHeight > 0;
  // Only the grid virtualizes on native; list and cards render in flow.
  const isVirtualGrid = isVirtualized && !showList && !showCards;

  // DataTableColumnPinning is a hook-style helper (it calls useState/useMemo/
  // useCallback internally), so it must run unconditionally at the top level —
  // the previous useMemo wrapper made its hooks conditional (crash class the
  // web variant already fixed).
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
    async (rowIndex: number, columnId: string, newValue: any) => {
      if (readOnly || disabled) {return;}
      const previousValue = data[rowIndex]?.[columnId];
      // Bail on no-op commits so a field that re-emits the same primitive value
      // (e.g. OTP sync effects) cannot force a new data array every render.
      if (Object.is(previousValue, newValue)) {return;}
      if (onCellChange) {
        const result = await onCellChange(rowIndex, columnId, newValue, previousValue);
        if (result === false) {return;}
      }
      if (!isFormMode && onDataChange) {
        const newData = [...data];
        newData[rowIndex] = { ...newData[rowIndex], [columnId]: newValue };
        onDataChange(newData);
      }
    },
    [readOnly, disabled, data, onCellChange, isFormMode, onDataChange],
  );

  const handleAddRow = useCallback(() => {
    if (readOnly || disabled || (maxRows && data.length >= maxRows)) {return;}
    const newRow = { ...defaultRow, idx: data.length + 1 } as unknown as TData;
    if (!isFormMode && onDataChange) {
      onDataChange([...data, newRow]);
    }
  }, [readOnly, disabled, maxRows, data, defaultRow, isFormMode, onDataChange]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      if (readOnly || disabled || data.length <= minRows) {return;}
      if (!isFormMode && onDataChange) {
        onDataChange(data.filter((_, idx) => idx !== rowIndex));
      }
    },
    [readOnly, disabled, minRows, data, isFormMode, onDataChange],
  );

  const isCompact = resolvedSize === "sm" || compact;
  const renderCellContent = useCallback(
    (cell: any, rowIndex: number, rowData: TData) => {
      const columnDef = cell.column.columnDef as DataTableColumn;
      const columnId = cell.column.id;
      const value = cell.getValue();

      if (columnDef.cell && !columnDef.field) {
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
          onChange={ async (newValue) => handleCellChange(rowIndex, columnId, newValue)}
          readOnly={readOnly}
          disabled={disabled}
          columnId={columnId}
          columnLabel={typeof columnDef.header === "string" ? columnDef.header : undefined}
          rowIndex={rowIndex}
          rowData={rowData}
        />
      );
    },
    [handleCellChange, readOnly, disabled, knobProps.label.fontSize],
  );

  const renderRowContent = useCallback(
    (row: any, rowIndex: number) => {
      const rowData = row.original as TData;
      return (
        <>
          {showRowNumbers && (
            <Table.Cell
              cellWidth={chrome.rowNumberCol}
              cellHeight={cellHeight as any}
              cellLocation="first"
            >
              <Text fontSize={knobProps.sizeToken} color="$color10">
                {rowIndex + 1}
              </Text>
            </Table.Cell>
          )}
          {enableRowExpansion && (
            <Table.Cell
              cellWidth={chrome.expandCol}
              cellHeight={cellHeight as any}
              cellLocation={showRowNumbers ? "middle" : "first"}
            >
              {row.getCanExpand() ? (
                <View
                  onPress={() => {
                    if (disabled) {return;}
                    row.toggleExpanded();
                  }}
                  cursor={disabled ? "not-allowed" : "pointer"}
                  aria-disabled={disabled || undefined}
                  padding="$1"
                  aria-expanded={row.getIsExpanded()}
                  aria-label={
                    row.getIsExpanded()
                      ? withInterp(t("Collapse row {{row}}", { row: rowIndex + 1 }), {
                          row: rowIndex + 1,
                        })
                      : withInterp(t("Expand row {{row}}", { row: rowIndex + 1 }), {
                          row: rowIndex + 1,
                        })
                  }
                >
                  <ExpandCaretIcon
                    size={chrome.iconPx}
                    style={{ transform: row.getIsExpanded() ? expandedCaretRotation : "none" }}
                  />
                </View>
              ) : (
                <View width={chrome.iconPx} />
              )}
            </Table.Cell>
          )}
          {row.getVisibleCells().map((cell: any, cellIndex: number) => {
            const isFirstDataCell = cellIndex === 0 && !showRowNumbers && !enableRowExpansion;
            const isLastDataCell = cellIndex === row.getVisibleCells().length - 1 && !showDeleteRow;
            const cellLocation = isFirstDataCell ? "first" : isLastDataCell ? "last" : "middle";
            return (
              <Table.Cell
                key={cell.id}
                {...getColSizeProps(cell.column, isLastDataCell)}
                cellHeight={cellHeight as any}
                cellLocation={cellLocation}
                minWidth={0}
              >
                {renderCellContent(cell, rowIndex, rowData)}
              </Table.Cell>
            );
          })}
          {showDeleteRow && !readOnly && (
            <Table.Cell
              cellWidth={chrome.deleteCol}
              cellHeight={cellHeight as any}
              cellLocation="last"
              justifyContent="center"
            >
              <Button
                chromeless
                circular
                icon={TrashIcon}
                disabled={disabled || data.length <= minRows}
                onPress={() =>{  handleDeleteRow(rowIndex); }}
                aria-label={withInterp(t("Delete row {{row}}", { row: rowIndex + 1 }), {
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

  const tableZebraOn = knobProps.tableZebra === "on";

  // ---- Row press (onRowPress): the ROW is one pressable unit ----
  // Native twin of the web contract: press anywhere on the row activates.
  // Inner controls need no isolation walk here — native nested pressables
  // claim the gesture responder, so a child press never bubbles to the row
  // (see utils/rowPress.ts). Roving tabindex is a web-only concern.
  const rowPressActive = Boolean(onRowPress) && !disabled;

  const deriveRowIdentity = useCallback(
    (row: (typeof tableRows)[0]): string | undefined => {
      const fromAccessor = rowLabel?.(row.original as TData);
      if (fromAccessor) {return fromAccessor;}
      let firstCellValue: unknown;
      try {
        firstCellValue = row.getVisibleCells()[0]?.getValue();
      } catch {
        firstCellValue = undefined;
      }
      if (
        (typeof firstCellValue === "string" && firstCellValue.length > 0) ||
        typeof firstCellValue === "number"
      ) {
        return String(firstCellValue);
      }
      return undefined;
    },
    [rowLabel],
  );

  const deriveRowLabel = useCallback(
    (row: (typeof tableRows)[0], index: number): string =>
      deriveRowIdentity(row) ??
      withInterp(t("Row {{row}}", { row: index + 1 }), { row: index + 1 }),
    [deriveRowIdentity, t],
  );

  // Selection-toggle name: row identity beats a bare index ("Select row
  // Bulbasaur", falling back to "Select row 3"), the same source the grid
  // and the card list both read.
  const deriveSelectRowLabel = useCallback(
    (row: (typeof tableRows)[0], index: number): string => {
      const identity = deriveRowIdentity(row) ?? String(index + 1);
      return withInterp(t("Select row {{row}}", { row: identity }), { row: identity });
    },
    [deriveRowIdentity, t],
  );

  const getRowPressProps = useCallback(
    // The card list asks for the "card" variant. Native carries no DOM row
    // role for it to override, so both variants land on role="button".
    (row: (typeof tableRows)[0], index: number, _variant: "row" | "card" = "row") => {
      if (!rowPressActive) {return {};}
      return {
        onPress: () => onRowPress?.(row.original as TData, index),
        role: "button" as const,
        "aria-label": deriveRowLabel(row, index),
      };
    },
    [rowPressActive, onRowPress, deriveRowLabel],
  );

  const renderRow = useCallback(
    (row: (typeof tableRows)[0], index: number) => (
      <Table.Row
        {...(tableRowStateProps({
          selected: Boolean(row.getIsSelected?.()),
          zebraOn: tableZebraOn,
          index,
          pressable: rowPressActive,
        }) as any)}
        rowLocation="middle"
        key={`${row.id}-${index}`}
        aria-rowindex={index + 1}
        aria-label={withInterp(t("Row {{row}}", { row: index + 1 }), { row: index + 1 })}
        {...({
          "data-table-zebra": tableZebraOn ? (index % 2 === 0 ? "even" : "odd") : "off",
        } as any)}
        {...(getRowPressProps(row, index) as any)}
        {...(rowIntentProps(row.original) as any)}
      >
        {renderRowContent(row, index)}
      </Table.Row>
    ),
    [renderRowContent, tableZebraOn, t, getRowPressProps, rowPressActive],
  );

  const renderToolbarComponent = () => {
    if (renderToolbar) {
      return renderToolbar({
        globalFilter: state.globalFilter ?? "",
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
        globalFilter={state.globalFilter ?? ""}
        onGlobalFilterChange={actions.setGlobalFilter}
        onClearFilters={actions.clearFilters}
        onSaveView={actions.saveView}
        onLoadView={actions.loadView}
        views={state.views}
        activeViewId={state.activeViewId}
        enableViews={enableViews}
        enableGlobalSearch={enableGlobalSearch}
        enableFiltering={enableFiltering}
        isFetching={Boolean(state.isFetching)}
      />
    );
  };

  const renderPaginationComponent = () => {
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
        onPaginationChange={actions.setPagination}
        pageSizeOptions={resolvedPageSizeOptions}
        showInfo={!sm}
      />
    );
  };

  const stateContextValue = useMemo<DataTableStateContextValue<TData>>(
    () => ({ table, state, actions, computed, selectAllScope }),
    [table, state, actions, computed, selectAllScope],
  );

  const renderTableInner = useCallback(
    (tableData: TData[], setTableData?: (d: TData[]) => void) => {
      const effectiveHandleAddRow = () => {
        if (readOnly || disabled || (maxRows && tableData.length >= maxRows)) {return;}
        const newRow = { ...defaultRow, idx: tableData.length + 1 } as unknown as TData;
        setTableData?.([...tableData, newRow]);
      };
      const effectiveHandleDeleteRow = (rowIndex: number) => {
        if (readOnly || disabled || tableData.length <= minRows) {return;}
        setTableData?.(tableData.filter((_, idx) => idx !== rowIndex));
      };

      // W9 / DG-ST-01,02,04 — error wins over empty; initial load uses table skeleton.
      if (state.error) {
        return (
          <AsyncBoundary
            error={state.error}
            onRetry={onRetry}
            layout="table"
            errorTitle={t("Couldn't load table")}
            compact
            aria-label={ariaLabel ?? "Data table"}
          />
        );
      }
      if (
        (state.isLoading || infinite?.isInitialLoading) &&
        displayRows.length === 0 &&
        !state.isFetching &&
        !state.isPlaceholderData
      ) {
        return <AsyncBoundary loading layout="table" aria-label={ariaLabel ?? "Data table"} />;
      }

      return (
        <DataTableContext.Provider size={resolvedSize} compact={isCompact}>
          <DataTableStateContext.Provider value={stateContextValue}>
            <View
              flexDirection="column"
              gap="$6"
              aria-label={ariaLabel ?? "Data table"}
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
                    pointerEvents: "none" as const,
                  }
                : {})}
              {...props}
            >
              {(enableGlobalSearch || enableFiltering || enableViews) && (
                <View width="100%" {...(disabled ? disabledState.chromeKnobProps : {})}>
                  {renderToolbarComponent()}
                </View>
              )}
              {enableRowSelection && bulkBarPlacement === "top" ? (
                <View width="100%" {...(disabled ? disabledState.chromeKnobProps : {})}>
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
                filters: state.filters || [],
                onFiltersChange: actions.setFilters,
                onAddFilter: actions.addFilter,
                onRemoveFilter: actions.removeFilter,
                onClearFilters: actions.clearFilters,
                availableColumns: columns.map((col) => ({
                  id: col.id ?? "",
                  label: typeof col.header === "string" ? col.header : col.id ?? "",
                  type: mapFieldToFilterType(col.field),
                })),
              })}

              {showList ? (
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
              ) : showCards ? (
                <View flexDirection="column" gap="$2">
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
                    <View width="100%" {...(disabled ? disabledState.chromeKnobProps : {})}>
                      {renderPaginationComponent()}
                    </View>
                  )}
                </View>
              ) : (
                <ScrollView horizontal maxWidth="100%">
                  <View
                    flex={1}
                    flexDirection="column"
                    width="100%"
                    paddingBottom={enablePagination ? "$10" : undefined}
                    aria-label={`${ariaLabel ?? "Data table"} content`}
                  >
                    <Table
                      alignCells={{ x: "start", y: "center" }}
                      alignHeaderCells={{ x: "start", y: "center" }}
                      cellHeight={cellHeight}
                      {...knobProps.borderRadiusOuter}
                      width="100%"
                      aria-label={ariaLabel ?? "Data table"}
                      aria-rowcount={computed.totalPages * state.pagination.pageSize}
                      aria-colcount={
                        table.getVisibleLeafColumns().length +
                        extraColumnsBefore +
                        extraColumnsAfter
                      }
                    >
                      <Table.Head zIndex="$1" aria-label="Table headers">
                        {headerGroups.map((headerGroup, groupIndex) => (
                          <Table.Row
                            key={headerGroup.id}
                            backgroundColor="$color2"
                            rowLocation={groupIndex === 0 ? "first" : "middle"}
                            borderTopRightRadius={knobProps.borderRadiusOuter.borderRadius}
                            borderTopLeftRadius={knobProps.borderRadiusOuter.borderRadius}
                            borderBottomLeftRadius="$0"
                            borderBottomRightRadius="$0"
                            aria-rowindex={groupIndex}
                          >
                            {showRowNumbers && (
                              <Table.HeaderCell
                                cellWidth={chrome.rowNumberCol}
                                cellHeight={cellHeight as any}
                              >
                                <Text fontSize={knobProps.sizeToken} fontWeight="600">
                                  #
                                </Text>
                              </Table.HeaderCell>
                            )}
                            {enableRowExpansion && (
                              <Table.HeaderCell
                                cellWidth={chrome.expandCol}
                                cellHeight={cellHeight as any}
                              >
                                <View width={chrome.iconPx} />
                              </Table.HeaderCell>
                            )}
                            {headerGroup.headers.map((header, headerIndex) => {
                              const isSortableHeader = header.column.getCanSort();
                              const sortDirection = header.column.getIsSorted();
                              const isLastHeader =
                                headerIndex === headerGroup.headers.length - 1 && !showDeleteRow;
                              return (
                                <Table.HeaderCell
                                  key={header.id}
                                  id={`${header.column.id}-header`}
                                  onPress={
                                    isSortableHeader && !disabled
                                      ? header.column.getToggleSortingHandler()
                                      : undefined
                                  }
                                  cursor={
                                    disabled
                                      ? "not-allowed"
                                      : isSortableHeader
                                        ? "pointer"
                                        : "default"
                                  }
                                  position="relative"
                                  aria-sort={
                                    isSortableHeader
                                      ? sortDirection === "asc"
                                        ? "ascending"
                                        : sortDirection === "desc"
                                          ? "descending"
                                          : "none"
                                      : undefined
                                  }
                                  {...getColSizeProps(header.column, isLastHeader)}
                                >
                                  <View
                                    flexDirection="row"
                                    gap="$2"
                                    alignItems="center"
                                    justifyContent="flex-start"
                                    flex={1}
                                  >
                                    <Text
                                      fontSize={knobProps.sizeToken}
                                      selectable={false}
                                      userSelect="none"
                                    >
                                      {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                            header.column.columnDef.header,
                                            header.getContext(),
                                          )}
                                    </Text>
                                    {isSortableHeader && (
                                      <Text
                                        aria-hidden={true}
                                        role="presentation"
                                        color={sortDirection ? "$color10" : "$color8"}
                                      >
                                        {sortDirection === "asc" && (
                                          <CaretDownIcon size={chrome.iconPx} />
                                        )}
                                        {sortDirection === "desc" && (
                                          <CaretDownIcon
                                            size={chrome.iconPx}
                                            style={{ transform: "rotate(180deg)" }}
                                          />
                                        )}
                                        {sortDirection === false && (
                                          <CaretUpDownIcon size={chrome.iconPx} />
                                        )}
                                      </Text>
                                    )}
                                    {pinning && (
                                      <View flexDirection="row" gap="$1">
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
                                cellHeight={cellHeight as any}
                                cellLocation="last"
                              />
                            )}
                          </Table.Row>
                        ))}
                      </Table.Head>

                      <Table.Body aria-label="Table data">
                        {displayRows.length === 0 ? (
                          <Table.Row>
                            <Table.Cell>
                              {queryInFlight ? null : (
                                <EmptyState
                                  compact
                                  aria-live="polite"
                                  title={
                                    computed.hasActiveFilters
                                      ? t("No results found")
                                      : t("No data available")
                                  }
                                />
                              )}
                            </Table.Cell>
                          </Table.Row>
                        ) : isVirtualized ? (
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
                                    onEndReachedThreshold:
                                      (INFINITE_TRIGGER_ROWS * rowHeightPx) / virtualizationHeight,
                                  }
                                : {})}
                            />
                          </View>
                        ) : (
                          displayRows.map((row, index) => {
                            const mainRow = renderRow(row, index);
                            const subRow =
                              enableRowExpansion &&
                              renderSubComponent &&
                              row.getIsExpanded() &&
                              !row.subRows?.length ? (
                                <Table.Row key={`${row.id}-sub`} backgroundColor="$color2">
                                  <Table.Cell
                                    {...({
                                      colSpan:
                                        table.getVisibleLeafColumns().length +
                                        extraColumnsBefore +
                                        extraColumnsAfter,
                                    } as any)}
                                  >
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
                          })
                        )}
                      </Table.Body>

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
              )}

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
                        onVisible={infinite.loadMore}
                        leadPx={INFINITE_TRIGGER_ROWS * rowHeightPx}
                      />
                    ) : null
                  }
                />
              ) : null}

              {enableRowSelection && bulkBarPlacement === "bottom" ? (
                <View width="100%" {...(disabled ? disabledState.chromeKnobProps : {})}>
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
                    aria-label={t("Add Row")}
                  >
                    {t("Add Row")}
                  </Button>
                </View>
              )}

              {!showCards && enablePagination && !infinite && (
                <View width="100%" {...(disabled ? disabledState.chromeKnobProps : {})}>
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
      sm,
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
      <Field form={resolvedForm} name={name!} mode="array">
        {(field) => {
          const formData = (field.state.value as TData[]) ?? [];
          const setFormData = (next: TData[]) =>{  field.handleChange(next as any); };
          return renderTableInner(formData, setFormData);
        }}
      </Field>
    );
  }

  return renderTableInner(data, onDataChange);
}

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
