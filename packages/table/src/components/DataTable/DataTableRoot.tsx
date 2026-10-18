/**
 * DataTableRoot - core table rendering component.
 *
 * Renders the table structure: headers, body rows, cells, footer.
 * Handles form mode vs standalone mode, toolbar, pagination, mobile
 * cards, virtualization, and keyboard navigation.
 *
 * This component calls useDataTable internally and provides state
 * via both DataTableContext (styled) and DataTableStateContext (regular).
 */

import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { Button, Checkbox, Field, useFormField } from '@repo/forms';
import { Table } from '@repo/table-primitives';
import { ensureFocusVisibleRing, useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary, EmptyState, Tooltip, useDirection } from '@repo/ui';
import { flexRender } from '@tanstack/react-table';
import type { Cell, ColumnDef, Header, HeaderGroup, Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, isWeb, useMedia } from 'tamagui';
import type { TamaguiElement } from 'tamagui';

import { useDataTable } from '../../hooks/use-data-table';
import { useDataTableKeyboard } from '../../hooks/use-data-table-keyboard';
import { useDragScroll } from '../../hooks/use-drag-scroll';
import { warnColumnWidthIgnored } from '../../shared/dev-warn';
import type { DataTableColumn, DataTableData, DataTableField, DataTableProps, SelectAllScope } from '../../types';
import { alignToFlex, getDefaultColumnAlign } from '../../utils/column-align';
import { mapFieldToFilterType } from '../../utils/filter-fields';
import { INFINITE_TRIGGER_ROWS } from '../../utils/pagination-defaults';
import { isInteractiveInnerTarget } from '../../utils/row-press';
import { bidiIsolate, withInterp } from '../../utils/with-interp';
import { ColumnHeaderFilter } from '../ColumnHeaderFilter';
import { DataTableBulkActions } from '../DataTableBulkActions';
import { DataTableCell } from '../DataTableCell';
import { DataTableColumnPinning } from '../DataTableColumnPinning';
import { DataTableFilterChips } from '../DataTableFilterChips';
import { DataTablePagination } from '../DataTablePagination';
import { DataTableCardToolbar, DataTableToolbar } from '../DataTableToolbar';

import { CellContent } from './CellContent';
import { dataTableChrome, resolveDataTableIntent, rowIntentProps } from './data-table-chrome';
import { DataTableContext } from './data-table-context';
import { DataTableStateContext } from './data-table-state-context';
import type { DataTableFilterUi, DataTableStateContextValue, FilterEditTarget } from './data-table-state-context';
import { DataTableCardControls, DataTableCardSortControl } from './DataTableCardControls';
import { DataTableDocumentList } from './DataTableDocumentList';
import { DataTableInfiniteTail } from './DataTableInfiniteTail';
import { DataTableMobileCards } from './DataTableMobileCards';
import { DataTableVirtualized } from './DataTableVirtualized';
import { tableCellKeyboardProps, tableRowStateProps } from './row-state-chrome';

const ROW_PRESS_SELECTOR = '[data-row-press="true"]';

/** Returns the field type for a column, defaulting to "input" */
const getColumnField = (column: DataTableColumn): DataTableField => column.field ?? 'input';

/** Resolve DG-TBL-01 column alignment for a column def. */
const resolveColumnAlign = (column: DataTableColumn) =>
  getDefaultColumnAlign({
    id: column.id,
    align: column.align,
    field: getColumnField(column),
    fieldProps: column.fieldProps,
    meta: column.meta,
  });

/** A TanStack column def of this table, as the DataTableColumn it was built from. */
const asDataTableColumn = <T,>(columnDef: ColumnDef<T>): DataTableColumn =>
  // SAFETY: DataTableRoot builds every TanStack column from its DataTableColumn `columns` prop
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
  columnDef as DataTableColumn;

/** A column header when it is plain text (it may also be a render function). */
const headerText = <T,>(header: ColumnDef<T>['header']): string | undefined =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- header is a string-or-renderer union; typeof selects the text arm
  typeof header === 'string' ? header : undefined;

const resolveSizeFromToken = (sizeToken: string): 'sm' | 'md' | 'lg' => {
  if (sizeToken === '$3') {
    return 'sm';
  }
  if (sizeToken === '$5') {
    return 'lg';
  }
  return 'md';
};

const CELL_HEIGHT_BY_SIZE = { sm: '$3', md: '$4', lg: '$5' } as const;

type EdgeLocation = 'first' | 'middle' | 'last';

const edgeLocation = (isFirst: boolean, isLast: boolean): EdgeLocation => {
  if (isFirst) {
    return 'first';
  }
  return isLast ? 'last' : 'middle';
};

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

const ariaSortFor = (isSortable: boolean, direction: false | 'asc' | 'desc') => {
  const sort = direction === false ? 'none' : ARIA_SORT[direction];
  return isSortable ? sort : undefined;
};

const CURSOR_POINTER = 'pointer';
const CURSOR_NOT_ALLOWED = 'not-allowed';
const PINNED_CELL_BACKGROUND = 'var(--color2)';

// mapFieldToFilterType moved to utils/filterFields (shared with the filter
// model — LC-16, one mapping).

