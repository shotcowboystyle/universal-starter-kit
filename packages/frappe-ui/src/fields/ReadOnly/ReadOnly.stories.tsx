import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../field-registry';
import { FrappeStoryProvider } from '../../frappe-story-target';

import { ReadOnly } from '.';

// hex-escape: Color field values are hex strings: specimen data, not paint

export default {
  title: 'FrappeUI/ReadOnly',
  component: ReadOnly,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A read-only display field for showing non-editable values with proper formatting for all Frappe field types.',
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: [
        'Data',
        'Int',
        'Float',
        'Currency',
        'Percent',
        'Date',
        'Datetime',
        'Time',
        'Check',
        'Select',
        'Link',
        'Color',
        'Text',
        'SmallText',
        'LongText',
      ],
      description: 'The type of value to display',
    },
    label: { control: 'text', description: 'Field label' },
    value: { control: 'text', description: 'Value to display' },
    emptyText: { control: 'text', description: 'Text to show when value is empty' },
    currencySymbol: { control: 'text', description: 'Currency symbol for Currency type' },
    precision: { control: 'number', description: 'Decimal precision for Float type' },
  },
};

export const AllTypes = () => (
  <YStack
    gap="$4"
    width={400}>
    <ReadOnly
      label="Data"
      value="John Doe"
      type="Data"
    />
    <ReadOnly
      label="Int"
      value={42}
      type="Int"
    />
    <ReadOnly
      label="Float"
      value={99.99}
      type="Float"
      precision={2}
    />
    {/* Same values as Forms/FieldDisplay AllTypes (stepper currency + datepicker)
        so the two stories can be diffed for identical formatting. */}
    <ReadOnly
      label="Currency"
      value={1234.5}
      type="Currency"
      currencySymbol="$"
    />
    <ReadOnly
      label="Percent"
      value={75}
      type="Percent"
    />
    <ReadOnly
      label="Date"
      value="2026-01-15"
      type="Date"
    />
    <ReadOnly
      label="Datetime"
      value="2026-01-24 14:30"
      type="Datetime"
    />
    <ReadOnly
      label="Time"
      value="14:30"
      type="Time"
    />
    <ReadOnly
      label="Check (Yes)"
      value={true}
      type="Check"
    />
    <ReadOnly
      label="Check (No)"
      value={false}
      type="Check"
    />
    <ReadOnly
      label="Color"
      value="#10B981"
      type="Color"
    />
    <ReadOnly
      label="Link"
      value="DOC-001"
      type="Link"
    />
    <ReadOnly
      label="Empty"
      value={undefined}
      type="Data"
    />
  </YStack>
);
AllTypes.parameters = {
  docs: {
    description: {
      story: 'All supported field types in the ReadOnlyField component.',
    },
  },
};

AllTypes.storyName = 'Main';
export const ProfileCardExample = () => (
  <YStack
    gap="$3"
    width={400}
    padding="$4"
    borderWidth={1}
    borderColor="$borderColor"
    borderRadius="$4">
    <ReadOnly
      label="Name"
      value="Jane Smith"
      type="Data"
    />
    <ReadOnly
      label="Email"
      value="jane@company.com"
      type="Data"
    />
    <ReadOnly
      label="Department"
      value="Engineering"
      type="Link"
    />
    <ReadOnly
      label="Employee ID"
      value="EMP-042"
      type="Data"
    />
    <ReadOnly
      label="Joining Date"
      value="2023-06-15"
      type="Date"
    />
    <ReadOnly
      label="Active"
      value={true}
      type="Check"
    />
    <ReadOnly
      label="Salary"
      value={85_000}
      type="Currency"
      currencySymbol="$"
    />
  </YStack>
);
ProfileCardExample.parameters = {
  docs: {
    description: {
      story: 'Real-world example of using ReadOnlyField to display a profile card.',
    },
  },
};

interface ReadOnlyCellRow {
  id: string;
  label: string;
  value: string;
}

const readOnlyCellRows: ReadOnlyCellRow[] = [
  { id: '1', label: 'Alpha', value: 'Jane Smith' },
  { id: '2', label: 'Beta', value: 'EMP-042' },
  { id: '3', label: 'Gamma', value: '' },
];

const readOnlyCellColumns: DataTableColumn<ReadOnlyCellRow>[] = [
  { accessorKey: 'label', header: 'Row' },
  {
    accessorKey: 'value',
    header: 'Read Only',
    ...fieldtypeToTableField('Read Only'),
  } as DataTableColumn<ReadOnlyCellRow>,
];

const InTableStory = () => (
  <YStack
    width="100%"
    height={280}>
    <DataTable
      data={readOnlyCellRows}
      columns={readOnlyCellColumns}
      enablePagination={false}
      readOnly
      aria-label="Read Only cell table"
    />
  </YStack>
);

/** 3-row DataTable mapped through fieldtypeToTableField("Read Only") — read-only cells. */
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
        'Read Only inside a table cell: the registry maps the fieldtype to a read-only input. Three rows of mock DocType data; the table is mounted readOnly so cells cannot commit.',
    },
  },
};
