import type { AnyFormApi } from '@repo/forms';
import type { ColumnDef, ColumnFiltersState, Row, Table } from '@tanstack/react-table';
import type React from 'react';

import type { UrlStateStrategy } from './hooks/use-data-table';
import type { RowAccumulator } from './utils/row-accumulator';

// Core Data Types

// oxlint-disable-next-line typescript/no-explicit-any, anti-slop/no-unsafe-dictionary-type -- row records are consumer-defined; every component and consumer column def indexes them with arbitrary value types
export type DataTableData = Record<string, any>;

/** Bulk action for DataTable selection toolbar (DG-TBL-02). */
// oxlint-disable-next-line typescript/no-explicit-any -- default keeps consumers' typed onExecute callbacks assignable (unknown would break parameter contravariance)
export interface BulkAction<T = any> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  confirmMessage?: string;
  confirmTitle?: string;
  variant?: 'default' | 'destructive' | 'secondary';
  onExecute: (selectedItems: T[], clearSelection: () => void) => void | Promise<void>;
  requiresConfirmation?: boolean;
  disabled?: boolean;
  /**
   * DG-ST-03 — explains why the action is disabled. Flows through the Button /
   * DropdownMenu explain affordances (visible reason, no hover needed). A bare
   * `disabled` without it DEV-warns `bare-disabled`.
   */
  disabledReason?: string;
}

/** Select-all checkbox scope (DG-TBL-03). Default: page. */
export type SelectAllScope = 'page' | 'filtered';

/**
 * Responsive layout mode for the table body.
 * - `auto`: grid on `$sm` and up, stacked card list below (default)
 * - `table`: always render the grid, even at phone widths
 * - `cards`: always render the stacked card list
 * - `list`: subject-led document rows (no grid headers, no card chrome)
 */
export type DataTableLayout = 'auto' | 'table' | 'cards' | 'list';

/**
 * Field types - the UI component used to render/edit a cell.
 * If no field is specified on a column, defaults to "input" (read-only).
 */
export type DataTableField =
  // Text inputs
  | 'input'
  | 'textarea'
  | 'mentioninput'
  // Numeric inputs
  | 'stepper'
  | 'slider'
  /**
   * A Currency field: a decimal STRING, formatted for display and ordered
   * numerically. Read-only presentation — money is edited through the form
   * surfaces, not typed into a grid cell (MPO-252).
   */
  | 'money'
  // Selection inputs
  | 'select'
  | 'combobox'
  | 'radiogroup'
  | 'togglegroup'
  // Boolean inputs
  | 'checkbox'
  | 'switch'
  // Date/Time inputs
  | 'datepicker'
  | 'datetimepicker'
  | 'timepicker'
  | 'daterangepicker'
  | 'multidatepicker'
  | 'duration'
  // Special inputs
  | 'colorpicker'
  | 'phoneinput'
  | 'otp'
  | 'barcode'
  // Visual/feedback
  | 'rating'
  | 'progress'
  // File inputs
  | 'fileupload'
  | 'image'
  | 'signature'
  | 'geolocation'
  // Rich text
  | 'richtexteditor'
  | 'markdowneditor'
  | 'codeeditor'
  // Custom
  | 'custom';

/**
 * Cell state passed to custom cell renderers as the (optional) 4th `render`
 * argument. When `readOnly` (or `disabled`) is true the cell blocks commits,
 * so the renderer must produce a non-interactive presentation — rendering an
 * interactive-looking control whose edits go nowhere lies about editability.
 */
export interface DataTableCellRenderContext {
  readOnly: boolean;
  disabled: boolean;
}

/**
 * Field-specific props passed to the underlying field component.
 * Use this for options, validation, formatters, etc.
 */
