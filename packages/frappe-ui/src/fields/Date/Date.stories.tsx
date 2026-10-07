import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { Date } from '.';
import type { DateProps } from '.';

export default {
  title: 'FrappeUI/Date',
  component: Date,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'A date/datetime/time picker field for Frappe Date, Datetime, and Time field types.',
      },
    },
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['date', 'datetime', 'time'],
      description: 'The type of date field to render',
    },
    label: { control: 'text', description: 'Field label' },
    disabled: { control: 'boolean', description: 'Disable the field' },
    required: { control: 'boolean', description: 'Mark as required' },
    error: { control: 'text', description: 'Error message to display' },
  },
};

function ControlledDate(props: Omit<DateProps, 'onChange'>) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Date
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

export const Default = (args: DateProps) => <ControlledDate {...args} />;
Default.args = {
  label: 'Date',
  type: 'date',
} satisfies Partial<DateProps>;

Default.storyName = 'Main';
export const DateType = (args: DateProps) => <ControlledDate {...args} />;
DateType.args = {
  label: 'Birth Date',
  type: 'date',
  value: '2000-01-15',
} satisfies Partial<DateProps>;

export const DatetimeType = (args: DateProps) => <ControlledDate {...args} />;
DatetimeType.args = {
  label: 'Meeting Start',
  type: 'datetime',
  value: '2026-01-24T14:30',
} satisfies Partial<DateProps>;
DatetimeType.parameters = {
  docs: {
    description: {
      story: 'Datetime type includes both date and time selection.',
    },
  },
};

export const TimeType = (args: DateProps) => <ControlledDate {...args} />;
TimeType.args = {
  label: 'Daily Reminder',
  type: 'time',
  value: '09:00',
} satisfies Partial<DateProps>;
TimeType.parameters = {
  docs: {
    description: {
      story: 'Time type for time-only input.',
    },
  },
};

export const Required = (args: DateProps) => <ControlledDate {...args} />;
Required.args = {
  label: 'Start Date',
  type: 'date',
  required: true,
} satisfies Partial<DateProps>;

export const WithError = (args: DateProps) => <ControlledDate {...args} />;
WithError.args = {
  label: 'End Date',
  type: 'date',
  error: 'End date must be after start date',
} satisfies Partial<DateProps>;

export const Disabled = (args: DateProps) => <ControlledDate {...args} />;
Disabled.args = {
  label: 'Created On',
  type: 'datetime',
  value: '2026-01-01T10:00',
  disabled: true,
} satisfies Partial<DateProps>;

export const AllTypes = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledDate
      label="Date Only"
      type="date"
      value="2026-01-24"
    />
    <ControlledDate
      label="Date and Time"
      type="datetime"
      value="2026-01-24T14:30"
    />
    <ControlledDate
      label="Time Only"
      type="time"
      value="14:30"
    />
  </YStack>
);
AllTypes.parameters = {
  docs: {
    description: {
      story: 'All three date field types: date, datetime, and time.',
    },
  },
};

export const AllStates = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledDate
      label="Default (Empty)"
      type="date"
    />
    <ControlledDate
      label="With Value"
      type="date"
      value="2026-06-15"
    />
    <ControlledDate
      label="Required"
      type="date"
      required
    />
    <ControlledDate
      label="With Error"
      type="date"
      error="A valid date is required"
    />
    <ControlledDate
      label="Disabled"
      type="date"
      value="2026-01-01"
      disabled
    />
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All possible states of the DateField component.',
    },
  },
};

export const EventSchedulingExample = () => (
  <YStack
    gap="$4"
    width={400}>
    <ControlledDate
      label="Event Date"
      type="date"
      value="2026-02-14"
      required
    />
    <ControlledDate
      label="Start Time"
      type="time"
      value="09:00"
      required
    />
    <ControlledDate
      label="End Time"
      type="time"
      value="17:00"
      required
    />
  </YStack>
);
EventSchedulingExample.parameters = {
  docs: {
    description: {
      story: 'Real-world example of using DateField for event scheduling.',
    },
  },
};

interface DateRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<DateRow[]>([
      { id: '1', label: 'Alpha', value: '2026-02-14' },
      { id: '2', label: 'Beta', value: '2026-06-15' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<DateRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Date', ...fieldtypeToTableField('Date') },
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
