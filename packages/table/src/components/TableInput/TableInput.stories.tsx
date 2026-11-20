/**
 * TableInput — the table itself is a field (child-table contract).
 *
 * Stories cover: controlled data flow (canonical onChange + deprecated
 * onDataChange alias + onCellChange), row add/remove with min/max limits,
 * mixed field types per column, read-only mode, empty state, skeleton
 * branch, and TanStack Form integration with label/error/required wiring
 * via FieldLayout.
 *
 * NOTE: TableInput is fully controlled in standalone mode — it has no
 * internal data buffer. Without onChange, edits do not persist (see
 * UncontrolledStatic). With `form`+`name` (or inside `<Form>`), the field
 * branch binds rows to form state via field.handleChange; label and error
 * presentation come from FieldLayout (see InsideForm, or use ChildTable).
 */

import { FieldLayout } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import React from 'react';
import { fn } from 'storybook/test';
import { Text, View, YStack } from 'tamagui';

import type { DataTableColumn, DataTableData } from '../../types';

import { TableInput } from './index';
import type { TableInputProps } from './index';

interface LineItem extends DataTableData {
  id: string;
  item: string;
  qty: number;
  rate: number;
  status: string;
  urgent: boolean;
  deliverBy: string;
}

const initialRows: LineItem[] = [
  {
    id: 'row-1',
    item: 'Steel bracket',
    qty: 12,
    rate: 4.5,
    status: 'ordered',
    urgent: false,
    deliverBy: '2024-11-20',
  },
  {
    id: 'row-2',
    item: 'M6 bolts (100pk)',
    qty: 3,
    rate: 11.25,
    status: 'draft',
    urgent: true,
    deliverBy: '2024-11-12',
  },
  {
    id: 'row-3',
    item: 'Powder coat, black',
    qty: 1,
    rate: 89,
    status: 'received',
    urgent: false,
    deliverBy: '2024-12-01',
  },
];

// DG-CTRL-01: >5 options so the per-row status Select doesn't trip the
// `select-too-few-options` guardrail (UX-P19).
const statusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Ordered', value: 'ordered' },
  { label: 'Received', value: 'received' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Returned', value: 'returned' },
];

const basicColumns: DataTableColumn<LineItem>[] = [
  { accessorKey: 'item', header: 'Item (input)', field: 'input' },
  { accessorKey: 'qty', header: 'Qty (stepper)', field: 'stepper', fieldProps: { min: 0 } },
  {
    accessorKey: 'rate',
    header: 'Rate (currency)',
    field: 'stepper',
    fieldProps: { min: 0, step: 0.25, precision: 2, currency: 'USD' },
  },
  {
    accessorKey: 'status',
    header: 'Status (select)',
    field: 'select',
    fieldProps: { options: statusOptions },
  },
];

const mixedColumns: DataTableColumn<LineItem>[] = [
  ...basicColumns,
  { accessorKey: 'urgent', header: 'Urgent (checkbox)', field: 'checkbox' },
  { accessorKey: 'deliverBy', header: 'Deliver by (date)', field: 'datepicker' },
];