export interface DataTableFieldProps {
  /** Options for select/combobox/radiogroup/togglegroup fields */
  // oxlint-disable-next-line typescript/no-explicit-any -- option values flow into Select/Combobox/RadioGroup/ToggleGroup option types that need concrete values
  options?: { label: string; value: any }[];
  /** Placeholder text */
  placeholder?: string;
  /** Min value for number/slider fields */
  min?: number;
  /** Max value for number/slider fields */
  max?: number;
  /** Step for number/slider fields */
  step?: number;
  /** Precision for numeric fields */
  precision?: number;
  /** Currency code for currency fields. A column-level constant. */
  currency?: string;
  /**
   * Row-data key holding this row's currency code, for a `money` column
   * (MPO-252). A ledger genuinely mixes currencies row by row, so the row's
   * own code WINS over the column-level `currency` constant; `currency` is
   * the fallback for the rows that carry none.
   */
  currencyField?: string;
  /** BCP-47 locale for money formatting. Defaults to the runtime's. */
  locale?: string;
  /** Doctype for link fields (Frappe) */
  doctype?: string;
  /** Default country for phone input (ISO 3166-1 alpha-2) */
  defaultCountry?: string;
  /** Number of OTP digits */
  otpLength?: number;
  /** Mentions data for mention input */
  mentions?: { id: string; display: string }[];
  /** Max stars for rating (default 5) */
  maxRating?: number;
  /** Date format for date pickers */
  dateFormat?: string;
  /** Time format (12h or 24h) for time pickers */
  timeFormat?: '12h' | '24h';
  /** Min date for date pickers */
  minDate?: Date;
  /** Max date for date pickers */
  maxDate?: Date;
  /**
   * For daterange in 2-column mode: the accessor key of the linked column.
   * When set, this column acts as the "from" date and the linked column acts as "to" date.
   * Both columns share a single DateRangePicker UI.
   */
  dateRangeLinkedColumn?: string;
  /** Whether this is the "to" column of a linked date range (internal use) */
  dateRangeIsEndColumn?: boolean;
  /** Allow multiple selection for togglegroup */
  allowMultiple?: boolean;
  /**
   * Custom render function for the 'custom' fieldType. Honor
   * `context.readOnly` / `context.disabled` — the cell blocks commits in
   * those states, so the custom presentation must go non-interactive too.
   */
  render?: (
    // oxlint-disable-next-line typescript/no-explicit-any -- consumer render callbacks type their cell value; unknown would reject them (parameter contravariance)
    value: any,
    // oxlint-disable-next-line typescript/no-explicit-any -- consumer render callbacks type their row; unknown would reject them (parameter contravariance)
    row: any,
    // oxlint-disable-next-line typescript/no-explicit-any -- the field component commits values of the column's own type
    onChange: (value: any) => void,
    context?: DataTableCellRenderContext,
  ) => React.ReactNode;
  /** Any additional props to pass to the field component */
  // oxlint-disable-next-line typescript/no-explicit-any, anti-slop/no-unsafe-dictionary-type -- pass-through bag forwarded verbatim to arbitrary field components
  [key: string]: any;
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- default row type is the consumer-defined DataTableData record
export type DataTableColumn<TData extends DataTableData = DataTableData> = ColumnDef<TData> & {
  accessorKey?: keyof TData;
  filterable?: boolean;
  sortable?: boolean;
  searchable?: boolean;
  hidden?: boolean;
  /**
   * Initial leaf-column size in px, mapped to TanStack `size` when absent.
   * Finite nonnegative values only. Sizing state overrides the declaration,
   * within min/max bounds. Unpinned equal-layout cells ignore sizes unless
   * resizing is enabled (see `columnLayout`).
   */
  width?: number;
  /** Alias for `minSize` when absent. Finite nonnegative px; canonical value wins. */
  minWidth?: number;
  /** Alias for `maxSize` when absent. Finite nonnegative px; canonical value wins. */
  maxWidth?: number;
  /**
   * Text alignment override (DG-TBL-01).
   * When omitted, defaults from field/data type: numbers/currency right,
   * text left, actions right, booleans center.
   */
  align?: 'left' | 'center' | 'right';
  /**
   * UI component type for rendering/editing cells in this column.
   * If not specified, defaults to "input" (read-only text display).
   *
   * Examples: "input", "stepper", "slider", "checkbox", "switch",
   * "select", "combobox", "datepicker", "rating", etc.
   */
  field?: DataTableField;
  /**
   * Props passed to the field component (options, placeholder, min/max, etc.)
   */
  fieldProps?: DataTableFieldProps;
  /**
   * Column metadata channel (TanStack `meta`, typed for house use).
   * `label` is the column's human name for surfaces that need a STRING
   * where `header` may be a render function — mobile-card field labels
   * resolve `meta.label` → string `header` → column id, so a glyph-header
   * column (e.g. the liked heart) never prints its raw id (`_liked_by`).
   * `align` / `role` feed the DG-TBL-01 alignment defaults (columnAlign).
   */
  meta?: {
    label?: string;
    align?: 'left' | 'center' | 'right';
    role?: string;
  };
};

// Filter System Types

export type FilterOperator =
  // Text Filters
  | 'contains'
  | 'doesNotContain'
  | 'is'
  | 'isNot'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  // Number Filters
  | 'isLessThan'
  | 'isGreaterThan'
  | 'isLessThanOrEqual'
  | 'isGreaterThanOrEqual'
  | 'isBetween'
  | 'isNotBetween'
  // Date Filters
  | 'isBefore'
  | 'isAfter'
  | 'isOnOrBefore'
  | 'isOnOrAfter'

