/**
 * TableInput — the child-table field (the forms↔table bridge).
 *
 * Follows the forms field contract (docs/standards/frontend/field-architecture.md):
 * - Canonical change prop is `onChange(rows)` (LC-14 ONCHANGE-CANONICAL);
 *   `onDataChange(rows)` survives as a deprecated alias that fires from the
 *   same emit site, and `onCellChange(rowIndex, columnId, value)` is a
 *   per-cell companion that fires before the row payload.
 * - Three-branch render: skeleton → standalone → form-integrated `<Field>`.
 *   The form branch resolves the form from props or `<Form>` context via
 *   `useFormField()`, registers `useResolvedValidators(required, validators)`,
 *   renders rows from `field.state.value`, and commits every mutation through
 *   `field.handleChange`.
 * - TableInput is otherwise fully controlled: standalone edits do not persist
 *   without `onChange` (see the UncontrolledStatic story).
 *
 * Row identity: added rows get a collision-free generated `id`. TableInput
 * reorders through the shared kanbanDnd machine (`enableReorder`); Frappe
 * `idx` renumbering is the ChildTable layer (MPO-22), not this field.
 * `rowDetail` opens one row as a form over `detailColumns` (RowDetailEditor);
 * `isCellHidden` blanks a cell per row, and the caller owns the rule.
 */

import { SortableHandle, SortableSessionProvider, useSortableRows } from '@repo/ui';
import { Button, Field, Skeleton, useFormField, useResolvedValidators } from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { Table, getTableCellPadding } from '@repo/table-primitives';
import { hairline, useResolvedKnobs } from '@repo/theme';
import { TrashIcon, PlusIcon } from '@phosphor-icons/react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, XStack, YStack, isWeb, useTheme } from 'tamagui';

import type { DataTableColumn, DataTableData, DataTableFieldProps, DataTableField } from '../../types';
import { withInterp } from '../../utils/withInterp';
import { DataTableCell } from '../DataTableCell';

import { RowDetailEditor } from './RowDetailEditor';
import {
  childRowAttrs,
  childTableKeyAction,
  columnKey,
  generateRowId,
  isEmptyRows,
  SKELETON_ROW_COUNT,
} from './shared';
import type { ChildCellHidden } from './shared';

const chromeColumnIds = new Set(['_reorder', '_rowNumber', '_detail', '_actions']);

/**
 * What the cell renderers read at render time. It rides on TanStack's table
 * meta so the column definitions depend on the schema alone.
 */
interface GridMeta<TData extends DataTableData> {
  readOnly: boolean;
  compact: boolean;
  canDelete: boolean;
  deleteColor: string;
  knobProps: ReturnType<typeof useResolvedKnobs>['knobProps'];
  sortable: ReturnType<typeof useSortableRows<TData>>;
  detailColumns: DataTableColumn<TData>[];
  isCellHidden?: ChildCellHidden<TData>;
  t: (key: string, options?: Record<string, unknown>) => string;
  changeCell: (rowIndex: number, columnId: string, value: unknown) => void;
  deleteRow: (rowIndex: number) => void;
  commitRowDetail: (rowIndex: number, next: TData, changed: string[]) => void;
}

type GridCellProps<TData extends DataTableData> = CellContext<TData, unknown>;

const gridMeta = <TData extends DataTableData>({ table }: GridCellProps<TData>) =>
  table.options.meta as GridMeta<TData>;

// flexRender mounts each column's `cell` as a component, so these renderers
// live at module scope: a renderer created per render remounts every cell on
// a row commit, and the focused control goes with it (MPO-471, MPO-475).
function ReorderCell<TData extends DataTableData>(props: GridCellProps<TData>) {
  const { row } = props;
  const { sortable, t, compact } = gridMeta(props);
  return (
    <SortableHandle
      label={sortable.labels[row.index] ?? t('Row {{row}}', { row: row.index + 1 })}
      itemId={String(row.original.id ?? row.id)}
      compact={compact}
      onPointerDown={(e) => {
        sortable.onHandlePointerDown(row.index, e);
      }}
      onKeyDown={(e) => {
        sortable.onHandleKeyDown(row.index, e);
      }}
    />
  );
}

