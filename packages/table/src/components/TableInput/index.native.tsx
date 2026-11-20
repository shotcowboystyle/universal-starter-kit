/**
 * TableInput (native) — the child-table field (the forms↔table bridge).
 *
 * Mirrors the web contract exactly (see ./index.tsx):
 * - Canonical `onChange(rows)` with deprecated `onDataChange` alias firing
 *   from the same emit site (LC-14), `onCellChange` per-cell companion.
 * - Three-branch render: skeleton → standalone → form-integrated `<Field>`
 *   with `useFormField()` context resolution and resolved validators.
 * - No `idx` bookkeeping — array order is row order.
 */

import { TrashIcon, PlusIcon } from '@phosphor-icons/react';
import { Button, Field, Skeleton, useFormField, useResolvedValidators } from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { getTableCellPadding, tableZebraFill, tableZebraStripe } from '@repo/table-primitives';
import { hairline, useResolvedKnobs } from '@repo/theme';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, XStack, YStack, useTheme } from 'tamagui';

import type { DataTableColumn, DataTableData } from '../../types';
import { withInterp } from '../../utils/with-interp';
import { DataTableCell } from '../DataTableCell';

import { RowDetailEditor } from './RowDetailEditor';
import { columnKey, generateRowId, isEmptyRows, SKELETON_ROW_COUNT } from './shared';
import type { ChildCellHidden } from './shared';

/** Stable default for `data`, so the inner list's memoized work survives re-renders. */
const EMPTY_ROWS: never[] = [];

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
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the value is whatever the column's editor emits; the column owns its type
  onCellChange?: (rowIndex: number, columnId: string, value: unknown) => void;
  /** Form field name for TanStack Form integration */
  name?: string;
  /** TanStack Form instance (resolved from `<Form>` context when omitted) */
  form?: AnyFormApi;
  /** Validators registered on the form field (form branch only) */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- passed through verbatim to the forms package's useResolvedValidators
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
   * is the default — a child table is a dense in-form editor, not a page table.
   */
  compact?: boolean;
  /** Leading grab handle + keyboard reorder via kanbanDnd (web implements). */
  enableReorder?: boolean;
  /** Per-row button that opens the row in a detail editor (MPO-22). */
  rowDetail?: boolean;
  /** Fields the detail editor shows. Defaults to `columns`. */
  detailColumns?: DataTableColumn<TData>[];
  /** Hides one row's cell, in the grid and in the detail editor. */
  isCellHidden?: ChildCellHidden<TData>;
}

interface TableInputInnerProps<TData extends DataTableData> {
  rows: TData[];
  commit: (next: TData[]) => void;
  columns: DataTableColumn<TData>[];
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- same contract as TableInputProps.onCellChange
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
  rowDetail: boolean;
  detailColumns: DataTableColumn<TData>[];
  isCellHidden?: ChildCellHidden<TData>;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- i18next interpolation bag; values are arbitrary interpolation inputs
  t: (key: string, options?: Record<string, unknown>) => string;
}

