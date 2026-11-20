import { FieldLayout, useFormField } from '@repo/forms';
import type { AnyFormApi } from '@repo/forms';
import { renumberIdx } from '@repo/ui';
import { useCallback } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useProps, YStack } from 'tamagui';

import type { DataTableColumn, DataTableData } from '../../types';
import { TableInput } from '../TableInput';
import type { ChildCellHidden } from '../TableInput/shared';

export interface ChildTableProps<TRow extends DataTableData = DataTableData> {
  name?: string;
  form?: AnyFormApi;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- passthrough of TableInputProps.validators; the validator shape is owned by TanStack Form
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

type FieldErrors = unknown[] | undefined;

type FormSubscribe = ComponentType<{
  selector: (state: AnyFormApi['state']) => FieldErrors;
  children: (errors: FieldErrors) => ReactNode;
}>;

/**
 * Subscribes to a form field's validation errors so the FieldLayout error
 * slot reflects validators registered by the inner TableInput `<Field>`
 * (which renders below the layout, so its render-prop error can't reach it).
 */
const ChildTableFieldError = ({
  form,
  name,
  children,
}: {
  form: AnyFormApi;
  name: string;
  children: (error: string | undefined) => ReactNode;
}) => {
  // SAFETY: forms resolved from <Form>/useForm are React form APIs, which carry the Subscribe component
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- AnyFormApi is the core FormApi type; Subscribe lives on the React extension
  const { Subscribe } = form as AnyFormApi & { Subscribe: FormSubscribe };
  return (
    <Subscribe selector={(state) => state.fieldMeta?.[name]?.errors}>
      {/* oxlint-disable-next-line typescript/promise-function-async -- React 19's ReactNode union includes a Promise; this render prop is synchronous */}
      {(errors) => children(errors && errors.length ? String(errors[0]) : undefined)}
    </Subscribe>
  );
};

// oxlint-disable-next-line eslint/complexity -- the branches are prop defaults and the bare/labeled/form-bound layout variants
export const ChildTable = <TRow extends DataTableData = DataTableData>(props: ChildTableProps<TRow>) => {
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
  const formBound = !!resolvedForm && name !== undefined && name !== '';
  const hasLayout = Boolean(label ?? error ?? helperText ?? required);
  const enableReorder = enableReorderProp ?? !(readOnly ?? disabled);

  const emitChange = useCallback(
    (rows: TRow[]) => {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- rows are consumer records; only rows carrying a numeric idx opt into renumbering
      const next = rows.some((row) => typeof row.idx === 'number') ? renumberIdx(rows) : rows;
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

  if (!hasLayout && !formBound) {
    return table;
  }

  // Programmatic label association: the composite control is a named group
  // carrying the FieldLayout id, so `<label htmlFor={id}>` resolves and the
  // tamagui Label auto-wires aria-labelledby onto it (a bare table can't
  // take the field id).
  const hasLabel = Boolean(label);
  const control = hasLabel ? (
    <YStack
      width="100%"
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui YStack renders on native too; a <fieldset> would change the web box model
      role="group">
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
      knobProps={knobProps}>
      {control}
    </FieldLayout>
  );

  // Form-bound with no explicit error: surface field validator errors
  // (required/custom) in the layout's error slot.
  if (formBound && error === undefined && !skeleton) {
    return (
      <ChildTableFieldError
        form={resolvedForm}
        name={name}>
        {renderLayout}
      </ChildTableFieldError>
    );
  }

  return renderLayout(error);
};
