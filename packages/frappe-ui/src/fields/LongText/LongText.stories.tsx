import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { LongText } from '.';
import type { LongTextProps } from '.';

export default {
  title: 'FrappeUI/LongText',
  component: LongText,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe Long Text field (multiline input adapter).' } },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    placeholder: { control: 'text' },
    maxLength: { control: 'number' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = LongTextProps & Record<string, unknown>;

const Controlled = (props: StoryProps) => {
  const [value, setValue] = useState(props.value);
  return (
    <LongText
      {...(props as any)}
      value={value as any}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

const STORY_VALUE = 'Line one\nLine two\nLine three';

export const Main = (args: StoryProps) => <Controlled {...args} />;
Main.args = {
  label: 'Description',
  value: STORY_VALUE,
  placeholder: 'Type here',
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
  label: 'Description',
  value: STORY_VALUE,
  placeholder: 'Type here',
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
  label: 'Description',
  value: STORY_VALUE,
  placeholder: 'Type here',
} as Partial<StoryProps>;

interface LongTextCellRow {
  id: string;
  label: string;
  value: string;
}

const longTextCellRows: LongTextCellRow[] = [
  {
    id: '1',
    label: 'Alpha',
    value: STORY_VALUE,
  },
  {
    id: '2',
    label: 'Beta',
    value: 'Warehouse notes:\n- Pallet 4 is damaged\n- Reorder next week',
  },
  { id: '3', label: 'Gamma', value: '' },
];

const longTextCellColumns: DataTableColumn<LongTextCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Long Text',
    ...fieldtypeToTableField('Long Text'),
  } as DataTableColumn<LongTextCellRow>,
];

const InTableStory = () => {
  const [data, setData] = useState(longTextCellRows);
  return (
    <YStack
      width="100%"
      height={280}>
      <DataTable
        data={data}
        columns={longTextCellColumns}
        enablePagination={false}
        onDataChange={(next) => {
          setData(next);
          action('onDataChange')(next);
        }}
        aria-label="Long Text cell editor table"
      />
    </YStack>
  );
};

/** 3-row DataTable mapped through fieldtypeToTableField("Long Text") — in-cell textarea. */
export const InTable = () => (
  <FrappeStoryProvider>
    <InTableStory />
  </FrappeStoryProvider>
);
InTable.storyName = 'In table';
InTable.parameters = {
  docs: {
    description: {
      story:
        'Long Text inside a table cell: the registry maps the fieldtype to an in-cell textarea. Three rows of mock DocType data; edits commit through onDataChange.',
    },
  },
};
