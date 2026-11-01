import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { Data } from '.';
import type { DataProps } from '.';

export default {
  title: 'FrappeUI/Data',
  component: Data,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'A text input field for Frappe Data, Small Text, Long Text, and Text Editor field types.',
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['data', 'small_text', 'long_text', 'text_editor'],
      description: 'The type of text field to render',
    },
    label: { control: 'text', description: 'Field label' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    required: { control: 'boolean', description: 'Mark as required' },
    maxLength: { control: 'number', description: 'Maximum character length' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

const ControlledData = (props: Omit<DataProps, 'onChange'>) => {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Data
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

export const Default = (args: DataProps) => <ControlledData {...args} />;
Default.args = {
  label: 'Name',
  placeholder: 'Enter your name',
  type: 'data',
} satisfies Partial<DataProps>;

Default.storyName = 'Main';
export const AllStates = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledData
      label="Default"
      placeholder="Enter text"
    />
    <ControlledData
      label="With Value"
      value="Some entered text"
    />
    <ControlledData
      label="Required Field"
      required
      placeholder="Required"
    />
    <ControlledData
      label="With Error"
      value="invalid"
      error="This value is not valid"
    />
    <ControlledData
      label="Disabled"
      value="Cannot edit"
      disabled
    />
    <ControlledData
      label="With Character Limit"
      maxLength={100}
      value="Some text with character counting"
    />
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All possible states of the DataField component.',
    },
  },
};

interface DataCellRow {
  id: string;
  label: string;
  value: string;
}

const dataCellRows: DataCellRow[] = [
  { id: '1', label: 'Alpha', value: 'SKU-100' },
  { id: '2', label: 'Beta', value: 'Ada Lovelace' },
  { id: '3', label: 'Gamma', value: '' },
];

const dataCellColumns: DataTableColumn<DataCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Data',
    ...fieldtypeToTableField('Data'),
  } as DataTableColumn<DataCellRow>,
];

const InTableStory = () => {
  const [data, setData] = useState(dataCellRows);
  return (
    <YStack
      width="100%"
      height={280}>
      <DataTable
        data={data}
        columns={dataCellColumns}
        enablePagination={false}
        onDataChange={(next) => {
          setData(next);
          action('onDataChange')(next);
        }}
        aria-label="Data cell editor table"
      />
    </YStack>
  );
};

/** 3-row DataTable mapped through fieldtypeToTableField("Data") — chromeless in-cell input. */
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
        'Data inside a table cell: the registry maps the Data fieldtype to an in-cell input. Three rows of mock DocType data; edits commit through onDataChange.',
    },
  },
};