// oxlint-disable-next-line react-doctor/no-giant-component -- one list controller: row CRUD and the header/row/skeleton renderers share the same rows/commit state
const TableInputInner = <TData extends DataTableData>({
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
  rowDetail,
  detailColumns,
  isCellHidden,
  t,
}: TableInputInnerProps<TData>) => {
  const theme = useTheme();
  const { knobProps } = useResolvedKnobs({ compact });
  const cellPad = getTableCellPadding(knobProps.space);
  const chromePx = knobProps.nestedControl.px;
  const indexWidth = Math.max(36, chromePx);
  const actionWidth = chromePx + 16;
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const Detail = RowDetailEditor<TData>;

  const handleCellChange = useCallback(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- same contract as onCellChange
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
    if (maxRows !== undefined && maxRows !== 0 && rows.length >= maxRows) {
      return;
    }
    // SAFETY: a new row is the caller's defaultRow plus a generated id; the remaining fields start unset by design
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- see SAFETY above; TS needs the unknown hop for a partial row
    const newRow = {
      id: generateRowId(),
      ...defaultRow,
    } as unknown as TData;
    commit([...rows, newRow]);
  }, [rows, commit, defaultRow, maxRows]);

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      if (minRows !== undefined && minRows !== 0 && rows.length <= minRows) {
        return;
      }
      commit(rows.filter((_, index) => index !== rowIndex));
    },
    [rows, commit, minRows],
  );

  const handleRowDetailCommit = useCallback(
    (rowIndex: number, next: TData, changed: string[]) => {
      for (const columnId of changed) {
        // SAFETY: `changed` holds columnKey() values of this row type's columns
        onCellChange?.(rowIndex, columnId, next[columnId as keyof TData]);
      }
      commit(rows.map((row, index) => (index === rowIndex ? next : row)));
    },
    [rows, commit, onCellChange],
  );

  const canAddRow = maxRows === undefined || maxRows === 0 || rows.length < maxRows;
  const canDelete = minRows === undefined || minRows === 0 || rows.length > minRows;

  const columnIds = useMemo(() => columns.map(columnKey), [columns]);

  const renderHeader = () => (
    <XStack
      backgroundColor="$color2"
      {...hairline.bottom}
      {...cellPad}>
      {showRowNumbers && (
        <View
          width={indexWidth}
          paddingHorizontal="$1">
          <Text
            fontWeight="400"
            color="$color10"
            fontSize={knobProps.label.fontSize}>
            #
          </Text>
        </View>
      )}
      {columns.map((col, index) => (
        <View
          key={columnIds[index]}
          flex={1}
          paddingHorizontal="$1">
          <Text
            fontWeight="400"
            color="$color12"
            fontSize={knobProps.label.fontSize}>
            {
              // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ColumnDef header is a string or a render function; only a string is a label
              typeof col.header === 'string' ? col.header : columnIds[index]
            }
          </Text>
        </View>
      ))}
      {rowDetail && <View width={actionWidth} />}
      {showDeleteRow && !readOnly && <View width={actionWidth} />}
    </XStack>
  );

  const renderRow = ({ item, index }: { item: TData; index: number }) => {
    const rowId = String(item.id ?? index);
    const isActive = activeRowId === rowId;
    const stripe = tableZebraStripe(knobProps.tableZebra, index);
    const zebraFill = stripe === 'odd' ? tableZebraFill(knobProps.surface.backgroundColor) : undefined;
    return (
      <XStack
        {...hairline.bottom}
        {...cellPad}
        backgroundColor={isActive ? '$color3' : zebraFill}
        {...{ 'data-table-zebra': stripe }}
        onPressIn={() => {
          setActiveRowId(rowId);
        }}>
        {showRowNumbers && (
          <View
            width={indexWidth}
            paddingHorizontal="$1"
            justifyContent="center">
            <Text
              color="$color10"
              fontSize={knobProps.label.fontSize}>
              {index + 1}
            </Text>
          </View>
        )}
        {columns.map((col, colIndex) => {
          const columnId = columnIds[colIndex];
          // SAFETY: columnId is columnKey(col), the row-data key this column reads
          const value = item[columnId as keyof TData];
          const field = col.field ?? 'input';
          const { fieldProps } = col;

          if (isCellHidden?.(item, columnId, index)) {
            return (
              <View
                key={columnId}
                flex={1}
                paddingHorizontal="$1"
              />
            );
          }
          return (
            <View
              key={columnId}
              flex={1}
              paddingHorizontal="$1">
              <DataTableCell
                value={value}
                onChange={(newValue) => {
                  handleCellChange(index, columnId, newValue);
                }}
                field={field}
                fieldProps={fieldProps}
                readOnly={readOnly}
                compact={compact}
                columnId={columnId}
                // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ColumnDef header is a string or a render function; only a string is a label
                columnLabel={typeof col.header === 'string' ? col.header : undefined}
                rowIndex={index}
                rowData={item}
              />
            </View>
          );
        })}
        {rowDetail && (
          <View
            width={actionWidth}
            justifyContent="center"
            alignItems="center">
            <Detail
              row={item}
              rowIndex={index}
              columns={detailColumns}
              readOnly={readOnly}
              compact={compact}
              isCellHidden={isCellHidden}
              onCommit={(next, changed) => {
                handleRowDetailCommit(index, next, changed);
              }}
            />
          </View>
        )}
        {showDeleteRow && !readOnly && (
          <View
            width={actionWidth}
            justifyContent="center"
            alignItems="center">
            <Button
              chromeless
              compact={compact}
              onPress={() => {
                handleDeleteRow(index);
              }}
              disabled={!canDelete}
              hitSlop={knobProps.nestedControl.hitSlop}
              aria-label={withInterp(t('Delete row {{row}}', { row: index + 1 }), {
                row: index + 1,
              })}>
              <TrashIcon
                size={16}
                color={String(theme.red10?.val ?? 'currentColor')}
              />
            </Button>
          </View>
        )}
      </XStack>
    );
  };

  const renderSkeletonRows = () => (
    <YStack>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <XStack
          key={`skeleton-${rowIndex}`}
          {...hairline.bottom}
          {...cellPad}
          alignItems="center">
          {showRowNumbers && (
            <View
              width={indexWidth}
              paddingHorizontal="$1">
              <Skeleton
                variant="rounded"
                width={16}
                height={16}
              />
            </View>
          )}
          {columns.map((_col, colIndex) => (
            <View
              key={columnIds[colIndex]}
              flex={1}
              paddingHorizontal="$1">
              <Skeleton
                variant="rounded"
                width="70%"
                height={16}
              />
            </View>
          ))}
          {rowDetail && <View width={actionWidth} />}
          {showDeleteRow && !readOnly && <View width={actionWidth} />}
        </XStack>
      ))}
    </YStack>
  );

  const renderEmpty = () => (
    <View
      padding="$4"
      alignItems="center">
      <Text color="$color10">{emptyMessage}</Text>
    </View>
  );

  const renderBody = () => {
    if (skeleton) {
      return renderSkeletonRows();
    }
    if (rows.length === 0) {
      return renderEmpty();
    }
    return (
      <FlashList
        keyboardShouldPersistTaps="handled"
        data={rows}
        renderItem={renderRow}
        drawDistance={200}
        keyExtractor={(item, index) => (item.id === undefined || item.id === null ? `row-${index}` : String(item.id))}
      />
    );
  };

  return (
    <YStack
      {...knobProps.surface}
      {...knobProps.borderRadiusNested}
      elevation={knobProps.elevation}
      overflow="hidden"
      accessibilityLabel={ariaLabel}
      aria-busy={skeleton || undefined}>
      {renderHeader()}
      {renderBody()}
      {showAddRow && !readOnly && !skeleton && (
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
      )}
    </YStack>
  );
};

export const TableInput = <TData extends DataTableData = DataTableData>({
  data = EMPTY_ROWS,
  columns,
  onChange,
  // oxlint-disable-next-line typescript/no-deprecated -- this component implements the deprecated alias (LC-14)
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
  rowDetail = false,
  detailColumns,
  isCellHidden,
}: TableInputProps<TData>) => {
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
  if (!resolvedForm || name === undefined || name === '') {
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
          // SAFETY: this field is registered by this component and only ever written with TData[] via commit
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TanStack Form types the value loosely; see SAFETY above
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
};

export type { DataTableColumn, DataTableData, DataTableField, DataTableFieldProps } from '../../types';