const meta: Meta<typeof TableInput> = {
  title: 'Table/TableInput',
  component: TableInput,
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
  },
  args: {
    onChange: fn(),
    onDataChange: fn(),
    onCellChange: fn(),
  },
  argTypes: {
    readOnly: { control: 'boolean' },
    showRowNumbers: { control: 'boolean' },
    showAddRow: { control: 'boolean' },
    showDeleteRow: { control: 'boolean' },
    minRows: { control: { type: 'number', min: 0 } },
    maxRows: { control: { type: 'number', min: 0 } },
    emptyMessage: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <View
        flex={1}
        padding="$4"
        width="100%">
        <Story />
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TableInput>;

// ── Controlled harness ────────────────────────────────────────

interface HarnessProps extends Partial<Omit<TableInputProps<LineItem>, 'data' | 'columns'>> {
  columns?: DataTableColumn<LineItem>[];
  rows?: LineItem[];
}

const ControlledTableInput = ({
  columns = basicColumns,
  rows = initialRows,
  onChange,
  // oxlint-disable-next-line typescript/no-deprecated -- the story demonstrates the deprecated alias firing alongside onChange
  onDataChange,
  onCellChange,
  ...rest
}: HarnessProps) => {
  const [data, setData] = React.useState<LineItem[]>(rows);
  return (
    <YStack gap="$3">
      <TableInput<LineItem>
        data={data}
        columns={columns}
        // Canonical onChange drives persistence; the deprecated onDataChange
        // alias still fires from the same emit site (LC-14) and logs to the
        // actions panel alongside it.
        onChange={(next) => {
          setData(next);
          onChange?.(next);
        }}
        // oxlint-disable-next-line typescript/no-deprecated -- the story demonstrates the deprecated alias firing alongside onChange
        onDataChange={onDataChange}
        onCellChange={onCellChange}
        {...rest}
      />
      <Text
        testID="tableinput-data"
        fontSize="$2"
        color="$color10"
        fontFamily="$mono">
        rows: {data.length} · data: {JSON.stringify(data)}
      </Text>
    </YStack>
  );
};

/**
 * Controlled TableInput — edits, row adds, and row deletes all commit through
 * onDataChange. The committed data is echoed below the table (testID
 * "tableinput-data") so persistence is verifiable.
 */
export const Default: Story = {
  name: 'Main',
  render: (args) => <ControlledTableInput {...(args as HarnessProps)} />,
};

/** Every column hosts a different field type — cells are fields. */
export const MixedFieldTypes: Story = {
  render: (args) => (
    <ControlledTableInput
      {...(args as HarnessProps)}
      columns={mixedColumns}
    />
  ),
};

/** Read-only mode: no add/delete affordances, cells render via FieldDisplay. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  render: (args) => (
    <ControlledTableInput
      {...(args as HarnessProps)}
      columns={mixedColumns}
    />
  ),
};

/** minRows=2 / maxRows=4: delete disables at 2 rows, add disables at 4. */
export const RowLimits: Story = {
  args: { minRows: 2, maxRows: 4 },
  render: (args) => <ControlledTableInput {...(args as HarnessProps)} />,
};

/** Empty data renders emptyMessage; Add Row seeds the first row. */
export const Empty: Story = {
  args: { emptyMessage: 'No line items yet' },
  render: (args) => (
    <ControlledTableInput
      {...(args as HarnessProps)}
      rows={[]}
    />
  ),
};

/**
 * TableInput has NO internal state — without onChange (or the deprecated
 * onDataChange alias), cell edits and row add/delete are no-ops. This story
 * documents that contract.
 */
export const UncontrolledStatic: Story = {
  render: () => (
    <YStack gap="$3">
      <TableInput<LineItem>
        data={initialRows}
        columns={basicColumns}
      />
      <Text
        fontSize="$2"
        color="$color10">
        No onChange wired: typing, Add Row, and Delete Row do not persist. TableInput is fully controlled.
      </Text>
    </YStack>
  ),
};

/** Skeleton branch: placeholder rows in the real table geometry. */
export const SkeletonLoading: Story = {
  render: () => (
    <TableInput<LineItem>
      skeleton
      data={[]}
      columns={basicColumns}
    />
  ),
};

// ── Form integration: the table itself is a field ─────────────

const lineItemsError = (rows: LineItem[]): string | undefined => {
  if (rows.length === 0) {
    return 'At least one line item is required';
  }
  return rows.some((row) => !row.item) ? 'Every row needs an item name' : undefined;
};

const InsideFormStory = () => {
  const form = useForm({
    defaultValues: { lineItems: initialRows },
  });
  const [rows, setRows] = React.useState<LineItem[]>(initialRows);
  const error = lineItemsError(rows);

  return (
    <YStack
      gap="$4"
      maxWidth={900}>
      <FieldLayout
        id="line-items"
        label="Line items"
        required
        error={error}
        helperText="Child table field — every cell is a form field, and the table itself binds to the parent form.">
        <TableInput<LineItem>
          form={form as any}
          name="lineItems"
          data={rows}
          columns={basicColumns}
          minRows={0}
          // Form binding is built in: every mutation commits through
          // field.handleChange. The canonical onChange fires alongside it —
          // here it just mirrors rows into local state for the error demo.
          onChange={(next) => {
            setRows(next);
          }}
          aria-label="Line items"
        />
      </FieldLayout>
      <Text
        testID="form-value"
        fontSize="$2"
        color="$color10"
        fontFamily="$mono">
        form.lineItems: {JSON.stringify(form.state.values.lineItems?.map((row) => row.item))}
      </Text>
    </YStack>
  );
};

/**
 * TableInput as a field inside a TanStack form: label, required marker, and
 * error wiring via FieldLayout; rows bind into form state through the
 * built-in field branch (field.handleChange). Delete all rows to trigger
 * the required error.
 */
export const InsideForm: Story = {
  render: () => <InsideFormStory />,
};
