import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { SliderField } from '.';
import type { SliderFieldProps } from '.';

export default {
  title: 'FrappeUI/Slider',
  component: SliderField,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe Slider field backed by forms Slider.' } },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'number' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = SliderFieldProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => {
  const [value, setValue] = useState(props.value);
  return (
    <SliderField
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = { label: 'Volume', value: 40, min: 0, max: 100, step: 1 } as Partial<StoryProps>;
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
States.args = { label: 'Volume', value: 40, min: 0, max: 100, step: 1 } as Partial<StoryProps>;

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
  label: 'Volume',
  value: 40,
  min: 0,
  max: 100,
  step: 1,
} as Partial<StoryProps>;

interface SliderRow {
  id: string;
  label: string;
  value: number;
}

export const InTable = {
  name: 'In table',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function InTableRender() {
    const [data, setData] = useState<SliderRow[]>([
      { id: '1', label: 'Alpha', value: 40 },
      { id: '2', label: 'Beta', value: 75 },
      { id: '3', label: 'Gamma', value: 0 },
    ]);
    const columns: DataTableColumn<SliderRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Volume', ...fieldtypeToTableField('Slider') },
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
