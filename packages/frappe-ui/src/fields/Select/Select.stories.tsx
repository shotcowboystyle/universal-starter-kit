import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Select } from '.';
import type { SelectProps } from '.';

export default {
  title: 'FrappeUI/Select',
  component: Select,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'A dropdown select field for Frappe Select field type with support for string or object options.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    required: { control: 'boolean', description: 'Mark as required' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

function ControlledSelect({ onChange: _onChange, ...props }: SelectProps) {
  const [value, setValue] = useState(props.value ?? '');
  const handleChange = (v: string) => {
    setValue(v);
    action('onChange')(v);
  };
  const merged = { ...props, value, onChange: handleChange } as SelectProps;
  return <Select {...merged} />;
}

// DG-CTRL-01: >5 options — shorter Select fixtures trip the
// `select-too-few-options` guardrail (UX-P19).
const statusOptions = ['Open', 'In Progress', 'Completed', 'Cancelled', 'On Hold', 'Overdue'];

const priorityOptions = [
  { value: 'trivial', label: 'Trivial' },
  { value: 'low', label: 'Low Priority' },
  { value: 'medium', label: 'Medium Priority' },
  { value: 'high', label: 'High Priority' },
  { value: 'critical', label: 'Critical' },
  { value: 'blocker', label: 'Blocker' },
];

export const Default = (args: SelectProps) => <ControlledSelect {...args} />;
Default.args = {
  label: 'Status',
  options: statusOptions,
  placeholder: 'Select status',
} satisfies Partial<SelectProps>;

Default.storyName = 'Main';
export const AllStates = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledSelect
      label="Default"
      options={statusOptions}
      placeholder="Select..."
    />
    <ControlledSelect
      label="With Value"
      options={statusOptions}
      value="Open"
    />
    <ControlledSelect
      label="Object Options"
      options={priorityOptions}
      value="medium"
    />
    <ControlledSelect
      label="Required"
      options={statusOptions}
      required
      placeholder="Required field"
    />
    <ControlledSelect
      label="With Error"
      options={statusOptions}
      error="Selection is required"
    />
    <ControlledSelect
      label="Disabled"
      options={statusOptions}
      value="Completed"
      disabled
    />
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All possible states of the SelectField component.',
    },
  },
};

// DG-CTRL-01: >5 options — shorter Select fixtures trip select-too-few-options.
const IN_TABLE_SELECT_OPTIONS = ['Open', 'In Progress', 'Completed', 'Cancelled', 'On Hold', 'Overdue'].join('\n');

interface SelectRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = () => {
  const [data, setData] = useState<SelectRow[]>([
    { id: '1', label: 'Alpha', value: 'Open' },
    { id: '2', label: 'Beta', value: 'Completed' },
    { id: '3', label: 'Gamma', value: '' },
  ]);
  const columns: DataTableColumn<SelectRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'value',
      header: 'Status',
      ...fieldtypeToTableField('Select', IN_TABLE_SELECT_OPTIONS),
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
