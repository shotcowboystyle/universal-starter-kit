import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { ToggleGroupField } from '.';
import type { ToggleGroupFieldProps } from '.';

export default {
  title: 'FrappeUI/ToggleGroup',
  component: ToggleGroupField,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe Toggle Group field backed by forms ToggleGroup.' } },
  },
  argTypes: {
    label: { control: 'text' },

    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    type: { control: 'select', options: ['single', 'multiple'] },
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
  },
};

type StoryProps = ToggleGroupFieldProps & Record<string, unknown>;

function Controlled(props: StoryProps) {
  const [value, setValue] = useState(props.value);
  return (
    <ToggleGroupField
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Alignment',
  type: 'single',
  value: 'left',
  options: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ],
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const States = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <Controlled
      {...args}
      label="Disabled"
      disabled
      disabledReason="Locked by the workflow"
    />
    <Controlled
      {...args}
      label="Disabled + error"
      disabled
      disabledReason="Locked by the workflow"
      error="Broken while disabled"
    />
    <Controlled
      {...args}
      label="Required"
      required
    />
    <Controlled
      {...args}
      label="Error"
      error="Value does not match the required format"
    />
    <Controlled
      {...args}
      label="Helper text"
      helperText="Some helpful context"
    />
  </YStack>
);
States.args = {
  label: 'Alignment',
  type: 'single',
  value: 'left',
  options: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ],
} as Partial<StoryProps>;

/**
 * Thin-adapter contract probe: forwards readOnly / skeleton / compact through
 * the adapter. The underlying forms field supports all three; if the adapter
 * drops them these three render identically to Main.
 */
export const ContractProbe = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <Controlled
      {...args}
      label="readOnly probe"
      {...({ readOnly: true } as any)}
    />
    <Controlled
      {...args}
      label="skeleton probe"
      {...({ skeleton: true } as any)}
    />
    <Controlled
      {...args}
      label="compact probe"
      {...({ compact: true } as any)}
    />
  </YStack>
);
ContractProbe.args = {
  label: 'Alignment',
  type: 'single',
  value: 'left',
  options: [
    { label: 'Left', value: 'left' },
    { label: 'Center', value: 'center' },
    { label: 'Right', value: 'right' },
  ],
} as Partial<StoryProps>;

const IN_TABLE_TOGGLE_OPTIONS = ['Left', 'Center', 'Right', 'Justify', 'Start', 'End'].join('\n');

interface ToggleRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = () => {
  const [data, setData] = useState<ToggleRow[]>([
    { id: '1', label: 'Alpha', value: 'Left' },
    { id: '2', label: 'Beta', value: 'Center' },
    { id: '3', label: 'Gamma', value: '' },
  ]);
  const columns: DataTableColumn<ToggleRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'value',
      header: 'Alignment',
      ...fieldtypeToTableField('Toggle Group', IN_TABLE_TOGGLE_OPTIONS),
    },
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
};
InTable.storyName = 'In table';
