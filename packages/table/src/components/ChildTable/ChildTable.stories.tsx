/**
 * ChildTable — FieldLayout wrapper around TableInput (child-table form field).
 *
 * Stories cover the forms field contract D/R/E/Q/S/C: disabled, read-only,
 * error, required, skeleton, compact — plus standalone onChange and form bind.
 * Table chrome and cell editors belong to TableInput / DataTableCell.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import React from 'react';
import { fn } from 'storybook/test';
import { Text, View, YStack } from 'tamagui';

import type { DataTableColumn, DataTableData } from '../../types';

import { ChildTable } from './index';

interface LineItem extends DataTableData {
  id: string;
  item: string;
  qty: number;
}

const initialRows: LineItem[] = [
  { id: 'row-1', item: 'Steel bracket', qty: 12 },
  { id: 'row-2', item: 'M6 bolts (100pk)', qty: 3 },
];

const columns: DataTableColumn<LineItem>[] = [
  { accessorKey: 'item', header: 'Item', field: 'input' },
  { accessorKey: 'qty', header: 'Qty', field: 'stepper', fieldProps: { min: 0 } },
];

// Instantiation expression: `Meta<typeof ChildTable>` resolves ChildTable's
// TRow to its default (DataTableData), so `args.columns` typed as
// DataTableColumn<DataTableData>[] and rejected the LineItem columns below.
const meta: Meta<typeof ChildTable<LineItem>> = {
  title: 'Table/ChildTable',
  component: ChildTable,
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
  },
  args: {
    onChange: fn(),
    columns,
    label: 'Line items',
    helperText: 'Child table field — every cell is a form field.',
  },
  argTypes: {
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    skeleton: { control: 'boolean' },
    compact: { control: 'boolean' },
    required: { control: 'boolean' },
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
type Story = StoryObj<typeof ChildTable>;

interface HarnessProps {
  rows?: LineItem[];
  onChange?: (rows: LineItem[]) => void;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to ChildTable; controls own the values
  [key: string]: unknown;
}

const ControlledChildTable = ({ rows = initialRows, onChange, ...rest }: HarnessProps) => {
  const [data, setData] = React.useState<LineItem[]>(rows);
  return (
    <YStack gap="$3">
      <ChildTable<LineItem>
        value={data}
        columns={columns}
        onChange={(next) => {
          setData(next);
          onChange?.(next);
        }}
        {...rest}
      />
      <Text
        testID="childtable-data"
        fontSize="$2"
        color="$color10"
        fontFamily="$mono">
        rows: {data.length}
      </Text>
    </YStack>
  );
};

export const Default: Story = {
  name: 'Main',
  render: (args) => <ControlledChildTable {...args} />,
};

export const SkeletonLoading: Story = {
  args: { skeleton: true },
  render: (args) => (
    <ControlledChildTable
      {...args}
      rows={[]}
    />
  ),
};

export const Compact: Story = {
  args: { compact: true },
  render: (args) => <ControlledChildTable {...args} />,
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <ControlledChildTable {...args} />,
};

export const ReadOnly: Story = {
  args: { readOnly: true },
  render: (args) => <ControlledChildTable {...args} />,
};

export const ErrorState: Story = {
  args: { error: 'At least one line item is required', required: true },
  render: (args) => (
    <ControlledChildTable
      {...args}
      rows={[]}
    />
  ),
};

const InsideFormStory = () => {
  const form = useForm({
    defaultValues: { lineItems: initialRows },
  });
  return (
    <YStack
      gap="$4"
      maxWidth={900}>
      <ChildTable<LineItem>
        form={form as any}
        name="lineItems"
        columns={columns}
        label="Line items"
        required
        helperText="Rows bind through the form field; validators surface in the error slot."
      />
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

export const InsideForm: Story = {
  render: () => <InsideFormStory />,
};

interface OrderLine extends DataTableData {
  id: string;
  idx: number;
  item: string;
  qty: number;
  status: string;
  deliverBy: string;
  rate: number;
  urgent: boolean;
  notes: string;
}

const orderLines: OrderLine[] = [
  {
    id: 'line-1',
    idx: 1,
    item: 'Steel bracket',
    qty: 12,
    status: 'ordered',
    deliverBy: '2026-10-20',
    rate: 4.5,
    urgent: false,
    notes: '',
  },
  {
    id: 'line-2',
    idx: 2,
    item: 'M6 bolts (100pk)',
    qty: 3,
    status: 'draft',
    deliverBy: '2026-10-12',
    rate: 11.25,
    urgent: true,
    notes: 'Split across two pallets',
  },
  {
    id: 'line-3',
    idx: 3,
    item: 'Powder coat, black',
    qty: 1,
    status: 'received',
    deliverBy: '2026-11-01',
    rate: 89,
    urgent: false,
    notes: '',
  },
];

const statusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Ordered', value: 'ordered' },
  { label: 'Received', value: 'received' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Returned', value: 'returned' },
];

const gridColumns: DataTableColumn<OrderLine>[] = [
  { accessorKey: 'item', header: 'Item', field: 'input' },
  { accessorKey: 'qty', header: 'Qty', field: 'stepper', fieldProps: { min: 0 } },
  {
    accessorKey: 'status',
    header: 'Status',
    field: 'select',
    fieldProps: { options: statusOptions },
  },
  { accessorKey: 'deliverBy', header: 'Deliver by', field: 'datepicker' },
];

const detailColumns: DataTableColumn<OrderLine>[] = [
  ...gridColumns,
  {
    accessorKey: 'rate',
    header: 'Rate',
    field: 'stepper',
    fieldProps: { min: 0, step: 0.25, precision: 2, currency: 'USD' },
  },
  { accessorKey: 'urgent', header: 'Urgent', field: 'checkbox' },
  { accessorKey: 'notes', header: 'Notes', field: 'textarea' },
];

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to ChildTable; controls own the values
const RowDetailStory = (args: Record<string, unknown>) => {
  const [rows, setRows] = React.useState<OrderLine[]>(orderLines);
  return (
    <YStack gap="$3">
      <ChildTable<OrderLine>
        {...args}
        label="Order lines"
        helperText="The grid shows the list columns; the pencil opens the whole row."
        value={rows}
        columns={gridColumns}
        detailColumns={detailColumns}
        rowDetail
        onChange={setRows}
      />
      <Text
        testID="childtable-idx"
        fontSize="$2"
        color="$color10"
        fontFamily="$mono">
        idx: {rows.map((row) => `${row.idx}:${row.item}`).join(' | ')}
      </Text>
    </YStack>
  );
};

export const RowDetail: Story = {
  render: (args) => <RowDetailStory {...args} />,
};