  // Option Filters
  | 'isAnyOf'
  | 'isNoneOf';
// Boolean Filters

export interface FilterValue {
  operator: FilterOperator;
  // oxlint-disable-next-line typescript/no-explicit-any -- filter operands are compared against arbitrary cell values by filter-utils
  value: any;
  /** For multi-value operators like "isAnyOf" */
  // oxlint-disable-next-line typescript/no-explicit-any -- filter operands are compared against arbitrary cell values by filter-utils
  values?: any[];
}

export interface TableFilter {
  id: string;
  columnId: string;
  value: FilterValue;
  /** Human-readable label for the filter */
  label?: string;
}

/**
 * A field the table can filter on, declared SEPARATELY from visible columns.
 * Lets consumers expose hidden / non-column data keys (e.g. every Frappe
 * doctype field) to the toolbar filter surface. `id` is the row-data key.
 */
export interface FilterableField {
  id: string;
  label: string;
  /** Filter editor type. Defaults to "text". */
  type?: DataTableColumnType;
  /** Options for select-type fields. */
  // oxlint-disable-next-line typescript/no-explicit-any -- option values flow into Select/Combobox/RadioGroup/ToggleGroup option types that need concrete values
  options?: { label: string; value: any }[];
}

/** FilterableField merged with column info — type always resolved. */
export interface ResolvedFilterField {
  id: string;
  label: string;
  type: DataTableColumnType;
  // oxlint-disable-next-line typescript/no-explicit-any -- option values flow into Select/Combobox/RadioGroup/ToggleGroup option types that need concrete values
  options?: { label: string; value: any }[];
}

export interface FacetedFilterOption {
  label: string;
  value: string | number | boolean;
  /** Number of items matching this option */
  count: number;
}

// Pagination Types

export interface TablePagination {
  pageIndex: number;
  pageSize: number;
}

export interface TablePaginationState extends TablePagination {
  totalCount?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

// Infinite pagination (paginationMode="infinite")

/**
 * Pagination presentation mode.
 * - "pages" (default): footer pager built on the catalog `Pagination` component.
 * - "infinite": appends the next page as the user nears the end of the list,
 *   pre-loading page N+1 in the background so appends resolve instantly.
 */
export type PaginationMode = 'pages' | 'infinite';

/** Query passed to the async page loader (infinite mode, server/async data). */
export interface PageLoadQuery {
  /** 0-based page index to load */
  pageIndex: number;
  /** Rows per page (chunk size in infinite mode) */
  pageSize: number;
  sorting: TableSorting[];
  filters: TableFilter[];
  columnFilters: ColumnFiltersState;
  globalFilter?: string;
}

export interface PageLoadResult<TData = unknown> {
  rows: TData[];
  /** Total row count across all pages, when known (enables exact end-of-data). */
  totalCount?: number;
}

/**
 * Async page loader contract for infinite mode. Must be side-effect-free per
 * query: the table may call it ahead of time (prefetch) and cache the result.
 */
export type DataTablePageLoader<TData = unknown> = (query: PageLoadQuery) => Promise<PageLoadResult<TData>>;

/** Computed infinite-mode state exposed by useDataTable / DataTableStateContext. */
export interface DataTableInfiniteState {
  /** How many row-model rows are currently revealed */
  visibleRowCount: number;
  loadedPages: number;
  /** Total row count when known (loader totalCount or client filtered count) */
  totalCount?: number;
  /** No further pages exist */
  exhausted: boolean;
  /** Page 0 for the current query is still loading (loader mode) */
  isInitialLoading: boolean;
  /** A page append is awaiting the loader (cache miss / in-flight prefetch) */
  isAppending: boolean;
  /** Append the next page (no-op while pending or exhausted) */
  loadMore: () => void;
}

// Sorting Types

export interface TableSorting {
  id: string;
  desc: boolean;
}

// View & Column Management Types

export interface ColumnView {
  id: string;
  visible: boolean;
  width?: number;
  order: number;
}

export interface TableView {
  id: string;
  name: string;
  columns: Record<string, ColumnView>;
  filters: TableFilter[];
  sorting: TableSorting[];
  pagination: TablePagination;
  searchQuery?: string;
}

// Main Table State Type

export interface DataTableState {
  // Data
  data: DataTableData[];
  columns: DataTableColumn[];

