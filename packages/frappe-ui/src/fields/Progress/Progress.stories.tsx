import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = ProgressFieldProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => <ProgressField {...(props as any)} />;

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
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
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
