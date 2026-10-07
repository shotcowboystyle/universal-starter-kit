import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { ProgressField } from '.';
import type { ProgressFieldProps } from '.';

export default {
  title: 'FrappeUI/Progress',
  component: ProgressField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: { component: 'Frappe Progress field (display-only) backed by forms Progress.' },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'number' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    max: { control: 'number' },
  },
};

type StoryProps = ProgressFieldProps & Record<string, unknown>;

function Controlled(props: StoryProps) {
  const [value, setValue] = useState(props.value);
  return (
    <ProgressField
      {...(props as any)}
      value={value as any}
    />
  );
}

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = { label: 'Completion', value: 65, max: 100 } as Partial<StoryProps>;
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
States.args = { label: 'Completion', value: 65, max: 100 } as Partial<StoryProps>;

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
ContractProbe.args = { label: 'Completion', value: 65, max: 100 } as Partial<StoryProps>;

interface ProgressRow {
  id: string;
  label: string;
  value: number;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<ProgressRow[]>([
      { id: '1', label: 'Alpha', value: 65 },
      { id: '2', label: 'Beta', value: 20 },
      { id: '3', label: 'Gamma', value: 0 },
    ]);
    const columns: DataTableColumn<ProgressRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Completion', ...fieldtypeToTableField('Progress') },
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