function RowNumberCell<TData extends DataTableData>(props: GridCellProps<TData>) {
  const { knobProps } = gridMeta(props);
  return (
    <Text
      color="$color10"
      fontSize={knobProps.label.fontSize}>
      {props.row.index + 1}
    </Text>
  );
}

function DataCell<TData extends DataTableData>(props: GridCellProps<TData>) {
  const { row, column } = props;
  const { isCellHidden, readOnly, compact, changeCell } = gridMeta(props);
  const columnId = column.id;
  if (isCellHidden?.(row.original, columnId, row.index)) {
    return null;
  }
  const col = column.columnDef as DataTableColumn<TData>;
  return (
    <DataTableCell
      value={row.original[columnId as keyof TData]}
      onChange={(newValue) => {
        changeCell(row.index, columnId, newValue);
      }}
      field={col.field ?? 'input'}
      fieldProps={col.fieldProps}
      readOnly={readOnly}
      compact={compact}
      columnId={columnId}
      columnLabel={typeof col.header === 'string' ? col.header : undefined}
      rowIndex={row.index}
      rowData={row.original}
    />
  );
}

function DetailCell<TData extends DataTableData>(props: GridCellProps<TData>) {
  const { row } = props;
  const { detailColumns, readOnly, compact, isCellHidden, commitRowDetail } = gridMeta(props);
  return (
    <RowDetailEditor
      row={row.original}
      rowIndex={row.index}
      columns={detailColumns}
      readOnly={readOnly}
      compact={compact}
      isCellHidden={isCellHidden}
      onCommit={(next, changed) => {
        commitRowDetail(row.index, next, changed);
      }}
    />
  );
}

function DeleteCell<TData extends DataTableData>(props: GridCellProps<TData>) {
  const { row } = props;
  const { canDelete, compact, knobProps, deleteColor, deleteRow, t } = gridMeta(props);
  return (
    <Button
      chromeless
      compact={compact}
      onPress={() => {
        deleteRow(row.index);
      }}
      disabled={!canDelete}
      hitSlop={knobProps.nestedControl.hitSlop}
      aria-label={withInterp(t('Delete row {{row}}', { row: row.index + 1 }), {
        row: row.index + 1,
      })}>
      <TrashIcon
        size={16}
        color={deleteColor}
      />
    </Button>
  );
}

export interface TableInputProps<TData extends DataTableData = DataTableData> {
  /** Data array for the table (ignored in favor of form state in the form branch) */
  data?: TData[];
  /** Column definitions with field type for cell rendering */
  columns: DataTableColumn<TData>[];
  /** Canonical change callback — fires with the full row array on every mutation (LC-14) */
  onChange?: (rows: TData[]) => void;
  /** @deprecated Alias for `onChange`; fires from the same emit site */
  onDataChange?: (data: TData[]) => void;
  /** Callback when a specific cell changes (fires before onChange/onDataChange) */
  onCellChange?: (rowIndex: number, columnId: string, value: unknown) => void;
  /** Form field name for TanStack Form integration */
  name?: string;
  /** TanStack Form instance (resolved from `<Form>` context when omitted) */
  form?: AnyFormApi;
  /** Validators registered on the form field (form branch only) */
  validators?: Record<string, unknown>;
  /** Adds a required validator (form branch only) */
  required?: boolean;
  /** Renders a skeleton placeholder table instead of data */
  skeleton?: boolean;
  /** Whether the table is read-only */
  readOnly?: boolean;
  /** Whether to show row numbers */
  showRowNumbers?: boolean;
  /** Whether to show add row button */
  showAddRow?: boolean;
  /** Whether to show delete row buttons */
  showDeleteRow?: boolean;
  /** Minimum number of rows */
  minRows?: number;
  /** Maximum number of rows */
  maxRows?: number;
  /** Default values for new rows */
  defaultRow?: Partial<TData>;
  /** Empty state message */
  emptyMessage?: string;
  /** Accessible label */
  'aria-label'?: string;
  /**
   * Nested density (LC-73). Child tables sit on a form surface, so compact
   * is the default — Frappe's grid is a dense in-list editor, not a page table.
   */
  compact?: boolean;
  /**
   * Leading grab handle + keyboard reorder via kanbanDnd. ChildTable turns
   * this on and writes `idx` on the change payload (MPO-22).
   */
  enableReorder?: boolean;
  /** Per-row button that opens the row in a detail editor (MPO-22). */
  rowDetail?: boolean;
  /** Fields the detail editor shows. Defaults to `columns`. */
  detailColumns?: DataTableColumn<TData>[];
  /** Hides one row's cell, in the grid and in the detail editor. */
  isCellHidden?: ChildCellHidden<TData>;
}

