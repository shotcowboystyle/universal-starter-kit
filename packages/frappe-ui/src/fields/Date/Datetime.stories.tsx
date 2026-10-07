import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Date as DateField } from '.';
import type { DateProps } from '.';

export default {
  title: 'FrappeUI/Datetime',
  component: DateField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: { component: 'Frappe Datetime field (Date adapter with type=datetime).' },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    type: { control: 'select', options: ['date', 'datetime', 'time'] },
  },
};

type StoryProps = DateProps & Record<string, unknown>;

function Controlled(props: StoryProps) {
  const [value, setValue] = useState(props.value);
  return (
    <DateField
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
  label: 'Scheduled At',
  type: 'datetime',
  value: '2026-01-24T14:30',
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
    />
    <Controlled
      {...args}
      label="Disabled + error"
      disabled
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
  label: 'Scheduled At',
  type: 'datetime',
  value: '2026-01-24T14:30',
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
  label: 'Scheduled At',
  type: 'datetime',
  value: '2026-01-24T14:30',
} as Partial<StoryProps>;

interface DatetimeRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<DatetimeRow[]>([
      { id: '1', label: 'Alpha', value: '2026-01-24T14:30' },
      { id: '2', label: 'Beta', value: '2026-03-01T09:00' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<DatetimeRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Datetime', ...fieldtypeToTableField('Datetime') },
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
