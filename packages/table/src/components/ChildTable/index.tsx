import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { renumberIdx } from "@repo/ui";
import { FieldLayout, useFormField } from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { useProps, YStack } from "tamagui";
import { TableInput } from "../TableInput";
import type { ChildCellHidden } from "../TableInput/shared";
import type { DataTableColumn, DataTableData } from "../../types";

export interface ChildTableProps<TRow extends DataTableData = DataTableData> {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  value?: TRow[];
  onChange?: (rows: TRow[]) => void;
  columns: DataTableColumn<TRow>[];
  defaultRow?: Partial<TRow>;
  disabled?: boolean;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
  minRows?: number;
  maxRows?: number;
  showRowNumbers?: boolean;
  showAddRow?: boolean;
  showDeleteRow?: boolean;
  label?: ReactNode;
  error?: string | boolean;
  helperText?: string;
  required?: boolean;
  id?: string;
  /**
   * Leading grab handle + keyboard reorder. Default on unless the field is
   * read-only or disabled. A committed drop rewrites `idx` 1..n (MPO-22).
   */
  enableReorder?: boolean;
  /**
   * Per-row button that opens the row in a detail editor over
   * `detailColumns` (default `columns`). Opt-in; a read-only table opens
   * the row for viewing (MPO-22).
   */
  rowDetail?: boolean;
  detailColumns?: DataTableColumn<TRow>[];
  /** Hides one row's cell, in the grid and in the detail editor (MPO-22). */
  isCellHidden?: ChildCellHidden<TRow>;
}

/**
 * Subscribes to a form field's validation errors so the FieldLayout error
 * slot reflects validators registered by the inner TableInput `<Field>`
 * (which renders below the layout, so its render-prop error can't reach it).
 */
function ChildTableFieldError({
  form,
  name,
  children,
}: {
  form: AnyFormApi;
  name: string;
  children: (error: string | undefined) => ReactNode;
}) {
  const {Subscribe} = (form as any);
  return (
    <Subscribe selector={(state: any) => state.fieldMeta?.[name]?.errors}>
      {(errors: unknown[] | undefined) =>
        children(errors && errors.length ? String(errors[0]) : undefined)
      }
    </Subscribe>
  );
}

export function ChildTable<TRow extends DataTableData = DataTableData>(
  props: ChildTableProps<TRow>,
) {
  const {
    name,
    form,
    validators,
    value,
    onChange,
    columns,
    defaultRow,
    disabled,
    readOnly,
    skeleton,
    compact,
    minRows,
    maxRows,
    showRowNumbers = true,
    showAddRow = true,
    showDeleteRow = true,
    label,
    error,
    helperText,
    required,
    id: idProp,
    enableReorder: enableReorderProp,
    rowDetail,
    detailColumns,
    isCellHidden,
  } = useProps(props);

  const { knobProps, id, resolvedForm } = useFormField({ form, id: idProp, compact });
  const formBound = !!resolvedForm && !!name;
  const hasLayout = (label ?? error) || helperText ?? required;
  const enableReorder = enableReorderProp ?? !(readOnly ?? disabled);

  const emitChange = useCallback(
    (rows: TRow[]) => {
      const next = rows.some((row) => typeof (row as { idx?: number }).idx === "number")
        ? renumberIdx(rows)
        : rows;
      onChange?.(next);
    },
    [onChange],
  );

  // Generic JSX (`<TableInput<TRow> …/>`) breaks one-dev's source annotation
  // transform; instantiate the type argument outside JSX instead.
  const Input = TableInput<TRow>;

  const table = (
    <Input
      name={name}
      form={resolvedForm}
      validators={validators}
      required={required}
      skeleton={skeleton}
      data={value ?? []}
      onChange={emitChange}
      columns={columns ?? []}
      defaultRow={defaultRow}
      readOnly={readOnly ?? disabled}
      minRows={minRows}
      maxRows={maxRows}
      showRowNumbers={showRowNumbers}
      showAddRow={showAddRow && !readOnly && !disabled}
      showDeleteRow={showDeleteRow && !readOnly && !disabled}
      compact={compact}
      enableReorder={enableReorder && !readOnly && !disabled}
      rowDetail={rowDetail}
      detailColumns={detailColumns}
      isCellHidden={isCellHidden}
    />
  );

  if (!hasLayout && !formBound) {return table;}

  // Programmatic label association: the composite control is a named group
  // carrying the FieldLayout id, so `<label htmlFor={id}>` resolves and the
  // tamagui Label auto-wires aria-labelledby onto it (a bare table can't
  // take the field id).
  const control = label ? (
    <YStack width="100%" id={id} role="group">
      {table}
    </YStack>
  ) : (
    table
  );

  const renderLayout = (resolvedError: string | boolean | undefined) => (
    <FieldLayout
      id={id}
      label={label}
      error={resolvedError}
      helperText={helperText}
      required={required}
      knobProps={knobProps}
    >
      {control}
    </FieldLayout>
  );

  // Form-bound with no explicit error: surface field validator errors
  // (required/custom) in the layout's error slot.
  if (formBound && error === undefined && !skeleton) {
    return (
      <ChildTableFieldError form={resolvedForm} name={name}>
        {renderLayout}
      </ChildTableFieldError>
    );
  }

  return renderLayout(error);
}