export function TableInput<TData extends DataTableData = DataTableData>({
  data = [],
  columns,
  onChange,
  onDataChange,
  onCellChange,
  name,
  form: formProp,
  validators,
  required,
  skeleton = false,
  readOnly = false,
  showRowNumbers = true,
  showAddRow = true,
  showDeleteRow = true,
  minRows,
  maxRows,
  defaultRow,
  emptyMessage,
  'aria-label': ariaLabel,
  compact = true,
  enableReorder = false,
  rowDetail = false,
  detailColumns,
  isCellHidden,
}: TableInputProps<TData>) {
  const { t } = useTranslation();
  const { resolvedForm } = useFormField({ form: formProp });
  const resolvedAriaLabel = ariaLabel ?? t('Table input');
  const resolvedValidators = useResolvedValidators(required, validators, resolvedAriaLabel, name, isEmptyRows);

  // Single emit site: canonical onChange plus deprecated alias (LC-14).
  const emitChange = useCallback(
    (next: TData[]) => {
      onChange?.(next);
      onDataChange?.(next);
    },
    [onChange, onDataChange],
  );

  const innerProps = {
    columns,
    onCellChange,
    skeleton,
    readOnly,
    showRowNumbers,
    showAddRow,
    showDeleteRow,
    minRows,
    maxRows,
    defaultRow,
    emptyMessage: emptyMessage ?? t('No rows'),
    ariaLabel: resolvedAriaLabel,
    compact,
    enableReorder,
    rowDetail,
    detailColumns: detailColumns ?? columns,
    isCellHidden,
    t,
  };

  // Generic JSX (`<TableInputInner<TData> …/>`) breaks one-dev's source
  // annotation transform; instantiate the type argument outside JSX instead.
  const Inner = TableInputInner<TData>;

  // Branch 1: skeleton loading
  if (skeleton) {
    return (
      <Inner
        rows={[]}
        commit={emitChange}
        {...innerProps}
      />
    );
  }

  // Branch 2: standalone (controlled via data/onChange)
  if (!resolvedForm || !name) {
    return (
      <Inner
        rows={data}
        commit={emitChange}
        {...innerProps}
      />
    );
  }

  // Branch 3: form-integrated (TanStack Form)
  return (
    <Field
      form={resolvedForm}
      name={name}
      validators={resolvedValidators}>
      {(field) => (
        <Inner
          // Form state wins; the `data` fallback covers only the uninitialized
          // instant before the field registers. A `data` prop diverging from
          // form state is never load-bearing here (D-16 rider).
          rows={(field.state.value as TData[] | undefined) ?? data}
          commit={(next) => {
            field.handleChange(next);
            emitChange(next);
          }}
          {...innerProps}
        />
      )}
    </Field>
  );
}

