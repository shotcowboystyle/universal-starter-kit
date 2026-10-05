import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { DatetimePicker } from './DatetimePicker';

const meta: Meta<typeof DatetimePicker> = {
  title: 'Forms/DatetimePicker',
  component: DatetimePicker,
  parameters: {
    docs: {
      description: {
        component:
          'Combined date + time picker. Date stays a calendar grid; time uses iOS hour/minute/AM-PM wheels with a fixed centre band.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    disabled: { control: 'boolean', description: 'Disable the picker' },
    readOnly: { control: 'boolean', description: 'Read-only display' },
    skeleton: { control: 'boolean', description: 'Render a skeleton placeholder' },
    compact: { control: 'boolean', description: 'Use compact density (tighter layout gaps)' },
    timeFormat: { control: 'select', options: ['12h', '24h'], description: 'Clock format' },
    minuteStep: { control: 'number', description: 'Minute increment' },
    showSeconds: { control: 'boolean', description: 'Show a seconds column' },
    value: { control: 'text', description: 'Controlled value (Date or ISO string)' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
  },
  args: {
    label: 'Select Date & Time',
    placeholder: 'Pick date and time',
  },
};

export default meta;
type Story = StoryObj<typeof DatetimePicker>;

export const Baseline: Story = {
  render: (args) => <DatetimePicker {...args} helperText={args.helperText ?? 'Choose a date and time'} />,
};

export const StateContract: Story = {
  render: () => {
    const [value, setValue] = useState<Date | null>(null);
    const [edits, setEdits] = useState(0);
    const saved = new Date(2026, 0, 15, 9, 30);
    return (
      <YStack gap="$4" maxWidth={400}>
        <DatetimePicker label="Saved date and time" defaultValue={saved} />
        <DatetimePicker
          label="Programmatic date and time"
          value={value}
          onChange={() => {
            setEdits((count) => count + 1);
          }}
        />
        <Button
          onPress={() => {
            setValue(new Date(2026, 2, 5, 14, 30));
          }}>
          Load date and time
        </Button>
        <Text>{`User edits: ${edits}`}</Text>
        <DatetimePicker label="Read-only date and time" value={saved} readOnly />
        <DatetimePicker label="Disabled date and time" value={saved} disabled />
      </YStack>
    );
  },
};

export const TwentyFourHour: Story = {
  args: { timeFormat: '24h', helperText: '24-hour format' },
};

export const WithSeconds: Story = {
  args: { showSeconds: true, helperText: 'With seconds' },
};

export const MinuteStepSeven: Story = {
  args: { minuteStep: 7, helperText: 'Minute step 7 (does not divide 60)' },
};

export const JanThirtyOne: Story = {
  args: {
    defaultValue: '2026-01-31T12:00:00' as any,
    helperText: 'Starts on Jan 31 — use the next-month arrow to test month-boundary arithmetic',
  },
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Cannot select' },
};

export const ReadOnly: Story = {
  args: { readOnly: true, defaultValue: '2026-01-15T09:30:00' as any },
};

export const WithError: Story = {
  args: { error: 'A date and time is required', required: true },
};

export const SkeletonState: Story = {
  args: { skeleton: true },
};

export const Compact: Story = {
  args: { compact: true, helperText: 'Compact sizing' },
};

export const ControlledRejection: Story = {
  render: () => {
    const Example = () => {
      const [pinned] = useState(() => new Date(2026, 5, 15, 10, 30, 0));
      const [attempts, setAttempts] = useState(0);
      return (
        <YStack gap="$4" maxWidth={480}>
          <DatetimePicker
            label="Pinned Value"
            value={pinned}
            onValueChange={(v) => {
              setAttempts((a) => a + 1);
              action('onValueChange')(v);
            }}
            helperText="Parent ignores onValueChange — the value must not drift"
          />
          <Text>{`attempts:${attempts}`}</Text>
        </YStack>
      );
    };
    return <Example />;
  },
};

export const FormBound: Story = {
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: { when: null as Date | null },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      const FormSubscribe = (form as any).Subscribe;
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={480}>
            <DatetimePicker label="Appointment" name={'when' as any} required helperText="Pick appointment time" />
            <FormSubscribe selector={(s: any) => [s.values.when]}>
              {([when]: any[]) => (
                <Text>{`form-value:${when instanceof Date ? when.toISOString() : JSON.stringify(when)}`}</Text>
              )}
            </FormSubscribe>
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};