export interface DataTableRootProps<TData extends DataTableData = DataTableData> extends DataTableProps<TData> {
  /** Compound sub-components rendered as children */
  children?: React.ReactNode;
  /** Structural modifier: compact layout */
  compact?: boolean;
  /** Structural modifier: disabled state */
  disabled?: boolean;
  /** Structural intent — joins the resolver path (audit 16). */
  accent?: boolean;
  error?: boolean;
  warning?: boolean;
  success?: boolean;
}

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- the root composes every DataTable mode (grid, cards, list, virtualized, form); its parts already live in sibling modules
export const DataTableRoot = <TData extends DataTableData = DataTableData>({
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
  enableColumnPinning = false,
  maxPinnedColumns = 3,
  enableGrouping = false,
  enableKeyboardNavigation = false,
  onRowPress,
  rowLabel,
  enableRowSelection = false,
  selectAllScope: selectAllScopeProp,
  bulkActions,
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
  renderFilters: _renderFilters,
  className,
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- the branches are prop defaults and per-mode layout switches
}: DataTableRootProps<TData>) => {
  warnColumnWidthIgnored({ columnLayout, enableColumnResizing, columns });
  const { t } = useTranslation();
  const { sm } = useMedia();
  // Resolved responsive layout: cards below `$sm` (W11 compact class) unless
  // pinned via the `layout` prop. Same table state drives both layouts.
  const showList = layout === 'list';
  const showCards = !showList && (layout === 'cards' || (layout === 'auto' && !sm));
  const intent = resolveDataTableIntent({ accent, error, warning, success });
  const { knobProps, disabledState } = useResolvedKnobs({
    intent,
    component: 'DataTable',
    compact,
  });
  const chrome = dataTableChrome(knobProps.sizeToken);
  const rowHeightPx = chrome.rowPx;
  const selectionColWidth = chrome.selectionCol;
  // Collapsed expand-caret points toward inline-end, so it mirrors in RTL via
  // glyph swap (useDirection, Axiom 15); rotation sign flips so expanded
  // still points down.
  const isRTL = useDirection() === 'rtl';
  const ExpandCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const expandedCaretRotation = isRTL ? 'rotate(-90deg)' : 'rotate(90deg)';
  const tableZebraOn = knobProps.tableZebra === 'on';
  const bulkBarPlacement = knobProps.bulkBarPlacement === 'bottom' ? 'bottom' : 'top';
  // House selectAllScope knob (DG-TBL-03): prop overrides knob; default page.
  const selectAllScope: SelectAllScope =
    selectAllScopeProp ?? (knobProps.selectAllScope === 'filtered' ? 'filtered' : 'page');
  const { resolvedForm } = useFormField({ form: formProp });

  const isFormMode = name !== undefined && name !== '' && Boolean(resolvedForm);

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
    enableColumnPinning,
    maxPinnedColumns,
    enableGrouping,
    enableKeyboardNavigation,
    enableRowSelection,
    rowCount,
    pageCount,
    isLoading: isLoadingProp,
    isFetching: isFetchingProp,
  });

  const resolvedBulkActions = bulkActions ?? [];

  const selectAllChecked =
    enableRowSelection &&
    (selectAllScope === 'filtered' ? table.getIsAllRowsSelected() : table.getIsAllPageRowsSelected());
  let selectAllIndeterminate = false;
  if (enableRowSelection) {
    selectAllIndeterminate =
      selectAllScope === 'filtered'
        ? table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
        : table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
  }

  const toggleSelectAll = useCallback(() => {
    if (selectAllScope === 'filtered') {
      table.toggleAllRowsSelected();
    } else {
      table.toggleAllPageRowsSelected();
    }
  }, [selectAllScope, table]);

  const resolvedSize: 'sm' | 'md' | 'lg' = size ?? resolveSizeFromToken(knobProps.sizeToken);

  const cellHeight = CELL_HEIGHT_BY_SIZE[resolvedSize];

  const headerGroups = table.getHeaderGroups();
  const rowModelRows = table.getRowModel().rows;
  // Infinite mode reveals accumulated pages only; loader mode's row model is
  // already just the accumulated rows, so the slice is a no-op there.
  const { infinite } = computed;
  const tableRows = infinite ? rowModelRows.slice(0, infinite.visibleRowCount) : rowModelRows;
  const heldRowsRef = useRef(tableRows);
  if (tableRows.length > 0) {
    heldRowsRef.current = tableRows;
  }
  const stateInFlight = state.isFetching === true || state.isPlaceholderData === true || state.isLoading === true;
  const infiniteInFlight = infinite?.isAppending === true || infinite?.isInitialLoading === true;
  const queryInFlight = stateInFlight || infiniteInFlight;
  // Hold the last rows on screen while a query is in flight with none yet.
  const holdPreviousRows = tableRows.length === 0 && queryInFlight && heldRowsRef.current.length > 0;
  const displayRows = holdPreviousRows ? heldRowsRef.current : tableRows;
  const footerGroups = table.getFooterGroups();

  const hasFooter = footerGroups.some((group: HeaderGroup<TData>) =>
    group.headers.some((header: Header<TData, unknown>) => header.column.columnDef.footer != null),
  );

  const allRowsLength = displayRows.length + headerGroups.length + (hasFooter ? footerGroups.length : 0);
  const rowCounter = useRef(-1);
  rowCounter.current = -1;
  const rowLocationFor = (rowIndex: number) => edgeLocation(rowIndex === 0, rowIndex === allRowsLength - 1);

  const getColSizeProps = useCallback(
    (col: {
      getSize: () => number;
      getIsPinned?: () => 'left' | 'right' | false;
      columnDef: { size?: number; minSize?: number; maxSize?: number };
    }) => {
      const hasExplicitSize = col.columnDef.size != null;
      // A pinned column must render at exactly getSize(): getStickyStyle sums
      // getSize() of preceding pinned columns for the sticky inset, so a
      // flexed pinned column (equal layout) would drift every offset after
      // the first. min/max clamp the box under any flex resolution.
      const isPinned = enableColumnPinning && Boolean(col.getIsPinned?.());
      if (isPinned) {
        const pinnedSize = col.getSize();
        return {
          width: pinnedSize,
          minWidth: pinnedSize,
          maxWidth: pinnedSize,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 'auto' as const,
        };
      }
      if (columnLayout === 'equal' && !enableColumnResizing) {
        return {};
      }
      // Scroll layout needs one concrete width per column (from the column
      // def, TanStack default otherwise) so independent flex rows stay
      // aligned while the table grows past its container.
      if (hasExplicitSize || enableColumnResizing || columnLayout === 'scroll') {
        return { width: col.getSize() };
      }
      return {};
    },
    [enableColumnResizing, columnLayout, enableColumnPinning],
  );

  // HTML5 column drag-and-drop (web only). Reorder swaps the dragged column
  // and the drop-target column in `table.getState().columnOrder`. Native gets
  // no DnD UI for now — apps can call `table.setColumnOrder(...)` directly.
  const dnd = useMemo(() => {
    if (!enableColumnOrdering || !isWeb) {
      return null;
    }
    return {
      onDragStart: (e: React.DragEvent<HTMLElement>, columnId: string) => {
        e.dataTransfer?.setData('application/x-table-column-id', columnId);
        // oxlint-disable-next-line typescript/strict-boolean-expressions -- synthetic and jsdom drag events can carry no dataTransfer despite the DOM typing
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
        }
      },
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        // oxlint-disable-next-line typescript/strict-boolean-expressions -- synthetic and jsdom drag events can carry no dataTransfer despite the DOM typing
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
      },
      onDrop: (e: React.DragEvent<HTMLElement>, targetColumnId: string) => {
        e.preventDefault();
        const sourceId = e.dataTransfer?.getData('application/x-table-column-id');
        if (!sourceId || sourceId === targetColumnId) {
          return;
        }
        const order = table.getAllLeafColumns().map((c) => c.id);
        const currentOrder = table.getState().columnOrder.length ? [...table.getState().columnOrder] : order;
        const fromIdx = currentOrder.indexOf(sourceId);
        const toIdx = currentOrder.indexOf(targetColumnId);
        if (fromIdx === -1 || toIdx === -1) {
          return;
        }
        const next = [...currentOrder];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, sourceId);
        table.setColumnOrder(next);
      },
    };
  }, [enableColumnOrdering, table]);

  const bodyScrollRef = useRef<HTMLDivElement>(null);
  // isWeb, not window-presence: RN (Hermes) aliases a window global, but
  // react-virtual needs real DOM scroll elements — keep it inert on native.
  const isVirtualized = enableVirtualization && virtualizationHeight != null && virtualizationHeight > 0 && isWeb;

  // Infinite mode adds one tail row to the virtual count while more pages
  // exist: it renders the appending skeleton and extends the scroll range so
  // appended pages grow geometry instead of collapsing it.
  const hasInfiniteTail = Boolean(infinite && !infinite.exhausted && tableRows.length > 0);
  const virtualizer = useVirtualizer({
    count: displayRows.length + (hasInfiniteTail ? 1 : 0),
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => rowHeightPx,
    overscan: virtualizationOverscan,
    enabled: isVirtualized,
  });

  const virtualItems = isVirtualized ? virtualizer.getVirtualItems() : [];
  const totalSize = isVirtualized ? virtualizer.getTotalSize() : 0;

  // ---- Infinite mode: load-more triggers ----

  // oxlint-disable-next-line unicorn/no-useless-undefined -- React 19's useRef requires an explicit initial value
  const loadMoreRef = useRef<(() => void) | undefined>(undefined);
  loadMoreRef.current = infinite?.loadMore;

  // Virtualized: append when the last rendered virtual row nears the tail
  // (standard TanStack Virtual infinite pattern — overscan gives lead time).
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1;
  const hasInfinite = infinite !== undefined;
  const infiniteExhausted = infinite?.exhausted;
  React.useEffect(() => {
    if (!hasInfinite || !isVirtualized || infiniteExhausted === true) {
      return;
    }
    if (lastVirtualIndex < 0) {
      return;
    }
    if (lastVirtualIndex >= tableRows.length - INFINITE_TRIGGER_ROWS) {
      loadMoreRef.current?.();
    }
  }, [infiniteExhausted, isVirtualized, lastVirtualIndex, tableRows.length, hasInfinite]);

  // Non-virtualized (grid or card list): IntersectionObserver sentinel below
  // the content. Re-observed on row-count changes so short pages keep loading
  // while the sentinel stays on screen.
  const sentinelRef = useRef<TamaguiElement | null>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    let observer: IntersectionObserver | null = null;
    // On web the sentinel View's host is a DOM element.
    const wantsMore = hasInfinite && !isVirtualized && infiniteExhausted !== true;
    const hasObserver = isWeb && typeof IntersectionObserver !== 'undefined';
    const canObserve = wantsMore && hasObserver && node instanceof Element;
    if (canObserve) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              loadMoreRef.current?.();
            }
          }
        },
        { rootMargin: `${INFINITE_TRIGGER_ROWS * rowHeightPx}px` },
      );
      observer.observe(node);
    }
    return () => {
      observer?.disconnect();
    };
  }, [hasInfinite, infiniteExhausted, isVirtualized, tableRows.length, rowHeightPx]);

  const isFlexLayout = columnLayout !== 'auto';
  const displayMode = isFlexLayout ? ('flex' as const) : ('table' as const);

  // Column pinning shares the scroll layout's horizontal geometry: the
  // content View is the ONE horizontal scrollport (header + body + footer
  // rows all ride inside it) and the Table floors at max-content so rows
  // never overflow their own boxes. Sticky resolves against the NEAREST
  // scroll container, so with pinning the Table (overflow:hidden base) and
  // Table.Body (overflowY:auto flex variant, which computes overflow-x:auto)
  // must be overridden to overflow:visible — otherwise the body scrolls on
  // its own while the header stays put and pinned cells stick to the wrong
  // scrollport (the LTR pinning breakage).
  const hScroll = isWeb && isFlexLayout && (columnLayout === 'scroll' || enableColumnPinning);
  // In the horizontal-overflow modes, body cell content is clipped to the
  // cell box: flex-mode cells default to overflow:visible, so overlong text
  // paints over neighbor cells and bleeds out from under sticky pinned
  // columns (LC-10 containment at the cell grain).
  const clipBodyCells = hScroll;

  const cellFlexProps = useMemo(() => {
    if (!isFlexLayout) {
      return {};
    }
    if (columnLayout === 'scroll') {
      // flexBasis auto, not the `flex: 0` shorthand: RN expands `flex: 0` to
      // basis 0, which overrides per-column widths and crushes every cell to
      // the minWidth floor (contents then overflow and get clipped).
      return { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' as const, minWidth: 0 };
    }
    // Same flexBasis trap as the scroll branch above: `flex: 0` expands to
    // basis 0 and the per-column width from getColSizeProps loses, crushing
    // every resizable cell to the min-width floor (content then overlaps).
    if (enableColumnResizing) {
      return { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' as const, minWidth: 0 };
    }
    return { flex: 1, flexShrink: 1, flexGrow: 1, flexBasis: 0, minWidth: 0 };
  }, [isFlexLayout, columnLayout, enableColumnResizing]);

  // Columns offered by the card-layout filter builder (grid mode filters
  // through ColumnHeaderFilter in the headers instead).
  const cardFilterColumns = useMemo(
    () =>
      columns.flatMap((col) => {
        if (col.enableColumnFilter === false) {
          return [];
        }
        const id = col.id !== undefined && col.id !== '' ? col.id : String(col.accessorKey ?? '');
        if (id === '') {
          return [];
        }
        return [{ id, label: headerText(col.header) ?? id, type: mapFieldToFilterType(col.field) }];
      }),
    [columns],
  );

  // DataTableColumnPinning is a hook-style helper (it calls useState/useMemo/
  // useCallback internally), so it must run unconditionally at the top level
  // of this component. Calling it inside useMemo crashed with "Should have a
  // queue. You are likely calling Hooks conditionally."
  const pinningHelpers = DataTableColumnPinning({
    table,
    maxPinnedColumns,
    allowPinning: true,
    disabled,
  });
  const pinning = enableColumnPinning ? pinningHelpers : null;

  const keyboardNav = useDataTableKeyboard({
    table,
    enabled: enableKeyboardNavigation && !disabled,
    viewportHeight: virtualizationHeight ?? 400,
    onScrollToRow: isVirtualized
      ? (idx) => {
          virtualizer.scrollToIndex(idx, { align: 'auto' });
        }
      : undefined,
    onRowActivate: enableRowExpansion
      ? (row) => {
          if (row.getCanExpand()) {
            row.toggleExpanded();
          }
        }
      : undefined,
  });
  const [focusedColIndex, setFocusedColIndex] = useState(0);

  const isSSR = typeof window === 'undefined';

  // ---- Row press (onRowPress): the ROW is one pressable unit ----

  const rowPressActive = Boolean(onRowPress) && !disabled;
  // LC-49 roving anchor: the row set exposes exactly one tab stop — the
  // focused row while focus is inside the set, else the first row.
  const [rowPressAnchor, setRowPressAnchor] = useState(0);
  const [rowPressHasFocus, setRowPressHasFocus] = useState(false);
  const effectiveRowPressAnchor = Math.min(rowPressAnchor, Math.max(displayRows.length - 1, 0));

  // Row identity for accessible names (DG-A11Y-06): consumer accessor →
  // first visible column's cell value → undefined (caller picks its own
  // positional fallback). Shared by the row-press label and the selection
  // checkbox name so "which row is this control for" reads the same
  // everywhere.
  const deriveRowIdentity = useCallback(
    (row: Row<TData>): string | undefined => {
      const fromAccessor = rowLabel?.(row.original);
      if (fromAccessor !== undefined && fromAccessor !== '') {
        return fromAccessor;
      }
      let firstCellValue: unknown;
      try {
        firstCellValue = row.getVisibleCells()[0]?.getValue();
      } catch {
        // Safe to continue: a throwing accessor leaves firstCellValue undefined (no identity)
      }
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- cell values are arbitrary consumer row data; typeof is the parse
      if ((typeof firstCellValue === 'string' && firstCellValue.length > 0) || typeof firstCellValue === 'number') {
        return String(firstCellValue);
      }
      return undefined;
    },
    [rowLabel],
  );

  // Accessible name per pressable row: identity, else positional "Row {{row}}".
  const deriveRowLabel = useCallback(
    (row: Row<TData>, rowIndex: number): string =>
      deriveRowIdentity(row) ?? withInterp(t('Row {{row}}', { row: rowIndex + 1 }), { row: rowIndex + 1 }),
    [deriveRowIdentity, t],
  );

  // Selection-toggle name: row identity beats a bare index ("Select row
  // Bulbasaur", falling back to "Select row 3") so AT and automation can
  // target a specific row's checkbox by name.
  const deriveSelectRowLabel = useCallback(
    (row: Row<TData>, rowIndex: number): string => {
      const identity = deriveRowIdentity(row) ?? String(rowIndex + 1);
      return withInterp(t('Select row {{row}}', { row: identity }), { row: identity });
    },
    [deriveRowIdentity, t],
  );

  const activateRowPress = useCallback(
    (row: Row<TData>, rowIndex: number) => {
      onRowPress?.(row.original, rowIndex);
    },
    [onRowPress],
  );

  /**
   * Press/keyboard/AT props for one pressable row (grid `<tr>`, virtualized
   * row host, or mobile card). Spread LAST so the roving tabIndex overrides
   * the static -1 the grid row carries otherwise.
   *
   * - Pointer: activation skips presses originating on inner interactive
   *   elements (isInteractiveInnerTarget — the stopPropagation contract's
   *   defensive arm).
   * - Keyboard (LC-50): Enter AND Space each synthesize exactly one
   *   activation (repeat + defaultPrevented guarded); arrows/Home/End rove
   *   within the row set; Shift+Tab exits (no key trap).
   */
  const getRowPressProps = useCallback(
    (row: Row<TData>, rowIndex: number, variant: 'row' | 'card' = 'row') => {
      if (!rowPressActive) {
        return {};
      }
      const handlePress = (
        event: { defaultPrevented?: boolean; target?: unknown; nativeEvent?: { target?: unknown } } | undefined,
      ) => {
        if (event?.defaultPrevented === true) {
          return;
        }
        const targetEl = event?.target ?? event?.nativeEvent?.target;
        if (isWeb && typeof Element !== 'undefined' && targetEl instanceof Element) {
          const boundary = targetEl.closest(ROW_PRESS_SELECTOR);
          if (isInteractiveInnerTarget(targetEl, boundary)) {
            return;
          }
        }
        activateRowPress(row, rowIndex);
      };
      return {
        'aria-label': deriveRowLabel(row, rowIndex),
        onPress: handlePress,
        cursor: CURSOR_POINTER,
        // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- non-card rows must not carry a role key at all (the host keeps its own role)
        ...(variant === 'card' ? { role: 'button' as const } : {}),
        // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- native/SSR rows omit the web focus props entirely
        ...(isWeb && !isSSR
          ? {
              tabIndex: rowIndex === effectiveRowPressAnchor ? 0 : -1,
              focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
              'data-row-press': 'true',
              'data-row-keyboard-focus': rowIndex === effectiveRowPressAnchor && rowPressHasFocus ? 'true' : 'false',
              onFocus: (e: React.FocusEvent) => {
                // Only a focused ROW moves the anchor; focus on an inner
                // control (own tab stop) leaves the roving state alone.
                if (e.target === e.currentTarget) {
                  setRowPressAnchor(rowIndex);
                  setRowPressHasFocus(true);
                }
              },
              onBlur: (e: React.FocusEvent) => {
                const next = e.relatedTarget;
                if (!(next instanceof Element) || !next.closest(ROW_PRESS_SELECTOR)) {
                  setRowPressAnchor(0);
                  setRowPressHasFocus(false);
                }
              },
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.defaultPrevented) {
                  return;
                }
                // Keys on focused inner controls belong to those controls.
                if (e.target !== e.currentTarget) {
                  return;
                }
                const { key } = e;
                if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                  // preventDefault stops Space page-scroll; stopPropagation
                  // keeps the container-level keyboard nav (Excel mode) from
                  // double-activating the same physical key.
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.repeat) {
                    return;
                  }
                  activateRowPress(row, rowIndex);
                  return;
                }
                if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
                  e.preventDefault();
                  e.stopPropagation();
                  const rowEl = e.currentTarget;
                  if (!(rowEl instanceof HTMLElement)) {
                    return;
                  }
                  const scope = rowEl.closest('[data-row-press-scope="true"]') ?? rowEl.ownerDocument;
                  const pressRows = [...scope.querySelectorAll<HTMLElement>(ROW_PRESS_SELECTOR)];
                  const currentIdx = pressRows.indexOf(rowEl);
                  if (currentIdx === -1) {
                    return;
                  }
                  let nextIdx = 0;
                  if (key === 'End') {
                    nextIdx = pressRows.length - 1;
                  } else if (key !== 'Home') {
                    const step = key === 'ArrowDown' ? 1 : -1;
                    nextIdx = Math.min(Math.max(currentIdx + step, 0), pressRows.length - 1);
                  }
                  pressRows[nextIdx]?.focus();
                }
              },
            }
          : {}),
      };
    },
    [rowPressActive, deriveRowLabel, activateRowPress, effectiveRowPressAnchor, isSSR, rowPressHasFocus],
  );

  const handleCellChange = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a cell value is whatever the column's field editor emits; it is forwarded untouched to the consumer
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

  const handleAddRow = useCallback(() => {
    const atMaxRows = maxRows !== undefined && maxRows !== 0 && data.length >= maxRows;
    if (readOnly || disabled || atMaxRows) {
      return;
    }
    // SAFETY: defaultRow is the consumer's template for a new TData row
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see the SAFETY note above
    const newRow = { ...defaultRow, idx: data.length + 1 } as unknown as TData;
    if (!isFormMode && onDataChange) {
      onDataChange([...data, newRow]);
    }
  }, [readOnly, disabled, maxRows, data, defaultRow, isFormMode, onDataChange]);

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
      const columnDef = asDataTableColumn(cell.column.columnDef);
      const columnId = cell.column.id;
      const value = cell.getValue();

      if (Boolean(columnDef.cell) && columnDef.field === undefined) {
        // DG-TBL-01 for CUSTOM cell renderers: the cell box's own
        // justifyContent no-ops in the semantic-table displayMode
        // (display: table-cell is not a flex container), so the column's
        // resolved alignment rides this full-width flex container instead —
        // consumers never self-align. The built-in DataTableCell branch
        // below aligns internally (CellWrapper) and stays unwrapped.
        const customAlign = resolveColumnAlign({
          ...columnDef,
          id: cell.column.id,
        });
        return (
          <View
            width="100%"
            minWidth={0}
            flexDirection="row"
            alignItems="center"
            justifyContent={alignToFlex(customAlign)}
            {...{ 'data-cell-align': customAlign }}>
            <CellContent
              cellDef={columnDef.cell}
              ctx={cell.getContext()}
              fontSize={knobProps.label.fontSize}
            />
          </View>
        );
      }

      const columnField = getColumnField(columnDef);
      const dateRangeLinkedColumn = columnDef.fieldProps?.dateRangeLinkedColumn;
      let linkedValue: unknown;
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a cell value is whatever the column's field editor emits; it is forwarded untouched to the consumer
      let onLinkedChange: ((value: unknown) => void) | undefined;

      if (dateRangeLinkedColumn !== undefined && dateRangeLinkedColumn !== '') {
        linkedValue = rowData[dateRangeLinkedColumn];
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a cell value is whatever the column's field editor emits; it is forwarded untouched to the consumer
        onLinkedChange = (newValue: unknown) => {
          void handleCellChange(rowIndex, dateRangeLinkedColumn, newValue);
        };
      }

      return (
        <DataTableCell
          value={value}
          field={columnField}
          fieldProps={columnDef.fieldProps}
          onChange={(newValue) => {
            void handleCellChange(rowIndex, columnId, newValue);
          }}
          readOnly={readOnly}
          disabled={disabled}
          columnId={columnId}
          columnLabel={headerText(columnDef.header)}
          rowIndex={rowIndex}
          rowData={rowData}
          size={knobProps.sizeToken}
          compact={isCompact}
          linkedValue={linkedValue}
          onLinkedChange={onLinkedChange}
        />
      );
    },
    [handleCellChange, readOnly, disabled, knobProps.sizeToken, knobProps.label.fontSize, isCompact],
  );

  const extraColumnsBefore = (enableRowSelection ? 1 : 0) + (showRowNumbers ? 1 : 0) + (enableRowExpansion ? 1 : 0);
  const extraColumnsAfter = showDeleteRow && !readOnly ? 1 : 0;
  const excelCellNav = enableKeyboardNavigation && !rowPressActive && !disabled;
  const gridColCount = Math.max(table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter, 1);
  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enableKeyboardNavigation || disabled) {
        return;
      }
      if (excelCellNav) {
        if (event.key === 'ArrowRight') {
          setFocusedColIndex((i) => Math.min(i + 1, gridColCount - 1));
        } else if (event.key === 'ArrowLeft') {
          setFocusedColIndex((i) => Math.max(i - 1, 0));
        }
      }
      keyboardNav.handleKeyDown(event);
    },
    [disabled, enableKeyboardNavigation, excelCellNav, gridColCount, keyboardNav],
  );

  const getStickyStyle = useCallback(
    (columnId: string) => {
      if (!enableColumnPinning || !pinning) {
        return null;
      }
      const colPinning = table.getState().columnPinning ?? { left: [], right: [] };
      const leftPinned = colPinning.left ?? [];
      const rightPinned = colPinning.right ?? [];
      const leftIdx = leftPinned.indexOf(columnId);
      const rightIdx = rightPinned.indexOf(columnId);
      const sumColumnSizes = (ids: string[]) =>
        ids.reduce((total, id) => total + (table.getColumn(id)?.getSize() ?? 0), 0);

      if (leftIdx !== -1) {
        let leftOffset = sumColumnSizes(leftPinned.slice(0, leftIdx));
        if (enableRowSelection) {
          leftOffset += selectionColWidth;
        }
        if (enableRowExpansion) {
          leftOffset += chrome.expandCol;
        }
        if (showRowNumbers) {
          leftOffset += chrome.rowNumberCol;
        }
        // Logical inset (RTL backlog #2): TanStack's "left" bucket is the
        // reading-start side, so the sticky offset must flip with direction.
        return {
          position: 'sticky' as const,
          insetInlineStart: leftOffset,
          zIndex: 2,
          backgroundColor: '$color2',
        };
      }

      if (rightIdx !== -1) {
        let rightOffset = sumColumnSizes(rightPinned.slice(rightIdx + 1));
        if (showDeleteRow && !readOnly) {
          rightOffset += chrome.deleteCol;
        }
        return {
          position: 'sticky' as const,
          insetInlineEnd: rightOffset,
          zIndex: 2,
          backgroundColor: '$color2',
        };
      }

      return null;
    },
    [
      enableColumnPinning,
      pinning,
      table,
      enableRowSelection,
      enableRowExpansion,
      showRowNumbers,
      showDeleteRow,
      readOnly,
      selectionColWidth,
      chrome.expandCol,
      chrome.rowNumberCol,
      chrome.deleteCol,
    ],
  );

  const renderRowContent = useCallback(
    // `cellElement="div"` is the virtualized escape hatch: virtual rows are
    // absolutely-positioned <div role="row"> hosts, and a real <td> is not a
    // valid <div> child (React validateDOMNesting + SSR reparenting). The
    // div cells keep role="cell" from the primitive, preserving the
    // roles-based grid semantics.
    (row: Row<TData>, rowIndex: number, _isLastRow: boolean, cellElement?: 'div') => {
      const rowData = row.original;
      const cellRenderProps = cellElement ? { render: cellElement } : {};
      let cellSlot = 0;
      const cellNavProps = () => {
        const slot = cellSlot;
        cellSlot += 1;
        if (!excelCellNav || !keyboardNav.isNavigating) {
          return {};
        }
        return tableCellKeyboardProps(rowIndex === keyboardNav.focusedRowIndex && slot === focusedColIndex);
      };

      return (
        <>
          {enableRowSelection && (
            <Table.Cell
              {...cellRenderProps}
              {...cellNavProps()}
              cellWidth={selectionColWidth}
              cellHeight={cellHeight}
              cellLocation="first"
              justifyContent="center">
              <Checkbox
                checked={row.getIsSelected()}
                onChange={(checked) => {
                  if (disabled) {
                    return;
                  }
                  row.toggleSelected(checked !== false);
                }}
                disabled={disabled}
                checkboxProps={{
                  // Row identity in the name so repeated per-row actions are
                  // differentiated for screen readers (DG-A11Y-06). The
                  // aria-label rides the role="checkbox" frame itself.
                  'aria-label': deriveSelectRowLabel(row, rowIndex),
                }}
                compact={isCompact}
              />
            </Table.Cell>
          )}

          {showRowNumbers && (
            <Table.Cell
              {...cellRenderProps}
              {...cellNavProps()}
              cellWidth={chrome.rowNumberCol}
              cellHeight={cellHeight}
              cellLocation={enableRowSelection ? 'middle' : 'first'}>
              <Text
                fontSize={knobProps.sizeToken}
                color="$color10">
                {rowIndex + 1}
              </Text>
            </Table.Cell>
          )}

          {enableRowExpansion && (
            <Table.Cell
              {...cellRenderProps}
              {...cellNavProps()}
              cellWidth={chrome.expandCol + row.depth * chrome.indent}
              cellHeight={cellHeight}
              cellLocation={enableRowSelection || showRowNumbers ? 'middle' : 'first'}
              paddingLeft={0}
              paddingRight={0}>
              <View
                flexDirection="row"
                alignItems="center"
                height="100%">
                {row.depth > 0 && (
                  <View
                    flexDirection="row"
                    alignItems="center"
                    height="100%"
                    width={row.depth * chrome.indent}>
                    {Array.from({ length: row.depth }).map((_, i) => (
                      <View
                        key={i}
                        width={chrome.indent}
                        height="100%"
                        alignItems="center"
                        justifyContent="center">
                        <View
                          position="absolute"
                          width={1}
                          height="100%"
                          backgroundColor="$color6"
                          left={chrome.indent / 2}
                        />
                        {i === row.depth - 1 && (
                          <View
                            position="absolute"
                            height={1}
                            width={chrome.indent / 2}
                            backgroundColor="$color6"
                            left={chrome.indent / 2}
                          />
                        )}
                      </View>
                    ))}
                  </View>
                )}
                {row.getCanExpand() ? (
                  <View
                    onPress={() => {
                      if (disabled) {
                        return;
                      }
                      row.toggleExpanded();
                    }}
                    cursor={disabled ? CURSOR_NOT_ALLOWED : CURSOR_POINTER}
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
                    }
                    hoverStyle={{ backgroundColor: '$color4' }}
                    borderRadius="$2">
                    <ExpandCaretIcon
                      size={chrome.iconPx}
                      style={{
                        transform: row.getIsExpanded() ? expandedCaretRotation : 'none',
                      }}
                    />
                  </View>
                ) : (
                  <View width={chrome.expandCol} />
                )}
              </View>
            </Table.Cell>
          )}

          {row.getVisibleCells().map((cell: Cell<TData, unknown>, cellIndex: number) => {
            const isFirstDataCell = cellIndex === 0 && !enableRowSelection && !showRowNumbers && !enableRowExpansion;
            const isLastDataCell = cellIndex === row.getVisibleCells().length - 1 && !showDeleteRow;
            const cellLocation = edgeLocation(isFirstDataCell, isLastDataCell);
            const stickyStyle = getStickyStyle(cell.column.id);
            const columnAlign = resolveColumnAlign({
              ...asDataTableColumn(cell.column.columnDef),
              id: cell.column.id,
            });

            return (
              <Table.Cell
                key={cell.id}
                {...cellRenderProps}
                {...cellNavProps()}
                {...cellFlexProps}
                {...getColSizeProps(cell.column)}
                cellHeight={cellHeight}
                cellLocation={cellLocation}
                justifyContent={alignToFlex(columnAlign)}
                data-align={columnAlign}
                {...(clipBodyCells ? { overflow: 'hidden' as const } : {})}
                {...(isWeb && stickyStyle
                  ? {
                      style: {
                        position: 'sticky' as const,
                        ...('insetInlineStart' in stickyStyle && {
                          insetInlineStart: stickyStyle.insetInlineStart,
                        }),
                        ...('insetInlineEnd' in stickyStyle && {
                          insetInlineEnd: stickyStyle.insetInlineEnd,
                        }),
                        zIndex: 2,
                        backgroundColor: PINNED_CELL_BACKGROUND,
                      },
                    }
                  : {})}>
                {renderCellContent(cell, rowIndex, rowData)}
              </Table.Cell>
            );
          })}

          {showDeleteRow && !readOnly && (
            <Table.Cell
              {...cellRenderProps}
              {...cellNavProps()}
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
      chrome.indent,
      chrome.rowNumberCol,
      chrome.expandCol,
      chrome.deleteCol,
      chrome.iconPx,
      selectionColWidth,
      enableRowSelection,
      showRowNumbers,
      enableRowExpansion,
      showDeleteRow,
      readOnly,
      disabled,
      cellHeight,
      knobProps.sizeToken,
      cellFlexProps,
      getColSizeProps,
      getStickyStyle,
      renderCellContent,
      handleDeleteRow,
      data.length,
      minRows,
      isCompact,
      t,
      deriveSelectRowLabel,
      ExpandCaretIcon,
      expandedCaretRotation,
      clipBodyCells,
      excelCellNav,
      keyboardNav.isNavigating,
      keyboardNav.focusedRowIndex,
      focusedColIndex,
    ],
  );

  // Chip press → toolbar filter editor channel (DataTableFilterButton consumes)
  const [filterEditTarget, setFilterEditTarget] = useState<FilterEditTarget | null>(null);
  const filterUi = useMemo<DataTableFilterUi>(
    () => ({ editTarget: filterEditTarget, requestEdit: setFilterEditTarget }),
    [filterEditTarget],
  );

  // Build the state context value
  const stateContextValue = useMemo<DataTableStateContextValue<TData>>(
    () => ({ table, state, actions, computed, selectAllScope, filterUi }),
    [table, state, actions, computed, selectAllScope, filterUi],
  );

  const hasCardSort = showCards && enableSorting && table.getVisibleLeafColumns().some((column) => column.getCanSort());
  const defaultCardToolbar = showCards && !renderToolbar;
  const ToolbarComponent = defaultCardToolbar ? DataTableCardToolbar : DataTableToolbar;
  const {
    setGlobalFilter: handleGlobalFilterChange,
    clearFilters: handleClearFilters,
    saveView: handleSaveView,
    loadView: handleLoadView,
    setPagination: handlePaginationChange,
  } = actions;
  // oxlint-disable-next-line typescript/promise-function-async -- returns ReactNode, which React 19 types to include a Promise; nothing here is async
  const renderToolbarComponent = () => {
    const activeFilterCount = table.getState().columnFilters?.length ?? 0;

    if (renderToolbar) {
      return renderToolbar({
        globalFilter: state.globalFilter ?? '',
        onGlobalFilterChange: handleGlobalFilterChange,
        onClearFilters: handleClearFilters,
        onSaveView: handleSaveView,
        onLoadView: handleLoadView,
        views: state.views,
        activeViewId: state.activeViewId,
        size: knobProps.sizeToken,
        compact: isCompact,
        isFetching: Boolean(state.isFetching),
      });
    }

    return (
      <ToolbarComponent
        globalFilter={state.globalFilter ?? ''}
        onGlobalFilterChange={handleGlobalFilterChange}
        onClearFilters={handleClearFilters}
        customActions={
          defaultCardToolbar && hasCardSort ? (
            <DataTableCardSortControl
              table={table}
              compact={isCompact}
              disabled={disabled}
              contained
            />
          ) : undefined
        }
        activeFilterCount={activeFilterCount}
        onSaveView={handleSaveView}
        onLoadView={handleLoadView}
        views={state.views}
        activeViewId={state.activeViewId}
        enableViews={enableViews}
        enableGlobalSearch={enableGlobalSearch}
        enableFiltering={enableFiltering}
        size={knobProps.sizeToken}
        compact={isCompact}
        isFetching={Boolean(state.isFetching)}
      />
    );
  };

  // oxlint-disable-next-line typescript/promise-function-async -- returns ReactNode, which React 19 types to include a Promise; nothing here is async
  const renderPaginationComponent = () => {
    const resolvedPageSizeOptions = pageSizeOptions ?? [10, 20, 50, 100];
    if (renderPagination) {
      return renderPagination({
        pagination: state.pagination,
        onPaginationChange: handlePaginationChange,
        pageSizeOptions: resolvedPageSizeOptions,
      });
    }

    return (
      <DataTablePagination
        pagination={state.pagination}
        onPaginationChange={handlePaginationChange}
        pageSizeOptions={resolvedPageSizeOptions}
        compact
      />
    );
  };

  // oxlint-disable-next-line eslint/complexity -- one render pass for every layout mode and async state
  const renderInner = (
    tableData: TData[],
    effectiveHandleAddRow: () => void,
    effectiveHandleDeleteRow: (idx: number) => void,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a cell value is whatever the column's field editor emits; it is forwarded untouched to the consumer
    _effectiveHandleCellChange: (rowIndex: number, columnId: string, newValue: unknown) => Promise<void>,
    // oxlint-disable-next-line sonarjs/cognitive-complexity -- one render pass for every layout mode and async state
  ) => {
    const cardSortToolbar = defaultCardToolbar && hasCardSort;
    const hasToolbar = enableGlobalSearch || enableFiltering || enableViews || cardSortToolbar;
    // oxlint-disable-next-line react-hooks/rules-of-hooks -- renderInner is called exactly once on every render path, so hook order is stable
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // DF-12 / Axiom 6 HONEST STATE — a height-constrained body clips rows
    // silently: macOS overlay scrollbars paint nothing at rest, so the frame
    // reads "this is all the rows". Track whether rows are cut off below the
    // fold and paint a bottom fade until the user reaches the last row.
    // oxlint-disable-next-line react-hooks/rules-of-hooks -- renderInner is called exactly once on every render path, so hook order is stable
    const tableBodyRef = useRef<HTMLElement | null>(null);
    // oxlint-disable-next-line react-hooks/rules-of-hooks -- renderInner is called exactly once on every render path, so hook order is stable
    const [bodyClipped, setBodyClipped] = useState(false);
    // oxlint-disable-next-line react-hooks/rules-of-hooks, react-doctor/effect-needs-cleanup -- renderInner is called exactly once on every render path, so hook order is stable; the listener is removed by the returned `cleanup`
    useEffect(() => {
      const el = tableBodyRef.current;
      let cleanup: (() => void) | undefined;
      if (isWeb && !isSSR && !showCards && el) {
        const update = () => {
          setBodyClipped(el.scrollHeight - (el.scrollTop + el.clientHeight) > 1);
        };
        update();
        // oxlint-disable-next-line github/prefer-observers -- the fade tracks scroll position, not visibility; ResizeObserver below covers size changes
        el.addEventListener('scroll', update);
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        ro?.observe(el);
        cleanup = () => {
          el.removeEventListener('scroll', update);
          ro?.disconnect();
        };
      }
      return () => {
        cleanup?.();
      };
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- re-measure the clip whenever the row count changes
    }, [displayRows.length]);

    // Enable drag-to-scroll in the horizontal-overflow modes (scroll layout
    // and column pinning share the content-View scrollport).
    // oxlint-disable-next-line react-hooks/rules-of-hooks -- renderInner is called exactly once on every render path, so hook order is stable
    useDragScroll(scrollContainerRef, hScroll && !isSSR);

    // Visible row range for the footer summary (1-based, clamped to total).
    const rangeTotal = state.pagination.totalCount ?? 0;
    const rangeStart = rangeTotal === 0 ? 0 : state.pagination.pageIndex * state.pagination.pageSize + 1;
    const rangeEnd = Math.min((state.pagination.pageIndex + 1) * state.pagination.pageSize, rangeTotal);

    // W9 / DG-ST-01,02,04 / DG-TBL-06 — first-class async states.
    // Error wins over empty chrome; initial load uses a table-shaped skeleton.
    // A refetch (isFetching / placeholderData) MUST keep the body mounted —
    // skeleton only when there are no rows to hold (first load).
    const resolvedAriaLabel = ariaLabel ?? t('Data table');
    const isRefetching = queryInFlight;
    if (state.error !== undefined && state.error !== '') {
      return (
        <AsyncBoundary
          error={state.error}
          onRetry={onRetry}
          layout="table"
          errorTitle={t("Couldn't load table")}
          compact
          aria-label={resolvedAriaLabel}
        />
      );
    }
    const isInitialLoad = state.isLoading === true || infinite?.isInitialLoading === true;
    const isRefetchingState = state.isFetching === true || state.isPlaceholderData === true;
    if (isInitialLoad && displayRows.length === 0 && !isRefetchingState) {
      return (
        <AsyncBoundary
          loading
          layout="table"
          aria-label={resolvedAriaLabel}
        />
      );
    }

    return (
      <DataTableContext.Provider
        size={resolvedSize}
        compact={isCompact}>
        <DataTableStateContext.Provider value={stateContextValue}>
          <View
            flexDirection="column"
            gap={0}
            width="100%"
            // flexBasis auto (not flex={1} basis-0): in an auto-height parent
            // a basis-0 chain resolves to 0 and the whole table collapses to
            // a sliver; basis auto sizes to content there while still filling
            // sized parents (grow 1) and allowing inner scroll (shrink 1 +
            // minHeight 0).
            flexGrow={1}
            flexShrink={1}
            flexBasis="auto"
            minHeight={0}
            {...(isWeb && className !== undefined && className !== '' ? { className } : {})}
            aria-label={resolvedAriaLabel}
            aria-describedby={ariaDescribedBy}
            aria-live="polite"
            aria-atomic="false"
            aria-busy={isRefetching || undefined}
            // UX-011 / Axiom 6 HONEST STATE: the advertised `disabled` prop
            // makes the whole assembly inert and says so. `inert` (React 19)
            // blocks pointer, keyboard, and AT for every control inside —
            // including chrome (toolbar/pagination) that has no disabled API
            // of its own. LC-40 assembly fragment carries the dimWhole
            // visual; keepLabel washes per-control chrome instead (cells,
            // checkboxes, buttons receive their own `disabled` below).
            aria-disabled={disabled || undefined}
            {...(disabled
              ? {
                  ...disabledState.assemblyKnobProps,
                  cursor: CURSOR_NOT_ALLOWED,
                  ...(isWeb ? { inert: true } : { pointerEvents: 'none' as const }),
                }
              : {})}
            {...props}>
            {/* Toolbar. The width-100% wrapper is the LC-40 carrier for
                chrome that has no `disabled` API of its own: under keepLabel
                the chrome fragment dims the region (interaction is already
                blocked by the root inert). */}
            {hasToolbar && (
              <View
                width="100%"
                {...(disabled ? disabledState.chromeKnobProps : {})}>
                {renderToolbarComponent()}
              </View>
            )}

            {/* Active filter chips — visibility surface for ALL filters,
                including hidden-column filters (Axiom 6 HONEST STATE) */}
            {enableFiltering && (
              <View
                width="100%"
                {...(disabled ? disabledState.chromeKnobProps : {})}>
                <DataTableFilterChips />
              </View>
            )}

            {/* Auto selection toolbar (DG-TBL-02) — placement from house bulkBarPlacement */}
            {enableRowSelection && bulkBarPlacement === 'top' && (
              <View
                width="100%"
                {...(disabled ? disabledState.chromeKnobProps : {})}>
                <DataTableBulkActions
                  actions={resolvedBulkActions}
                  maxVisibleActions={5}
                  showSelectionCount
                  placement="top"
                />
              </View>
            )}

            {/* Compound sub-components (children) */}
            {children}

            {/* Card List View (layout="cards" or auto below $sm) */}
            {showList && (
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
            )}
            {!showList && showCards && (
              <>
                {/* Header affordances (sort / per-column filter) live in the
                    grid headers; the card list restores them here. */}
                {!defaultCardToolbar && (
                  <DataTableCardControls
                    table={table}
                    enableSorting={enableSorting}
                    enableFiltering={enableFiltering}
                    availableColumns={cardFilterColumns}
                    compact={isCompact}
                    disabled={disabled}
                  />
                )}
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
                  onDeleteRow={effectiveHandleDeleteRow}
                  selectAllChecked={selectAllChecked}
                  selectAllIndeterminate={selectAllIndeterminate}
                  onToggleSelectAll={toggleSelectAll}
                  compact={isCompact}
                  selectRowLabel={deriveSelectRowLabel}
                  queryInFlight={queryInFlight}
                  {...(rowPressActive ? { getRowPressProps } : {})}
                />
              </>
            )}
            {/* Table View */}
            {!showList && !showCards && (
              <View
                ref={(node: TamaguiElement | null) => {
                  // On web the content View's host is a div.
                  const el = node instanceof HTMLDivElement ? node : null;
                  if (enableKeyboardNavigation && !isSSR) {
                    keyboardNav.containerRef.current = el;
                  }
                  scrollContainerRef.current = el;
                }}
                flexDirection="column"
                width="100%"
                // Grow 0 / shrink 1 / basis auto: the grid frame hugs its
                // rows and only compresses (into internal scroll) when the
                // parent is shorter. flexGrow 1 stretched the frame to fill
                // tall parents, painting a dead zone between the last row
                // and the frame's bottom border on short pages (the frame
                // claimed data area that held no data — Axiom 6/LC-37).
                flexGrow={0}
                flexShrink={1}
                flexBasis="auto"
                minHeight={0}
                // This View (the drag-scroll ref) is the horizontal scroll
                // container; the table inside floors at max-content so it
                // overflows here instead of panning the whole page. With
                // pinning it is the ONE scrollport sticky cells track.
                {...(hScroll ? { overflowX: 'auto' as const } : {})}
                aria-label={withInterp(t('{{label}} content', { label: resolvedAriaLabel }), {
                  label: resolvedAriaLabel,
                })}
                tabIndex={enableKeyboardNavigation && !isSSR ? 0 : undefined}
                {...{ 'data-table-grid': 'true' }}
                onKeyDown={enableKeyboardNavigation && !isSSR ? handleGridKeyDown : undefined}
                onPress={enableKeyboardNavigation && !isSSR ? keyboardNav.handleContainerClick : undefined}
                onBlur={enableKeyboardNavigation && !isSSR ? keyboardNav.handleContainerBlur : undefined}>
                <Table
                  displayMode={displayMode}
                  alignCells={{ x: 'start', y: 'center' }}
                  alignHeaderCells={{ x: 'start', y: 'center' }}
                  cellHeight={cellHeight}
                  borderTopLeftRadius={hasToolbar ? 0 : knobProps.borderRadiusNested.borderRadius}
                  borderTopRightRadius={hasToolbar ? 0 : knobProps.borderRadiusNested.borderRadius}
                  borderBottomLeftRadius={knobProps.borderRadiusNested.borderRadius}
                  borderBottomRightRadius={knobProps.borderRadiusNested.borderRadius}
                  marginBottom={0}
                  aria-label={resolvedAriaLabel}
                  aria-rowcount={computed.totalPages * state.pagination.pageSize}
                  aria-colcount={table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter}
                  width="100%"
                  {...(hScroll ? { style: { minWidth: 'max-content' } } : {})}
                  // Pinning: the Table must NOT be a scroll container (its
                  // overflow:hidden base makes it one) or sticky cells stick
                  // to it instead of the scrolling content View. Content
                  // fits the max-content box, so nothing needs the clip.
                  {...(hScroll && enableColumnPinning ? { overflow: 'visible' as const } : {})}
                  // Roving-focus DOM scope for onRowPress arrow keys (LC-49).
                  {...(rowPressActive ? { 'data-row-press-scope': 'true' } : {})}>
                  {/* Table Header */}
                  <Table.Head
                    zIndex="$1"
                    aria-label={t('Table headers')}>
                    {headerGroups.map((headerGroup: HeaderGroup<TData>) => {
                      rowCounter.current += 1;
                      return (
                        <Table.Row
                          key={headerGroup.id}
                          // SAFETY: widening only; the legacy `background` flag is forwarded untyped as before
                          // oxlint-disable-next-line anti-slop/no-known-value-widening -- the themed row props reject a boolean `background`; the flag is kept for parity
                          {...({ background: true } as object)}
                          {...{
                            backgroundColor: '$color2' as const,
                            rowLocation: rowLocationFor(rowCounter.current),
                            borderTopRightRadius: hasToolbar ? '$0' : knobProps.borderRadiusNested.borderRadius,
                            borderTopLeftRadius: hasToolbar ? '$0' : knobProps.borderRadiusNested.borderRadius,
                            borderBottomLeftRadius: '$0',
                            borderBottomRightRadius: '$0',
                            'aria-rowindex': rowCounter.current,
                          }}>
                          {enableRowSelection && (
                            <Table.HeaderCell
                              cellWidth={selectionColWidth}
                              cellHeight={cellHeight}
                              cellLocation="first"
                              justifyContent="center">
                              <Checkbox
                                checked={selectAllIndeterminate ? 'indeterminate' : selectAllChecked}
                                disabled={disabled}
                                onChange={(checked) => {
                                  if (disabled || checked === 'indeterminate') {
                                    return;
                                  }
                                  const shouldSelect = checked;
                                  const isAll =
                                    selectAllScope === 'filtered'
                                      ? table.getIsAllRowsSelected()
                                      : table.getIsAllPageRowsSelected();
                                  if (shouldSelect !== isAll) {
                                    toggleSelectAll();
                                  }
                                }}
                                checkboxProps={{
                                  'aria-label':
                                    selectAllScope === 'filtered'
                                      ? t('Select all matching rows')
                                      : t('Select all rows on page'),
                                }}
                                compact={isCompact}
                              />
                            </Table.HeaderCell>
                          )}

                          {showRowNumbers && (
                            <Table.HeaderCell
                              cellWidth={chrome.rowNumberCol}
                              cellHeight={cellHeight}
                              cellLocation={enableRowSelection ? 'middle' : 'first'}>
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
                              cellHeight={cellHeight}
                              cellLocation={enableRowSelection || showRowNumbers ? 'middle' : 'first'}>
                              <View width={14} />
                            </Table.HeaderCell>
                          )}

                          {/* oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one header cell: sort, resize, pin, filter, and sticky affordances */}
                          {headerGroup.headers.map((header: Header<TData, unknown>, headerIndex: number) => {
                            const isSortableHeader = header.column.getCanSort();
                            const sortDirection = header.column.getIsSorted();
                            const canResize = enableColumnResizing && header.column.getCanResize();
                            const resizeHandler = canResize ? header.getResizeHandler() : undefined;
                            const colSize = header.getSize();
                            const colMinSize = header.column.columnDef.minSize ?? 0;
                            const colMaxSize = header.column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER;
                            const stickyStyle = getStickyStyle(header.column.id);
                            const columnDef = asDataTableColumn(header.column.columnDef);
                            const columnAlign = resolveColumnAlign({
                              ...columnDef,
                              id: header.column.id,
                            });
                            const headerJustify = alignToFlex(columnAlign);
                            const isRightAligned = columnAlign === 'right';
                            const resizeColumnName = headerText(columnDef.header) ?? header.column.id;

                            const isFirstHeaderCell =
                              headerIndex === 0 && !enableRowSelection && !showRowNumbers && !enableRowExpansion;
                            const isLastHeaderCell =
                              headerIndex === headerGroup.headers.length - 1 && !(showDeleteRow && !readOnly);
                            const headerCellLocation = edgeLocation(isFirstHeaderCell, isLastHeaderCell);
                            let headerCursor = 'default';
                            if (disabled) {
                              headerCursor = CURSOR_NOT_ALLOWED;
                            } else if (isSortableHeader) {
                              headerCursor = CURSOR_POINTER;
                            }
                            let sortTooltip = t('Click to sort (Shift+click for multi-sort)');
                            if (sortDirection === 'asc') {
                              sortTooltip = t('Sorted ascending (click to sort descending)');
                            } else if (sortDirection === 'desc') {
                              sortTooltip = t('Sorted descending (click to clear)');
                            }

                            return (
                              <Table.HeaderCell
                                key={header.id}
                                id={`${header.column.id}-header`}
                                onPress={
                                  isSortableHeader && !disabled ? header.column.getToggleSortingHandler() : undefined
                                }
                                // Keyboard operability (WCAG 2.1.1): the sort
                                // control must not be mouse-only — Tab reaches
                                // sortable headers, Enter/Space toggles (Shift
                                // held = multi-sort, same as shift+click).
                                // Disabled tables drop the handlers (the root
                                // inert already blocks focus on web).
                                {...(isSortableHeader && !disabled && isWeb
                                  ? {
                                      tabIndex: 0,
                                      // oxlint-disable-next-line sonarjs/no-nested-functions -- inline handler of one header cell; hoisting it would split the cell's markup from its behavior
                                      onKeyDown: (e: React.KeyboardEvent) => {
                                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                          e.preventDefault();
                                          header.column.getToggleSortingHandler()?.(e);
                                        }
                                      },
                                      focusVisibleStyle: ensureFocusVisibleRing({
                                        outlineOffset: -2,
                                      }),
                                    }
                                  : {})}
                                cursor={headerCursor}
                                position="relative"
                                cellLocation={headerCellLocation}
                                justifyContent={headerJustify}
                                data-align={columnAlign}
                                aria-sort={ariaSortFor(isSortableHeader, sortDirection)}
                                {...(dnd && !disabled
                                  ? {
                                      draggable: true,
                                      // oxlint-disable-next-line sonarjs/no-nested-functions -- inline handler of one header cell; hoisting it would split the cell's markup from its behavior
                                      onDragStart: (e: React.DragEvent<HTMLElement>) => {
                                        dnd.onDragStart(e, header.column.id);
                                      },
                                      onDragOver: dnd.onDragOver,
                                      // oxlint-disable-next-line sonarjs/no-nested-functions -- inline handler of one header cell; hoisting it would split the cell's markup from its behavior
                                      onDrop: (e: React.DragEvent<HTMLElement>) => {
                                        dnd.onDrop(e, header.column.id);
                                      },
                                    }
                                  : {})}
                                {...cellFlexProps}
                                {...getColSizeProps(header.column)}
                                {...(isWeb && stickyStyle
                                  ? {
                                      style: {
                                        position: 'sticky' as const,
                                        ...('insetInlineStart' in stickyStyle && {
                                          insetInlineStart: stickyStyle.insetInlineStart,
                                        }),
                                        ...('insetInlineEnd' in stickyStyle && {
                                          insetInlineEnd: stickyStyle.insetInlineEnd,
                                        }),
                                        zIndex: 2,
                                        backgroundColor: PINNED_CELL_BACKGROUND,
                                      },
                                    }
                                  : {})}>
                                {/* LC-10 (MPO-336): only the label yields
                                    to a narrow column; the glyphs keep their
                                    size or they paint into the next one. The
                                    filter cluster wraps under the label first,
                                    so the label keeps the column's width. */}
                                <View
                                  flexDirection="row"
                                  flexWrap="wrap"
                                  gap="$2"
                                  alignItems="center"
                                  justifyContent={isRightAligned ? 'flex-end' : 'space-between'}
                                  flex={1}
                                  minWidth={0}>
                                  <View
                                    flexDirection="row"
                                    gap="$2"
                                    alignItems="center"
                                    flexGrow={isRightAligned ? 0 : 1}
                                    flexShrink={1}
                                    flexBasis="auto"
                                    minWidth={0}
                                    justifyContent={isRightAligned ? 'flex-end' : undefined}>
                                    <Text
                                      fontSize={knobProps.sizeToken}
                                      userSelect="none"
                                      flexShrink={1}
                                      minWidth={0}
                                      textAlign={isRightAligned ? 'right' : undefined}
                                      data-header-label=""
                                      {...(isWeb ? { style: { overflowWrap: 'anywhere' } } : {})}>
                                      {header.isPlaceholder
                                        ? null
                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                    </Text>
                                    {isSortableHeader && (
                                      <Tooltip content={sortTooltip}>
                                        <View
                                          aria-hidden={true}
                                          role="presentation"
                                          flexShrink={0}>
                                          {sortDirection === 'asc' && (
                                            <CaretDownIcon
                                              size={chrome.iconPx}
                                              color="var(--color11)"
                                            />
                                          )}
                                          {sortDirection === 'desc' && (
                                            <CaretDownIcon
                                              size={chrome.iconPx}
                                              color="var(--color11)"
                                              style={{ transform: 'rotate(180deg)' }}
                                            />
                                          )}
                                          {sortDirection === false && (
                                            <CaretUpDownIcon
                                              size={chrome.iconPx}
                                              color="var(--color11)"
                                            />
                                          )}
                                        </View>
                                      </Tooltip>
                                    )}
                                  </View>
                                  <View
                                    flexDirection="row"
                                    gap="$1"
                                    alignItems="center"
                                    flexShrink={0}>
                                    {enableFiltering && header.column.getCanFilter() && (
                                      <ColumnHeaderFilter
                                        columnId={header.column.id}
                                        columnLabel={headerText(header.column.columnDef.header) ?? header.column.id}
                                        columnType={mapFieldToFilterType(
                                          getColumnField(asDataTableColumn(header.column.columnDef)),
                                        )}
                                        filterValue={header.column.getFilterValue()}
                                        // oxlint-disable-next-line sonarjs/no-nested-functions -- inline handler of one header cell; hoisting it would split the cell's markup from its behavior
                                        onFilterChange={(value) => {
                                          header.column.setFilterValue(value);
                                        }}
                                        isFiltered={header.column.getIsFiltered()}
                                        options={columnDef.fieldProps?.options}
                                      />
                                    )}
                                    {pinning && enableColumnPinning && (
                                      /* One compact cycle control per header
                                         (left → right → unpin) — two full
                                         buttons crowded the header (owner). */
                                      <pinning.PinButton columnId={header.column.id} />
                                    )}
                                  </View>
                                </View>
                                {canResize && resizeHandler && (
                                  <View
                                    position="absolute"
                                    right={-4}
                                    top={0}
                                    height={2000}
                                    width={8}
                                    cursor="col-resize"
                                    onMouseDown={resizeHandler}
                                    onTouchStart={resizeHandler}
                                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View is the cross-platform primitive (no <hr> on RN); role supplies the resize-handle semantics
                                    role="separator"
                                    aria-valuenow={colSize}
                                    aria-valuemin={colMinSize}
                                    aria-valuemax={colMaxSize}
                                    aria-label={withInterp(
                                      t('Resize {{column}} column', {
                                        column: resizeColumnName,
                                      }),
                                      {
                                        column: resizeColumnName,
                                      },
                                    )}
                                    style={{ touchAction: 'none' }}
                                    zIndex={10}
                                  />
                                )}
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
                      );
                    })}
                  </Table.Head>

                  {/* Table Body */}
                  <Table.Body
                    // Virtualized mode hosts a div rowgroup (DataTableVirtualized)
                    // inside a tbody>tr>td bridge; presentation-ing the bridge
                    // keeps the AT grid tree clean: table > rowgroup(thead) +
                    // rowgroup(virtual rows) with no cell-wrapping-rowgroup
                    // noise. aria-label is prohibited on presentation roles.
                    role={isVirtualized ? 'presentation' : 'rowgroup'}
                    aria-label={isVirtualized ? undefined : t('Table data')}
                    // Pinning: the flex-variant overflowY:auto computes
                    // overflow-x:auto, making the body its own horizontal
                    // scroller — headers (outside it) then never move with
                    // the columns. Visible keeps the sticky chain clean so
                    // the content View is the one scrollport.
                    {...(hScroll && enableColumnPinning
                      ? { overflowY: 'visible' as const, overflowX: 'visible' as const }
                      : {})}
                    ref={(node: TamaguiElement | null) => {
                      // On web the body's host is a DOM element.
                      tableBodyRef.current = node instanceof HTMLElement ? node : null;
                    }}>
                    {displayRows.length === 0 && (
                      <Table.Row>
                        <Table.Cell>
                          {isRefetching ? null : (
                            <EmptyState
                              compact
                              aria-live="polite"
                              title={computed.hasActiveFilters ? t('No results found') : t('No data available')}
                            />
                          )}
                        </Table.Cell>
                      </Table.Row>
                    )}
                    {displayRows.length > 0 && isVirtualized && (
                      <Table.Row role="presentation">
                        <Table.Cell
                          role="presentation"
                          padding={0}
                          // In the default flex displayMode colSpan is inert
                          // and the context default gives cells a fixed token
                          // width — the virtualized body must fill the row
                          // explicitly or it collapses to that token. (In the
                          // real-<table> displayMode the colSpan attribute
                          // now genuinely spans.)
                          cellWidth="auto"
                          style={{
                            display: 'block',
                            overflow: 'hidden',
                            width: '100%',
                            minWidth: 0,
                          }}
                          {...{
                            colSpan: table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter,
                          }}>
                          <DataTableVirtualized
                            virtualItems={virtualItems}
                            totalSize={totalSize}
                            bodyScrollRef={bodyScrollRef}
                            virtualizationHeight={virtualizationHeight}
                            tableRows={displayRows}
                            headerGroups={headerGroups}
                            showRowNumbers={showRowNumbers}
                            enableRowExpansion={enableRowExpansion}
                            showDeleteRow={showDeleteRow}
                            readOnly={readOnly}
                            enableKeyboardNavigation={enableKeyboardNavigation}
                            keyboardNav={keyboardNav}
                            getColSizeProps={getColSizeProps}
                            renderRowContent={renderRowContent}
                            extraColumnsBefore={extraColumnsBefore}
                            extraColumnsAfter={extraColumnsAfter}
                            table={table}
                            hasInfiniteTail={hasInfiniteTail}
                            rowHeightPx={rowHeightPx}
                            tableZebraOn={tableZebraOn}
                            {...(rowPressActive ? { getRowPressProps } : {})}
                          />
                        </Table.Cell>
                      </Table.Row>
                    )}
                    {displayRows.length > 0 && !isVirtualized && (
                      <>
                        {displayRows.map((row: Row<TData>, index: number) => {
                          rowCounter.current += 1;
                          const isLastRow = index === displayRows.length - 1;

                          // Grouped row: render a single header cell spanning all columns
                          // with expand toggle, group label, and item count.
                          if (enableGrouping && row.getIsGrouped?.()) {
                            const colSpan =
                              table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter;
                            const indent = (row.depth ?? 0) * chrome.indent;
                            return (
                              <Table.Row
                                key={row.id}
                                backgroundColor="$color3"
                                flexShrink={0}
                                aria-rowindex={rowCounter.current}>
                                <Table.Cell {...{ colSpan }}>
                                  <View
                                    flexDirection="row"
                                    alignItems="center"
                                    gap="$2"
                                    paddingInlineStart={indent}
                                    cursor="pointer"
                                    onPress={() => {
                                      row.toggleExpanded();
                                    }}
                                    // Keyboard/AT contract: expandable group
                                    // header is a toggle button (Enter/Space).
                                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View is the cross-platform primitive (no native <button> on RN); role supplies the toggle semantics
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={row.getIsExpanded()}
                                    {...{
                                      onKeyDown: (e: React.KeyboardEvent) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          row.toggleExpanded();
                                        }
                                      },
                                    }}>
                                    <Text
                                      fontFamily="$mono"
                                      fontSize="$3">
                                      {row.getIsExpanded() ? '▼' : '▶'}
                                    </Text>
                                    <Text fontWeight="600">
                                      {
                                        // oxlint-disable-next-line typescript/no-base-to-string -- grouping values are the grouped column's primitive cell values
                                        String(row.groupingValue ?? '—')
                                      }
                                    </Text>
                                    <Text
                                      color="$placeholderColor"
                                      fontSize="$2">
                                      ({row.subRows?.length ?? 0})
                                    </Text>
                                  </View>
                                </Table.Cell>
                              </Table.Row>
                            );
                          }

                          let zebraAttr = 'off';
                          if (tableZebraOn) {
                            zebraAttr = index % 2 === 0 ? 'even' : 'odd';
                          }
                          const mainRow = (
                            <Table.Row
                              {...tableRowStateProps({
                                selected: enableRowSelection && row.getIsSelected(),
                                keyboardFocused: false,
                                zebraOn: tableZebraOn,
                                index,
                                pressable: rowPressActive,
                              })}
                              {...{ animation: 'quick' }}
                              flexShrink={0}
                              rowLocation={rowLocationFor(rowCounter.current)}
                              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- held rows can repeat ids across a refetch; the index suffix keeps keys unique
                              key={`${row.id}-${index}`}
                              aria-rowindex={rowCounter.current}
                              aria-label={withInterp(t('Row {{row}}', { row: index + 1 }), {
                                row: index + 1,
                              })}
                              tabIndex={-1}
                              {...{
                                'data-table-zebra': zebraAttr,
                              }}
                              {...getRowPressProps(row, index)}
                              {...rowIntentProps(row.original)}>
                              {renderRowContent(row, index, isLastRow)}
                            </Table.Row>
                          );

                          const showSubComponent = row.getIsExpanded() && (row.subRows?.length ?? 0) === 0;
                          const subRow =
                            enableRowExpansion && renderSubComponent && showSubComponent ? (
                              <Table.Row
                                key={`${row.id}-sub`}
                                backgroundColor="$color2">
                                <Table.Cell
                                  {...{
                                    colSpan:
                                      table.getVisibleLeafColumns().length + extraColumnsBefore + extraColumnsAfter,
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
                        })}
                        {/* Filler row — fills remaining space with background */}
                        {isFlexLayout && (
                          <Table.Row
                            key="filler-row"
                            aria-hidden={true}
                            backgroundColor="$color1"
                            flex={1}
                            flexShrink={1}
                            flexGrow={1}
                            flexBasis={0}
                            minHeight={0}>
                            {enableRowSelection && (
                              <Table.Cell
                                cellWidth={selectionColWidth}
                                cellLocation="first"
                                padding={0}
                                minHeight={0}
                              />
                            )}
                            {showRowNumbers && (
                              <Table.Cell
                                cellWidth={chrome.rowNumberCol}
                                cellLocation={enableRowSelection ? 'middle' : 'first'}
                                padding={0}
                                minHeight={0}
                              />
                            )}
                            {enableRowExpansion && (
                              <Table.Cell
                                cellWidth={chrome.expandCol}
                                cellLocation={enableRowSelection || showRowNumbers ? 'middle' : 'first'}
                                padding={0}
                                minHeight={0}
                              />
                            )}
                            {headerGroups[0]?.headers.map((header: Header<TData, unknown>, headerIndex: number) => {
                              const isFirstDataCell =
                                headerIndex === 0 && !enableRowSelection && !showRowNumbers && !enableRowExpansion;
                              const isLastDataCell =
                                headerIndex === headerGroups[0].headers.length - 1 && !(showDeleteRow && !readOnly);
                              const cellLoc = edgeLocation(isFirstDataCell, isLastDataCell);
                              return (
                                <Table.Cell
                                  key={header.id}
                                  {...cellFlexProps}
                                  {...getColSizeProps(header.column)}
                                  cellLocation={cellLoc}
                                  padding={0}
                                  minHeight={0}
                                />
                              );
                            })}
                            {showDeleteRow && !readOnly && (
                              <Table.Cell
                                cellWidth={chrome.deleteCol}
                                cellLocation="last"
                                padding={0}
                                minHeight={0}
                              />
                            )}
                          </Table.Row>
                        )}
                      </>
                    )}
                    {/* DF-12 / Axiom 6: clipped-viewport affordance — rows are
                        cut off below the fold, so the frame says so with a
                        bottom fade that clears once the last row is reached.
                        Sticky inside the scroll container; zero layout cost
                        (a zero-height row whose cell paints the fade upward
                        over the last visible row). Rendered as a Table.Row
                        and a <td>: a <div> is not a valid child of the real
                        <tbody> or <tr> (SSR parsers foster-parent it out of
                        the table). Only reachable in the flex displayMode
                        (bodyClipped needs a scrollable body), where the row
                        renders display:flex like the old View. */}
                    {isWeb && bodyClipped && (
                      <Table.Row
                        aria-hidden={true}
                        role="presentation"
                        position="sticky"
                        bottom={0}
                        height={0}
                        flexShrink={0}
                        zIndex={2}
                        pointerEvents="none"
                        {...{ 'data-table-clip-affordance': 'true' }}>
                        <View
                          {...{ render: 'td' }}
                          position="absolute"
                          left={0}
                          right={0}
                          bottom={0}
                          height={28}
                          style={{
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0), var(--background))',
                          }}
                        />
                      </Table.Row>
                    )}
                  </Table.Body>

                  {/* Table Footer */}
                  {hasFooter && (
                    <Table.Foot>
                      {footerGroups.map((footerGroup: HeaderGroup<TData>) => (
                        <Table.Row key={footerGroup.id}>
                          {enableRowSelection && (
                            <Table.Cell
                              cellWidth={selectionColWidth}
                              cellHeight={cellHeight}
                              cellLocation="first"
                            />
                          )}
                          {showRowNumbers && (
                            <Table.Cell
                              cellWidth={chrome.rowNumberCol}
                              cellHeight={cellHeight}
                              cellLocation={enableRowSelection ? 'middle' : 'first'}
                            />
                          )}
                          {enableRowExpansion && (
                            <Table.Cell
                              cellWidth={chrome.expandCol}
                              cellHeight={cellHeight}
                              cellLocation={enableRowSelection || showRowNumbers ? 'middle' : 'first'}
                            />
                          )}
                          {footerGroup.headers.map((header: Header<TData, unknown>) => {
                            const stickyStyle = getStickyStyle(header.column.id);
                            const columnAlign = resolveColumnAlign({
                              ...asDataTableColumn(header.column.columnDef),
                              id: header.column.id,
                            });
                            return (
                              <Table.Cell
                                key={header.id}
                                {...cellFlexProps}
                                {...getColSizeProps(header.column)}
                                {...(isWeb && stickyStyle
                                  ? {
                                      style: {
                                        position: 'sticky' as const,
                                        ...('insetInlineStart' in stickyStyle && {
                                          insetInlineStart: stickyStyle.insetInlineStart,
                                        }),
                                        ...('insetInlineEnd' in stickyStyle && {
                                          insetInlineEnd: stickyStyle.insetInlineEnd,
                                        }),
                                        zIndex: 2,
                                        backgroundColor: PINNED_CELL_BACKGROUND,
                                      },
                                    }
                                  : {})}
                                justifyContent={alignToFlex(columnAlign)}
                                data-align={columnAlign}>
                                {header.isPlaceholder ? null : (
                                  <View
                                    width="100%"
                                    minWidth={0}
                                    flexDirection="row"
                                    alignItems="center"
                                    justifyContent={alignToFlex(columnAlign)}
                                    data-cell-align={columnAlign}
                                    style={isWeb ? { textAlign: columnAlign } : undefined}>
                                    {flexRender(header.column.columnDef.footer, header.getContext())}
                                  </View>
                                )}
                              </Table.Cell>
                            );
                          })}
                          {showDeleteRow && !readOnly && (
                            <Table.Cell
                              cellWidth={chrome.deleteCol}
                              cellHeight={cellHeight}
                              cellLocation="last"
                            />
                          )}
                        </Table.Row>
                      ))}
                    </Table.Foot>
                  )}
                </Table>
              </View>
            )}

            {infinite ? (
              <DataTableInfiniteTail
                infinite={infinite}
                visibleCount={tableRows.length}
                showAppendSkeleton={!isVirtualized}
                rowHeightPx={rowHeightPx}
                fontSize={knobProps.sizeToken}
                gapProps={knobProps.gap}
                sentinel={
                  !isVirtualized && !infinite.exhausted && isWeb ? (
                    <View
                      ref={sentinelRef}
                      height={1}
                      width="100%"
                      aria-hidden
                      {...{ 'data-testid': 'infinite-sentinel' }}
                    />
                  ) : null
                }
              />
            ) : null}

            {enableRowSelection && bulkBarPlacement === 'bottom' && (
              <View
                width="100%"
                {...(disabled ? disabledState.chromeKnobProps : {})}>
                <DataTableBulkActions
                  actions={resolvedBulkActions}
                  maxVisibleActions={5}
                  showSelectionCount
                  placement="bottom"
                />
              </View>
            )}

            {/* Add Row Button */}
            {showAddRow && !readOnly && (
              <View>
                <Button
                  icon={PlusIcon}
                  disabled={disabled || (maxRows !== undefined && tableData.length >= maxRows)}
                  onPress={effectiveHandleAddRow}
                  aria-label={t('Add Row')}>
                  {t('Add Row')}
                </Button>
              </View>
            )}

            {/* Pagination footer (pages mode only; infinite replaces it with the tail status) */}
            {enablePagination && !infinite && (
              <View
                paddingTop="$3"
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
                flexWrap="wrap"
                {...knobProps.gap}
                {...(disabled ? disabledState.chromeKnobProps : {})}>
                {renderPaginationComponent()}
                {/* DF-12 / Axiom 6: visible range/total — the footer states how
                    many rows exist even when a height-constrained body clips
                    some below the fold ("1–6 of 6", not "what you see is all"). */}
                <Text
                  fontSize={knobProps.sizeToken}
                  color="$color11"
                  aria-live="polite"
                  {...{ 'data-table-range': 'true' }}>
                  {/* Bidi-isolated: an RTL paragraph would otherwise reorder
                      the latin/numeric runs ("1–5 of 5" → "of 5 5–1"). */}
                  {bidiIsolate(
                    withInterp(
                      t('{{start}}–{{end}} of {{total}}', {
                        start: rangeStart,
                        end: rangeEnd,
                        total: rangeTotal,
                      }),
                      { start: rangeStart, end: rangeEnd, total: rangeTotal },
                    ),
                  )}
                </Text>
              </View>
            )}
          </View>
        </DataTableStateContext.Provider>
      </DataTableContext.Provider>
    );
  };

  // Form mode wrapper
  if (isFormMode) {
    return (
      <Field
        form={resolvedForm}
        name={name}
        mode="array">
        {(field) => {
          // SAFETY: an array-mode DataTable field holds the table's TData rows
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the SAFETY note above
          const formData = (field.state.value as TData[]) ?? [];
          const setFormData = (next: TData[]) => {
            // SAFETY: the next rows replace the field's own TData[] value
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field API's value type is erased to `never` for a form of unknown shape
            field.handleChange(next as never);
          };

          return renderInner(
            formData,
            () => {
              const atMaxRows = maxRows !== undefined && maxRows !== 0 && formData.length >= maxRows;
              if (readOnly || disabled || atMaxRows) {
                return;
              }
              // SAFETY: defaultRow is the consumer's template for a new TData row
              // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see the SAFETY note above
              const newRow = { ...defaultRow, idx: formData.length + 1 } as unknown as TData;
              setFormData([...formData, newRow]);
            },
            (idx: number) => {
              if (readOnly || disabled || formData.length <= minRows) {
                return;
              }
              setFormData(formData.filter((_, i) => i !== idx));
            },
            // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a cell value is whatever the column's field editor emits; it is forwarded untouched to the consumer
            async (rowIndex: number, columnId: string, newValue: unknown) => {
              if (readOnly || disabled) {
                return;
              }
              const previousValue: unknown = formData[rowIndex]?.[columnId];
              if (onCellChange) {
                const result = await onCellChange(rowIndex, columnId, newValue, previousValue);
                if (result === false) {
                  return;
                }
              }
              const newData = [...formData];
              newData[rowIndex] = { ...newData[rowIndex], [columnId]: newValue };
              setFormData(newData);
            },
          );
        }}
      </Field>
    );
  }

  // Standalone mode
  return renderInner(data, handleAddRow, handleDeleteRow, handleCellChange);
};
