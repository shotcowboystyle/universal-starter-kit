import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Numeric } from '.';
import type { NumericProps } from '.';

export default {
  title: 'FrappeUI/Numeric',
  component: Numeric,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A numeric input field for Frappe Int, Float, Currency, and Percent field types with formatting and validation.',
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['Int', 'Float', 'Currency', 'Percent'],
      description: 'The type of numeric field',
    },
    label: { control: 'text', description: 'Field label' },
    value: { control: 'number', description: 'Current value' },
    min: { control: 'number', description: 'Minimum value' },
    max: { control: 'number', description: 'Maximum value' },
    precision: { control: 'number', description: 'Decimal precision for floats' },
    currencySymbol: { control: 'text', description: 'Currency symbol prefix' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    required: { control: 'boolean', description: 'Mark as required' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

function ControlledNumeric(props: Omit<NumericProps, 'onChange'>) {
  const [value, setValue] = useState(props.value);
  return (
    <Numeric
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const AllTypes = () => (
  <YStack gap="$3">
    <ControlledNumeric
      label="Integer"
      type="Int"
      value={42}
    />
    <ControlledNumeric
      label="Float"
      type="Float"
      value={3.14}
      precision={2}
    />
    <ControlledNumeric
      label="Currency"
      type="Currency"
      currencySymbol="$"
      value={99.99}
    />
    <ControlledNumeric
      label="Percent"
      type="Percent"
      value={75}
    />
  </YStack>
);
AllTypes.parameters = {
  docs: {
    description: {
      story: 'All numeric field types displayed together.',
    },
  },
};

AllTypes.storyName = 'Main';
export const DifferentCurrencies = () => (
  <YStack gap="$3">
    <ControlledNumeric
      label="USD Amount"
      type="Currency"
      value={1000}
      currencySymbol="$"
    />
    <ControlledNumeric
      label="EUR Amount"
      type="Currency"
      value={850}
      currencySymbol="€"
    />
    <ControlledNumeric
      label="GBP Amount"
      type="Currency"
      value={780}
      currencySymbol="£"
    />
    <ControlledNumeric
      label="JPY Amount"
      type="Currency"
      value={150_000}
      currencySymbol="¥"
    />
  </YStack>
);
DifferentCurrencies.parameters = {
  docs: {
    description: {
      story: 'Currency fields with different currency symbols.',
    },
  },
};

interface NumericRow {
  id: string;
  label: string;
  value: number | undefined;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<NumericRow[]>([
      { id: '1', label: 'Alpha', value: 42 },
      { id: '2', label: 'Beta', value: 7 },
      { id: '3', label: 'Gamma', value: undefined },
    ]);
    const columns: DataTableColumn<NumericRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Qty (Int)', ...fieldtypeToTableField('Int') },
    ];
    return (
      <FrappeStoryProvider>
        <YStack
          width="100%"
          height={280}>
          <DataTable
            data={data}
            columns={columns}
            enablePagination={false}
            onDataChange={setData}
          />
        </YStack>
      </FrappeStoryProvider>
    );
  },
};