  // State
  pagination: TablePaginationState;
  sorting: TableSorting[];
  filters: TableFilter[];
  columnFilters: ColumnFiltersState;
  globalFilter?: string;

  // Column Management
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  columnSizing: Record<string, number>;

  // Views
  views?: TableView[];
  activeViewId?: string;

  // Metadata
  /** First load — no rows yet. May unmount the body for a table skeleton. */
  isLoading?: boolean;
  /**
   * Subsequent query in flight (filter/sort/page change). Previous rows stay
   * mounted (`keepPreviousData`); only a toolbar spinner is allowed — never
   * an empty-state or skeleton teardown.
   */
  isFetching?: boolean;
  /** True while the visible rows belong to the previous query key. */
  isPlaceholderData?: boolean;
  error?: string;
  totalCount?: number;

  // URL State (for persistence)
  urlState?: {
    page?: number;
    pageSize?: number;
    sort?: string;
    filters?: string;
    search?: string;
    view?: string;
  };
}

// Component Props Types

export type { RowAccumulator, RowAccumulatorResult } from './utils/row-accumulator';

export interface DataTableProps<TData extends DataTableData = DataTableData> {
  data: TData[];
  columns: DataTableColumn<TData>[];
  /**
   * A fold over the ordered row set, run ONCE before filtering, sorting and
   * pagination — the seam a running balance needs, because the value on row N
   * depends on rows 1..N-1 and a column `cell` renderer only ever sees one
   * row (MPO-250).
   *
   * The derived fields are merged onto each row, so a column names one in
   * `accessorKey` like any other. Declare them on the row type. `total` is
   * published as `computed.foldTotal` for a footer cell.
   *
   * Must be a STABLE reference (module constant or `useMemo`) — the fold
   * re-runs when its identity changes. The full ordering contract, including
   * what happens when the user sorts on another column, is documented on
   * `RowAccumulator` in utils/row-accumulator.ts.
   */
  rowAccumulator?: RowAccumulator<TData>;