interface TableInputInnerProps<TData extends DataTableData> {
  rows: TData[];
  commit: (next: TData[]) => void;
  columns: DataTableColumn<TData>[];
  onCellChange?: (rowIndex: number, columnId: string, value: unknown) => void;
  skeleton: boolean;
  readOnly: boolean;
  showRowNumbers: boolean;
  showAddRow: boolean;
  showDeleteRow: boolean;
  minRows?: number;
  maxRows?: number;
  defaultRow?: Partial<TData>;
  emptyMessage: string;
  ariaLabel: string;
  compact: boolean;
  enableReorder: boolean;
  rowDetail: boolean;
  detailColumns: DataTableColumn<TData>[];
  isCellHidden?: ChildCellHidden<TData>;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function TableInputInner<TData extends DataTableData>({
  rows,
  commit,
  columns,
  onCellChange,
  skeleton,
  readOnly,
  showRowNumbers,
  showAddRow,
  showDeleteRow,
  minRows,
  maxRows,
  defaultRow,
  emptyMessage,
  ariaLabel,
  compact,
  enableReorder,
  rowDetail,
  detailColumns,
  isCellHidden,
  t,
}: TableInputInnerProps<TData>) {
  const theme = useTheme();
  const { knobProps } = useResolvedKnobs({ compact });
  const cellPad = getTableCellPadding(knobProps.space);
  const chromePx = knobProps.nestedControl.px;
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const gridRef = useRef<HTMLElement | null>(null);
  const reorderEnabled = enableReorder && !readOnly && !skeleton;

  const firstDataKey = useMemo(() => {
    const first = columns[0];
    if (!first) {
      return null;
    }
    return typeof first.accessorKey === 'string' ? first.accessorKey : (first.id ?? String(first.accessorKey));
  }, [columns]);

  const getSortableId = useCallback((row: TData, index: number) => String((row as DataTableData).id ?? index), []);
  const getSortableLabel = useCallback(
    (row: TData, index: number) => {
      if (firstDataKey) {
        const value = row[firstDataKey as keyof TData];
        if (value != null && String(value).trim() !== '') {
          return String(value);
        }
      }
      return withInterp(t('Row {{row}}', { row: index + 1 }), { row: index + 1 });
    },
    [firstDataKey, t],
  );

  const sortable = useSortableRows<TData>({
    items: rows,
    getId: getSortableId,
    getLabel: getSortableLabel,
    onChange: commit,
    enabled: reorderEnabled,
    containerRef: gridRef,
    rowSelector: `[${childRowAttrs.row}]`,
  });

  const lastDataColumnId = useMemo(() => {
    const last = columns.at(-1);
    if (!last) {
      return null;
    }
    return typeof last.accessorKey === 'string' ? last.accessorKey : (last.id ?? String(last.accessorKey));
  }, [columns]);

  const handleCellChange = useCallback(
    (rowIndex: number, columnId: string, value: unknown) => {
      onCellChange?.(rowIndex, columnId, value);
      const newData = [...rows];
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnId]: value,
      };
      commit(newData);
    },
    [rows, commit, onCellChange],
  );

  const handleAddRow = useCallback(() => {
    if (maxRows && rows.length >= maxRows) {
      return;
    }
    const id = generateRowId();
    pendingFocusRef.current = id;
    const newRow = {
      id,
      ...defaultRow,
    } as unknown as TData;
    commit([...rows, newRow]);
  }, [rows, commit, defaultRow, maxRows]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      if (minRows && rows.length <= minRows) {
        return;
      }
      commit(rows.filter((_, index) => index !== rowIndex));
    },
    [rows, commit, minRows],
  );

  const handleRowDetailCommit = useCallback(
    (rowIndex: number, next: TData, changed: string[]) => {
      for (const columnId of changed) {
        onCellChange?.(rowIndex, columnId, next[columnId as keyof TData]);
      }
      commit(rows.map((row, index) => (index === rowIndex ? next : row)));
    },
    [rows, commit, onCellChange],
  );

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id || typeof document === 'undefined') {
      return;
    }
    pendingFocusRef.current = null;
    const focus = () => {
      const row = gridRef.current?.querySelector(`[${childRowAttrs.rowId}="${id}"]`);
      const el = row?.querySelector<HTMLElement>(
        `[${childRowAttrs.columnId}] input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), [${childRowAttrs.columnId}] textarea, [${childRowAttrs.columnId}] button, [${childRowAttrs.columnId}] [tabindex]:not([tabindex="-1"])`,
      );
      el?.focus();
    };
    requestAnimationFrame(focus);
  }, [rows]);

  const focusCell = useCallback((rowIndex: number, columnId: string) => {
    const el = gridRef.current?.querySelector<HTMLElement>(
      `[${childRowAttrs.rowIndex}="${rowIndex}"] [${childRowAttrs.columnId}="${columnId}"] input:not([type="hidden"]):not([disabled]), [${childRowAttrs.rowIndex}="${rowIndex}"] [${childRowAttrs.columnId}="${columnId}"] textarea, [${childRowAttrs.rowIndex}="${rowIndex}"] [${childRowAttrs.columnId}="${columnId}"] button, [${childRowAttrs.rowIndex}="${rowIndex}"] [${childRowAttrs.columnId}="${columnId}"] [tabindex]:not([tabindex="-1"])`,
    );
    el?.focus();
  }, []);

  const canAddRow = !maxRows || rows.length < maxRows;

  const handleGridKeyDown = useCallback(
    (e: {
      key: string;
      shiftKey: boolean;
      altKey: boolean;
      metaKey: boolean;
      ctrlKey: boolean;
      target: EventTarget | null;
      preventDefault: () => void;
    }) => {
      if (readOnly || skeleton) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const row = target.closest(`[${childRowAttrs.row}]`) as HTMLElement | null;
      if (!row) {
        return;
      }
      const rowIndex = Number(row.getAttribute(childRowAttrs.rowIndex));
      if (Number.isNaN(rowIndex)) {
        return;
      }
      const action = childTableKeyAction(e, {
        rowIndex,
        rowCount: rows.length,
        columnId: target.closest(`[${childRowAttrs.columnId}]`)?.getAttribute(childRowAttrs.columnId) ?? null,
        inLastDataCell: !!target.closest(`[${childRowAttrs.lastInput}="true"]`),
        field: target.closest(`[${childRowAttrs.field}]`)?.getAttribute(childRowAttrs.field) ?? null,
        tagName: target.tagName,
        listboxOpen: typeof document !== 'undefined' && !!document.querySelector('[role="listbox"]'),
        canAddRow: Boolean(showAddRow && canAddRow),
      });
      if (!action) {
        return;
      }
      e.preventDefault();
      if (action.type === 'addRow') {
        handleAddRow();
      } else {
        focusCell(action.rowIndex, action.columnId);
      }
    },
    [readOnly, skeleton, rows.length, showAddRow, canAddRow, handleAddRow, focusCell],
  );

  const tableColumns = useMemo(() => {
    const cols: ColumnDef<TData>[] = [];
    const chrome = (id: string, header: string, size: number, cell: ColumnDef<TData>['cell']) =>
      cols.push({ id, header, size, cell });

    if (reorderEnabled) {
      chrome('_reorder', '', chromePx + 16, ReorderCell<TData>);
    }
    if (showRowNumbers) {
      chrome('_rowNumber', '#', Math.max(36, chromePx), RowNumberCell<TData>);
    }
    for (const col of columns) {
      cols.push({ ...col, id: columnKey(col), cell: DataCell<TData> } as ColumnDef<TData>);
    }
    if (rowDetail) {
      chrome('_detail', '', chromePx + 16, DetailCell<TData>);
    }
    if (showDeleteRow && !readOnly) {
      chrome('_actions', '', chromePx + 16, DeleteCell<TData>);
    }

    return cols;
  }, [columns, reorderEnabled, showRowNumbers, rowDetail, showDeleteRow, readOnly, chromePx]);

  const meta: GridMeta<TData> = {
    readOnly,
    compact,
    canDelete: !minRows || rows.length > minRows,
    deleteColor: theme.red10?.val ?? 'currentColor',
    knobProps,
    sortable,
    detailColumns,
    isCellHidden,
    t,
    changeCell: handleCellChange,
    deleteRow: handleDeleteRow,
    commitRowDetail: handleRowDetailCommit,
  };

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    // Stable row identity: keeps in-cell editor drafts pinned to their data
    // row across deletes instead of following the positional index.
    getRowId: (row, index) => String((row as DataTableData).id ?? index),
    meta,
  });

  // Empty state flips to flex so a single auto-width cell fills the row
  // (colSpan is unreliable when displayMode is overridden).
  const isEmpty = !skeleton && rows.length === 0;
  const showAdd = showAddRow && !readOnly;

  const addRowControl =
    skeleton && showAdd ? (
      <XStack
        {...hairline.top}
        {...cellPad}>
        <Skeleton
          variant="rounded"
          width={100}
          height={chromePx}
        />
      </XStack>
    ) : showAdd && !skeleton ? (
      <XStack
        {...hairline.top}
        {...cellPad}>
        <Button
          chromeless
          compact={compact}
          onPress={handleAddRow}
          disabled={!canAddRow}
          icon={<PlusIcon size={16} />}>
          {t('Add Row')}
        </Button>
      </XStack>
    ) : null;

  return (
    <SortableSessionProvider sourceId={sortable.session?.id ?? null}>
      <YStack
        ref={gridRef as never}
        {...knobProps.surface}
        {...knobProps.borderRadiusOuter}
        elevation={knobProps.elevation}
        overflow="hidden"
        {...(isWeb ? { onKeyDown: handleGridKeyDown as never } : null)}>
        <Table
          aria-label={ariaLabel}
          aria-busy={skeleton || undefined}
          borderWidth={0}
          borderRadius={0}
          elevation={undefined}
          {...(isEmpty ? { displayMode: 'flex' as const } : null)}>
          <Table.Head>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Row key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Table.HeaderCell
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      ...(isEmpty && !chromeColumnIds.has(header.column.id) ? { flexGrow: 1 } : null),
                    }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </Table.HeaderCell>
                ))}
              </Table.Row>
            ))}
          </Table.Head>
          <Table.Body>
            {skeleton ? (
              Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
                <Table.Row key={`skeleton-${rowIndex}`}>
                  {table.getAllLeafColumns().map((column) => (
                    <Table.Cell key={column.id}>
                      {column.id === '_actions' || column.id === '_reorder' || column.id === '_detail' ? null : (
                        <Skeleton
                          variant="rounded"
                          width={column.id === '_rowNumber' ? 16 : '70%'}
                          height={16}
                        />
                      )}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))
            ) : isEmpty ? (
              <Table.Row>
                <Table.Cell
                  cellWidth="auto"
                  justifyContent="center">
                  <Text color="$color10">{emptyMessage}</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isActive = activeRowId === row.id;
                return (
                  <Table.Row
                    key={row.id}
                    {...{ [childRowAttrs.row]: 'true' }}
                    {...{ [childRowAttrs.rowId]: row.id }}
                    {...{ [childRowAttrs.rowIndex]: String(row.index) }}
                    {...{ [childRowAttrs.active]: isActive ? 'true' : undefined }}
                    backgroundColor={isActive ? '$color3' : undefined}
                    hoverStyle={{ backgroundColor: '$backgroundHover' }}
                    transition={knobProps.transition}
                    // onFocusCapture is a web-only capture-phase handler outside
                    // ThemedRowProps; the bag forwards it to the DOM <tr> (house
                    // Record cast). Tracks the active row as focus enters it.
                    {...({
                      onFocusCapture: () => {
                        setActiveRowId(row.id);
                      },
                    } as Record<string, unknown>)}>
                    {row.getVisibleCells().map((cell) => {
                      const isData = !chromeColumnIds.has(cell.column.id);
                      const field = columns.find((col) => {
                        const id =
                          typeof col.accessorKey === 'string' ? col.accessorKey : (col.id ?? String(col.accessorKey));
                        return id === cell.column.id;
                      })?.field;
                      return (
                        <Table.Cell
                          key={cell.id}
                          {...(isData
                            ? {
                                [childRowAttrs.columnId]: cell.column.id,
                                [childRowAttrs.field]: (field as string) || 'input',
                                [childRowAttrs.lastInput]: cell.column.id === lastDataColumnId ? 'true' : undefined,
                              }
                            : null)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </Table.Cell>
                      );
                    })}
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
        {addRowControl}
        {reorderEnabled ? (
          <View
            position="absolute"
            width={1}
            height={1}
            overflow="hidden"
            opacity={0}
            pointerEvents="none"
            {...sortable.liveProps}>
            <Text>{sortable.announcement}</Text>
          </View>
        ) : null}
      </YStack>
    </SortableSessionProvider>
  );
}

export type { DataTableColumn, DataTableData, DataTableField, DataTableFieldProps };
