import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Check } from '.';
import type { CheckProps } from '.';

export default {
  title: 'FrappeUI/Check',
  component: Check,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'A checkbox field for Frappe Check field type (boolean values).',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    value: { control: 'boolean', description: 'Checked state' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

function ControlledCheck(props: Omit<CheckProps, 'onChange'>) {
  const [value, setValue] = useState(props.value ?? false);
  return (
    <Check
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Default = (args: CheckProps) => <ControlledCheck {...args} />;
Default.args = {
  label: 'Accept Terms',
} satisfies Partial<CheckProps>;

Default.storyName = 'Main';
export const AllStates = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledCheck
      label="Unchecked (Default)"
      value={false}
    />
    <ControlledCheck
      label="Checked"
      value={true}
    />
    <ControlledCheck
      label="With Error"
      value={false}
      error="This field is required"
    />
    <ControlledCheck
      label="Disabled Unchecked"
      value={false}
      disabled
    />
    <ControlledCheck
      label="Disabled Checked"
      value={true}
      disabled
    />
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All possible states of the CheckField component.',
    },
  },
};

interface CheckCellRow {
  id: string;
  label: string;
  value: boolean;
}

const checkCellRows: CheckCellRow[] = [
  { id: '1', label: 'Alpha', value: true },
  { id: '2', label: 'Beta', value: false },
  { id: '3', label: 'Gamma', value: false },
];

const checkCellColumns: DataTableColumn<CheckCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Check',
    ...fieldtypeToTableField('Check'),
  } as DataTableColumn<CheckCellRow>,
];

function InTableStory() {
  const [data, setData] = useState(checkCellRows);
  return (
    <YStack
      width="100%"
      height={280}>
      <DataTable
        data={data}
        columns={checkCellColumns as DataTableColumn<Record<string, any>>[]}
        enablePagination={false}
        onDataChange={(next: Record<string, any>[]) => {
          setData(next as CheckCellRow[]);
          action('onDataChange')(next);
        }}
        aria-label="Check cell editor table"
      />
    </YStack>
  );
}

/** 3-row DataTable mapped through fieldtypeToTableField("Check") — in-cell checkbox. */
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
        'Check inside a table cell: the registry maps the fieldtype to an in-cell checkbox. Three rows of mock DocType data; toggles commit through onDataChange.',
    },
  },
};
