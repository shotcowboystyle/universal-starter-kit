import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Calendar } from './Calendar';
import { DateRangePicker } from './DateRangePicker';
import { DatetimePicker } from './DatetimePicker';
import { MonthPicker } from './MonthPicker';
import { MultiDatePicker } from './MultiDatePicker';

import { DatePicker } from './index';

const meta: Meta<typeof DatePicker> = {
  title: 'Forms/DatePicker',
  component: DatePicker,
  parameters: {
    docs: {
      description: {
        component:
          'Date picker with animated calendar, month/year drill-down, and responsive sheet for mobile. Includes Calendar, DateRangePicker, and MultiDatePicker variants.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    disabled: { control: 'boolean', description: 'Disable the date picker' },
    readOnly: { control: 'boolean', description: 'Read-only display' },
    skeleton: { control: 'boolean', description: 'Render a skeleton placeholder' },
    compact: { control: 'boolean', description: 'Use compact density (tighter layout gaps)' },
    value: { control: 'text', description: 'Controlled value (ISO string)' },
    defaultValue: { control: 'text', description: 'Initial value (ISO string)' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
    format: { control: 'text', description: 'Date format string' },
    minDate: { control: 'date', description: 'Minimum selectable date' },
    maxDate: { control: 'date', description: 'Maximum selectable date' },
    native: {
      control: 'boolean',
      description: 'On device, omit (default) for the OS calendar. Set false to keep the catalog calendar.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DatePicker>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          birthDate: new Date('1990-01-01'),
          startDate: null,
          endDate: null,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={400}>
            <DatePicker label="Birth Date" name="birthDate" helperText="Select your date of birth" />
            <DatePicker label="Start Date" name={'startDate' as any} helperText="Select project start date" />
            <DatePicker label="End Date" name={'endDate' as any} helperText="Select project end date" />
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Date',
    placeholder: 'Select a date',
    helperText: 'Choose a date',
  },
  render: (args) => <DatePicker {...args} />,
};

export const StateContract: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    const [edits, setEdits] = useState(0);
    return (
      <YStack gap="$4" maxWidth={400}>
        <DatePicker label="Saved date" defaultValue="1990-01-01" />
        <DatePicker
          label="Programmatic date"
          value={value}
          onChange={() => {
            setEdits((count) => count + 1);
          }}
        />
        <Button
          onPress={() => {
            setValue('2026-03-05');
          }}>
          Load date
        </Button>
        <Text>{`User edits: ${edits}`}</Text>
        <DatePicker label="Read-only date" value="1990-01-01" readOnly />
        <DatePicker label="Disabled date" value="1990-01-01" disabled />
      </YStack>
    );
  },
};

export const Basic: Story = {
  render: (args) => <DatePicker {...args} />,
  args: {
    label: 'Select Date',
    placeholder: 'Choose a date',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Date',
    disabled: true,
    placeholder: 'Cannot select',
  },
};

export const WithError: Story = {
  args: {
    label: 'Required Date',
    // Error copy states the rule broken — never "please"/"invalid"/"error".
    error: 'A date is required',
    required: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <DatePicker label="Small" size="$2" placeholder="Pick a date" />
      <DatePicker label="Medium (default)" size="$3" placeholder="Pick a date" />
      <DatePicker label="Large" size="$4" placeholder="Pick a date" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [date, setDate] = useState('');
      return (
        <YStack gap="$4" maxWidth={400}>
          <DatePicker
            label="Pick a Date"
            value={date}
            // @ts-expect-error controlled mode not supported
            onChange={(val: string) => {
              setDate(val);
              action('onChange')(val);
            }}
            placeholder="Choose a date"
            helperText={date ? `Selected: ${date}` : 'No date selected'}
          />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

// --- Calendar variant ---

export const CalendarBasic = () => (
  <YStack maxWidth={700}>
    <Calendar />
  </YStack>
);

// --- DateRangePicker variant ---

export const RangePickerBasic = {
  render: (args: ComponentProps<typeof DateRangePicker>) => <DateRangePicker {...args} />,
  args: {
    label: 'Date Range',
    placeholder: 'Start date – End date',
    helperText: 'Select a start and end date',
  },
};

// --- MultiDatePicker variant ---

export const MultiPickerBasic = {
  render: (args: ComponentProps<typeof MultiDatePicker>) => <MultiDatePicker {...args} />,
  args: {
    label: 'Select Dates',
    placeholder: 'Pick multiple dates',
    limit: 5,
    helperText: 'Select up to 5 dates',
  },
};

// --- MonthPicker variant ---

export const MonthPickerBasic = {
  render: (args: ComponentProps<typeof MonthPicker>) => <MonthPicker {...args} />,
  args: {
    label: 'Select Month',
    placeholder: 'Pick a month',
    helperText: 'Choose a month and year',
  },
};

export const MonthPickerWithYearRange = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <MonthPicker
        label="Fiscal Period"
        placeholder="Select fiscal period"
        helperText="Choose between 2020 and 2030"
        minYear={2020}
        maxYear={2030}
      />
    </YStack>
  ),
};

// --- DatetimePicker variant ---

export const DatetimePickerBasic = {
  render: (args: ComponentProps<typeof DatetimePicker>) => <DatetimePicker {...args} />,
  args: {
    label: 'Select Date & Time',
    placeholder: 'Pick date and time',
    helperText: 'Choose a date and time',
  },
};

export const DatetimePicker24Hour = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <DatetimePicker
        label="Meeting Time"
        placeholder="Select meeting time"
        helperText="24-hour format"
        timeFormat="24h"
      />
    </YStack>
  ),
};

export const DatetimePickerWithSeconds = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <DatetimePicker label="Precise Timestamp" placeholder="Select exact time" helperText="With seconds" showSeconds />
    </YStack>
  ),
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Birth Date', skeleton: true },
};

export const NativeOsPicker: Story = {
  name: 'Native OS picker',
  args: {
    label: 'Birth Date',
    helperText: 'Device default: iOS calendar / Android dialog. native={false} keeps the catalog.',
  },
};
