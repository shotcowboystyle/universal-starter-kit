import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { SmallText } from '.';
import type { SmallTextProps } from '.';

export default {
  title: 'FrappeUI/SmallText',
  component: SmallText,
  parameters: {
    status: { type: 'beta' },
    docs: { description: { component: 'Frappe Small Text field (multiline input adapter).' } },
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

type StoryProps = SmallTextProps & Record<string, unknown>;

function Controlled(props: StoryProps) {
  const [value, setValue] = useState(props.value);
  return (
    <SmallText
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
  label: 'Notes',
  value: 'A short note',
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
  label: 'Notes',
  value: 'A short note',
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
  label: 'Notes',
  value: 'A short note',
  placeholder: 'Type here',
} as Partial<StoryProps>;

interface SmallTextCellRow {
  id: string;
  label: string;
  value: string;
}

const smallTextCellRows: SmallTextCellRow[] = [
  { id: '1', label: 'Alpha', value: 'Follow up after the site visit.' },
  { id: '2', label: 'Beta', value: 'Customer prefers email.' },
  { id: '3', label: 'Gamma', value: '' },
];

const smallTextCellColumns: DataTableColumn<SmallTextCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Small Text',
    ...fieldtypeToTableField('Small Text'),
  } as DataTableColumn<SmallTextCellRow>,
];

function InTableStory() {
  const [data, setData] = useState(smallTextCellRows);
  return (
    <YStack
      width="100%"
      height={280}>
      <DataTable
        data={data}
        columns={smallTextCellColumns as DataTableColumn<Record<string, any>>[]}
        enablePagination={false}
        onDataChange={(next: Record<string, any>[]) => {
          setData(next as SmallTextCellRow[]);
          action('onDataChange')(next);
        }}
        aria-label="Small Text cell editor table"
      />
    </YStack>
  );
}

/** 3-row DataTable mapped through fieldtypeToTableField("Small Text") — in-cell textarea. */
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
        'Small Text inside a table cell: the registry maps the fieldtype to an in-cell textarea. Three rows of mock DocType data; edits commit through onDataChange.',
    },
  },
};