  // State Management
  initialState?: Partial<DataTableState>;
  onStateChange?: (state: DataTableState) => void;
  /**
   * Controlled-adoption channel: when the CONTENT of `filters` / `sorting`
   * here changes between renders, the table adopts it in place — same
   * semantics as a filter/sort change made through the table's own chrome
   * (page resets to 0) — WITHOUT a remount. This is the keep-rows-and-
   * reconcile contract for screens where an outer surface owns filtering
   * (backoffice list chrome): rows stay rendered while the new query
   * resolves; no teardown, no skeleton flash, no scroll reset. Content is
   * compared deeply, so unstable array identities are safe; internal chrome
   * changes (header sort clicks) are not overridden unless the adopted
   * content actually differs from what was last adopted.
   */
  controlledState?: Partial<Pick<DataTableState, 'filters' | 'sorting'>>;
  /**
   * First-load flag. When true AND the table has no rows, the body is
   * replaced by a table-shaped skeleton. After the first paint, prefer
   * `isFetching` so a query-key change cannot unmount the body.
   */
  isLoading?: boolean;
  /**
   * In-flight refetch (filters/sort/page). Keeps the current rows mounted
   * and paints a toolbar spinner only — the keepPreviousData / placeholder
   * contract. Must not tear down the table body.
   */
  isFetching?: boolean;
  /**
   * Retry action for the failed-load chrome. When `state.error` is set the
   * table renders error chrome instead of rows; providing `onRetry` adds the
   * Retry button so "error with retry" is reachable (DG-ST-01).
   */
  onRetry?: () => void;

  // URL State Integration
  syncWithUrl?: boolean;
  urlDebounceMs?: number;
  urlStrategy?: UrlStateStrategy;

  // Server-side Features
  manualFiltering?: boolean;
  manualPagination?: boolean;
  manualSorting?: boolean;

  // Features
  /**
   * Owns the table's filter CHROME (default true): the toolbar Filter
   * button, column-header funnels, the active-filter chips row, and the
   * card-layout "Add Filter" control.
   *
   * `false` is the chrome-suppression contract for screens where an OUTER
   * surface is the single filtering authority (e.g. the backoffice list
   * chrome): the table renders no filter entry points, but filters injected
   * through `initialState.filters` / the state channel still apply — they
   * pre-filter client-side data and map to server params under
   * `manualFiltering` — and no table chrome can mutate them (the search
   * clear-X then clears only the search text). Search (`enableGlobalSearch`)
   * and header sort are independent of this flag.
   */
  enableFiltering?: boolean;
  /**
   * Fields filterable via the toolbar Filter surface, independent of visible
   * columns. Merged with column-derived fields (columns first, then "More
   * fields"). Hidden/non-column fields filter client-side against row data
   * keys, or map to server params when manualFiltering is on. With
   * `enableFiltering: false` the list still resolves filter types for
   * injected filters but exposes no filter UI.
   */
  filterableFields?: FilterableField[];
  enableSorting?: boolean;
  enablePagination?: boolean;
  /**
   * Page sizes offered by the built-in footer pager (and forwarded to
   * `renderPagination`). Defaults to the pager's DG-TBL-04 options.
   */
  pageSizeOptions?: number[];
  /**
   * Pagination presentation mode. Default "pages" (footer pager).
   * "infinite" appends pages at the scroll tail with prefetch-ahead.
   */
  paginationMode?: PaginationMode;
  /**
   * Async page loader for infinite mode with server/async data. When set,
   * the table owns a small page cache and pre-loads page N+1 while page N
   * is on screen. Rows are treated as pre-filtered/sorted server-side
   * (manual filtering/sorting/pagination are forced on).
   */
  loadPage?: DataTablePageLoader<TData>;
  enableColumnVisibility?: boolean;
  enableColumnOrdering?: boolean;
  enableColumnResizing?: boolean;
  enableGlobalSearch?: boolean;
  enableViews?: boolean;

