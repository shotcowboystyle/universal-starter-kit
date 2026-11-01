import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { DateRangeField } from '.';
import type { DateRangeFieldProps } from '.';

export default {
  title: 'FrappeUI/DateRange',
  component: DateRangeField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: { component: 'Frappe Date Range field backed by forms DateRangePicker.' },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    placeholder: { control: 'text' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = DateRangeFieldProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => {
  const [value, setValue] = useState(props.value);
  return (
    <DateRangeField
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

const STORY_LABEL = 'Date Range';
const STORY_PLACEHOLDER = 'Select range';

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = { label: STORY_LABEL, placeholder: STORY_PLACEHOLDER } as Partial<StoryProps>;
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
States.args = { label: STORY_LABEL, placeholder: STORY_PLACEHOLDER } as Partial<StoryProps>;

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
ContractProbe.args = { label: STORY_LABEL, placeholder: STORY_PLACEHOLDER } as Partial<StoryProps>;

type DateRangeValue = { start: Date; end: Date } | null;
interface DateRangeRow {
  id: string;
  label: string;
  value: DateRangeValue;
}

export const InTable = {
  name: 'In table',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function InTableRender() {
    const [data, setData] = useState<DateRangeRow[]>([
      {
        id: '1',
        label: 'Alpha',
        value: { start: new Date('2026-01-01'), end: new Date('2026-01-15') },
      },
      {
        id: '2',
        label: 'Beta',
        value: { start: new Date('2026-02-01'), end: new Date('2026-02-28') },
      },
      { id: '3', label: 'Gamma', value: null },
    ]);
    const columns: DataTableColumn<DateRangeRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: STORY_LABEL, ...fieldtypeToTableField(STORY_LABEL) },
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
