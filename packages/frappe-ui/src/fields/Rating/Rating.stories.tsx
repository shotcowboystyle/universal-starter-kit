import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { Rating } from '.';
import type { RatingProps } from '.';

export default {
  title: 'FrappeUI/Rating',
  component: Rating,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Frappe Rating field (0-1 fraction) supplying StarIcon to forms Rating.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: { type: 'range', min: 0, max: 1, step: 0.1 } },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    maxStars: { control: 'number' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field
type StoryProps = RatingProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => {
  const [value, setValue] = useState(props.value);
  return (
    <Rating
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
Main.args = { label: 'Rating', value: 0.6, maxStars: 5 } as Partial<StoryProps>;
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
States.args = { label: 'Rating', value: 0.6, maxStars: 5 } as Partial<StoryProps>;

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
ContractProbe.args = { label: 'Rating', value: 0.6, maxStars: 5 } as Partial<StoryProps>;

interface RatingRow {
  id: string;
  label: string;
  value: number;
}

export const InTable = () => {
  const [data, setData] = useState<RatingRow[]>([
    { id: '1', label: 'Alpha', value: 0.8 },
    { id: '2', label: 'Beta', value: 0.4 },
    { id: '3', label: 'Gamma', value: 0 },
  ]);
  const columns: DataTableColumn<RatingRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'value',
      header: 'Rating',
      ...fieldtypeToTableField('Rating', '5'),
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