  // Column Layout
  /**
   * How columns are sized and whether table scrolls horizontally.
   * - 'equal': Unpinned cells share available width (default).
   * - 'auto': Native table layout on web; resolved sizes are table-layout inputs.
   * - 'scroll': Fixed resolved sizes; horizontal overflow on web when needed.
   *
   * Under 'equal', unpinned cells ignore `width` / `size` without resizing.
   * Use 'scroll' for exact widths or enable `enableColumnResizing` for fixed
   * resizable cells. Pinned cells always keep their resolved size so sticky
   * offsets agree with their boxes. Unspecified sizes resolve to 150px in
   * sized modes; content isn't measured and spare space needn't be filled.
   * Declaring a width under 'equal' emits the `[table] column-width-ignored`
   * dev warning rather than failing silently (MPO-236).
   */
  columnLayout?: 'equal' | 'auto' | 'scroll';

  /**
   * Responsive body layout (W11 breakpoints): `auto` renders the grid on
   * `$sm` and up and a stacked card list below it; `table` / `cards` pin
   * one mode regardless of viewport; `list` is subject-led document rows
   * (no grid headers). Search, filters, sorting, selection, and pagination
   * operate on the same table state in every layout.
   */
  layout?: DataTableLayout;

  // Virtualization (Phase 3)
  /** Use virtual scrolling for table body. Requires virtualizationHeight when true. */
  enableVirtualization?: boolean;
  /** Height (px) of scrollable body when enableVirtualization is true. Required when enabled. */
  virtualizationHeight?: number;
  /** Overscan count for virtualizer. Default 5. */
  virtualizationOverscan?: number;

  // Row expansion (Phase 4)
  /** Enable expandable sub-rows. Requires getSubRows or subRows in row data. */
  enableRowExpansion?: boolean;
  /** Optional renderer for expanded sub-row content. */
  renderSubComponent?: (row: Row<TData>) => React.ReactNode;
  /** Custom accessor for child rows. Defaults to (row) => row.subRows */
  getSubRows?: (row: TData) => TData[] | undefined;

  // Column pinning (Phase 5)
  /** Enable column pinning (left/right). Integrates DataTableColumnPinning. */
  enableColumnPinning?: boolean;
  /** Max columns per side (left/right) when pinning. Default 3. */
  maxPinnedColumns?: number;

  // Grouping
  /**
   * Enable row grouping. When true, rows can be grouped by column id via
   * `table.setGrouping([...])`. Rows from `table.getRowModel()` will include
   * group header rows (`row.getIsGrouped()` true) interleaved with leaf rows.
   */
  enableGrouping?: boolean;

  // Keyboard navigation (Phase 6)
  /** Enable Excel-like keyboard navigation. */
  enableKeyboardNavigation?: boolean;

  // Row press (first-class row activation)
  /**
   * Makes every data row a single pressable unit (the row is the target —
   * no per-cell pressable wrappers). Fired on click/tap anywhere in the row
   * and on Enter AND Space while the row is focused (LC-50: one physical
   * key, one activation). The row group exposes exactly ONE tab stop
   * (LC-49 roving tabindex): ArrowUp/ArrowDown move between rows,
   * Home/End jump to the first/last row, Shift+Tab exits.
   *
   * Inner-control contract: interactive elements inside cells (selection
   * checkboxes, buttons, links, inputs, anything with a role or tab stop)
   * do NOT trigger the row press — the row handler ignores presses that
   * originate from them. Custom pressables built from bare Views should
   * also call `stopPropagation()` so intent stays unambiguous.
   */
  onRowPress?: (row: TData, rowIndex: number) => void;
  /**
   * Accessible row identity (each pressable row needs a name — DG-A11Y-06).
   * Names the pressable row in row-press mode AND the row's selection
   * checkbox ("Select row {identity}") when enableRowSelection is on.
   * Falls back to the first visible column's cell value, then to the
   * positional "Row {{row}}" label.
   */
  rowLabel?: (row: TData) => string;

