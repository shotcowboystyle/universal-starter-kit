import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { TimePicker } from './index';

const meta: Meta<typeof TimePicker> = {
  title: 'Forms/TimePicker',
  component: TimePicker,
  parameters: {
    docs: {
      description: {
        component:
          'A time picker with iOS-style hour, minute, and AM/PM wheels: inertial snap, a fixed centre band, and looping hours/minutes.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    value: { control: 'text' },
    timeFormat: {
      control: 'select',
      options: ['12h', '24h'],
      description: 'Display format',
    },
    minuteStep: { control: 'number', description: 'Minute increment step' },
    showSeconds: { control: 'boolean' },
    placeholder: { control: 'text' },
    native: {
      control: 'boolean',
      description: 'On device, omit (default) for the OS time wheel. Set false for the catalog panel.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TimePicker>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          startTime: '09:00',
          endTime: '17:00',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={400}>
          <YStack gap="$4">
            <TimePicker label="Start Time" name="startTime" />
            <TimePicker label="End Time" name="endTime" />
            <Button action="submit">Save Schedule</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Time',
    helperText: 'Select a time',
    value: '14:30',
    timeFormat: '12h',
    minuteStep: 5,
    showSeconds: false,
  },
};

export const Basic: Story = {
  args: {
    label: 'Time',
    helperText: 'Select a time',
    value: '09:30',
    onChange: action('onChange'),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Time',
    helperText: 'This field is disabled',
    value: '09:30',
    disabled: true,
    onChange: action('onChange'),
  },
};

export const WithError: Story = {
  args: {
    label: 'Time',
    helperText: 'Select a time',
    required: true,
    error: 'Time is required',
    onChange: action('onChange'),
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={300}>
      <Text fontWeight="bold">Size $2</Text>
      <TimePicker label="Small" value="09:30" size="$2" onChange={action('onChange')} />
      <Text fontWeight="bold">Size $3</Text>
      <TimePicker label="Medium" value="09:30" size="$3" onChange={action('onChange')} />
      <Text fontWeight="bold">Size $4</Text>
      <TimePicker label="Large" value="09:30" size="$4" onChange={action('onChange')} />
    </YStack>
  ),
};

export const WithSeconds: Story = {
  args: {
    label: 'Time with Seconds',
    helperText: 'Includes seconds',
    value: '14:30:45',
    showSeconds: true,
    onChange: action('onChange'),
  },
};

export const TwelveHour: Story = {
  args: {
    label: 'Meeting Time',
    helperText: '12-hour format with AM/PM',
    value: '14:30',
    onChange: action('onChange'),
  },
};

export const TwentyFourHour: Story = {
  args: {
    label: 'Meeting Time',
    helperText: '24-hour format',
    value: '14:30',
    timeFormat: '24h',
    onChange: action('onChange'),
  },
};

export const OneMinuteStep: Story = {
  args: {
    label: 'Precise Time',
    helperText: 'Every minute selectable',
    value: '09:17',
    minuteStep: 1,
    onChange: action('onChange'),
  },
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('09:30');
      return (
        <YStack gap="$4" maxWidth={300}>
          <TimePicker
            label="Start Time"
            helperText={`Selected: ${value || 'none'}`}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
          />
          <TimePicker
            label="24h Format"
            value={value}
            timeFormat="24h"
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
          />
          <TimePicker label="Disabled" value="17:00" disabled />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Start Time', skeleton: true },
};

export const NativeOsWheel: Story = {
  name: 'Native OS wheel',
  args: {
    label: 'Start Time',
    helperText: 'Device default: iOS spinner / Android dialog. native={false} keeps the catalog.',
  },
};