  // Row selection + bulk actions (DG-TBL-02, DG-TBL-03)
  /** Enable row checkboxes and automatic selection toolbar. */
  enableRowSelection?: boolean;
  /**
   * Scope for the header select-all checkbox.
   * - `page`: current page only (default)
   * - `filtered`: all rows matching current filters
   *
   * Defaults from the house `selectAllScope` theme knob (DG-TBL-03); the
   * prop is the per-table eject. With `page` scope, the bulk bar exposes a
   * "Select all N" switch once the page is fully selected.
   */
  selectAllScope?: SelectAllScope;
  /**
   * Bulk actions shown in the auto SelectionToolbar when rows are selected.
   * Up to 5 visible; extras go to an overflow menu.
   */
  bulkActions?: BulkAction<TData>[];

  // Cell editing - cells are always fields, this controls behavior
  /**
   * Read-only mode: all cells display values but cannot be edited.
   * Fields render without interactivity (no focus, no input).
   */
  readOnly?: boolean;
  /**
   * Callback when any cell value changes. Return false to reject the change.
   * Called for every cell edit in standalone mode.
   */
  onCellChange?: (
    rowIndex: number,
    columnId: string,
    // oxlint-disable-next-line typescript/no-explicit-any -- consumer callbacks type the cell value; unknown would reject them (parameter contravariance)
    value: any,
    // oxlint-disable-next-line typescript/no-explicit-any -- consumer callbacks type the cell value; unknown would reject them (parameter contravariance)
    previousValue: any,
    // oxlint-disable-next-line typescript/no-invalid-void-type -- void lets plain side-effect callbacks satisfy the "return false to reject" contract
  ) => boolean | void | Promise<boolean | void>;

  // Form integration (alternative to data + onDataChange)
  /**
   * Form field name for TanStack Form binding (e.g., "items").
   * When provided with form, data is read from form state.
   */
  name?: string;
  /**
   * TanStack Form instance. When provided with name, enables form binding.
   */
  form?: AnyFormApi;

  // Row management
  /** Show row number column. Default: false */
  showRowNumbers?: boolean;
  /** Show add row button. Default: false. Ignored when readOnly. */
  showAddRow?: boolean;
  /** Show delete button per row. Default: false. Ignored when readOnly. */
  showDeleteRow?: boolean;
  /** Minimum number of rows. Prevents deletion below this. Default: 0 */
  minRows?: number;
  /** Maximum number of rows. Prevents adding above this. */
  maxRows?: number;
  /** Default values for new rows when adding */
  defaultRow?: Partial<TData>;
  /** Callback when rows are added/deleted (standalone mode) */
  onDataChange?: (data: TData[]) => void;

  // Manual pagination metadata (Phase 7) - for server-side when manualPagination is true
  /** Total row count from server for pagination UI. */
  rowCount?: number;
  /** Total page count from server. If omitted, derived from rowCount and pageSize. */
  pageCount?: number;

  // Customization
  renderToolbar?: (props: DataTableToolbarProps) => React.ReactNode;
  renderPagination?: (props: DataTablePaginationProps) => React.ReactNode;
  renderFilters?: (props: DataTableFiltersProps) => React.ReactNode;

  // Styling
  className?: string;
  size?: 'sm' | 'md' | 'lg';

  // Accessibility
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export interface DataTableToolbarProps {
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onSaveView: (name: string) => void;
  onLoadView: (viewId: string) => void;
  views?: TableView[];
  activeViewId?: string;
  size?: string;
  compact?: boolean;
  /** Subtle in-flight indicator — must not unmount the table body. */
  isFetching?: boolean;
}

export type DataTableFilterColumnType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface DataTableFiltersProps {
  filters: TableFilter[];
  onFiltersChange: (filters: TableFilter[]) => void;
  onAddFilter: (filter: Omit<TableFilter, 'id'>) => void;
  onRemoveFilter: (filterId: string) => void;
  onClearFilters: () => void;
  availableColumns: {
    id: string;
    label: string;
    type: DataTableFilterColumnType;
    options?: FacetedFilterOption[];
  }[];
}

export interface DataTablePaginationProps {
  /** Pagination state. When manualPagination is true, totalCount/totalPages come from rowCount/pageCount. */
  pagination: TablePaginationState;
  onPaginationChange: (pagination: TablePagination) => void;
  pageSizeOptions?: number[];
}

// Hook Types

export interface UseDataTableOptions<TData extends DataTableData = DataTableData> extends Omit<
  DataTableProps<TData>,
  'data' | 'columns'
> {
  data?: TData[];
  columns?: DataTableColumn<TData>[];
}

export interface UseDataTableReturn<TData extends DataTableData = DataTableData> {
  /** TanStack Table instance */
  table: Table<TData>;
  state: DataTableState;
  actions: {
    setGlobalFilter: (value: string) => void;
    setFilters: (filters: TableFilter[]) => void;
    /** Adds an advanced filter and returns its generated id. */
    addFilter: (filter: Omit<TableFilter, 'id'>) => string;
    /** Updates an existing advanced filter in place (live commit). */
    updateFilter: (filterId: string, updates: Partial<Omit<TableFilter, 'id'>>) => void;
    removeFilter: (filterId: string) => void;
    clearFilters: () => void;
    setPagination: (pagination: TablePagination) => void;
    setSorting: (sorting: TableSorting[]) => void;
    toggleColumnVisibility: (columnId: string) => void;
    setColumnOrder: (order: string[]) => void;
    setColumnSizing: (sizing: Record<string, number>) => void;
    saveView: (name: string) => void;
    loadView: (viewId: string) => void;
    resetToDefault: () => void;
    /** For row expansion: set which rows are expanded. Only present when enableRowExpansion is true. */
    setExpanded?: (expanded: Record<string, boolean>) => void;
  };
  computed: {
    filteredData: TData[];
    paginatedData: TData[];
    totalPages: number;
    /** Total row count across all pages (post-filter; server total when paginating manually). */
    totalRows: number;
    hasActiveFilters: boolean;
    activeFilterCount: number;
    /** Column-derived + declared filterableFields, merged (columns first). */
    filterFields: ResolvedFilterField[];
    /** Present when paginationMode="infinite" */
    infinite?: DataTableInfiniteState;
    /**
     * `rowAccumulator.total(finalAccumulator, rowCount)` — the fold read once
     * at the end, for a footer/total row. Undefined when the table has no
     * accumulator or the accumulator declares no `total` (MPO-250).
     */
    foldTotal?: unknown;
  };
}

// Utility Types

/**
 * Filter-editor / comparison type for a column.
 *
 * `"money"` (MPO-252) is a decimal STRING, not a number: a Frappe Currency
 * field arrives as "-455.87" because a float would round it. It sorts and
 * filters through the exact BigInt helpers in utils/money.ts, so `"9.00"`
 * orders BELOW `"10.00"` — which the `"text"` fallback got backwards, in
 * silence, on every amount column in the kit.
 *
 * The mixed-currency rule rides this type: TWO CURRENCIES ARE TWO FIGURES AND
 * NEITHER CONVERTS. A money column formats from the row's own currency
 * (`fieldProps.currencyField`), comparison is by magnitude only, and a total
 * over mixed rows is `sumMoneyByCurrency` — one figure per code, never one
 * number. There is no rate in the table and the kit will not invent one.
 */
export type DataTableColumnType = 'text' | 'number' | 'money' | 'date' | 'boolean' | 'select';

export interface DataTableColumnConfig {
  type: DataTableColumnType;
  filterable: boolean;
  sortable: boolean;
  searchable: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
}
