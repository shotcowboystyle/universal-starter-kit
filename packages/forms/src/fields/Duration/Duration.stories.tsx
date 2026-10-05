import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Duration } from './index';

const meta: Meta<typeof Duration> = {
  title: 'Forms/Duration',
  component: Duration,
  parameters: {
    docs: {
      description: {
        component: 'A duration field with day/hour/minute/second segments in one outer box, plus quick-select presets.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4', '$6'] },
    value: { control: 'number', description: 'Duration in seconds' },
    showSeconds: { control: 'boolean', description: 'Show seconds segment' },
    hideDays: { control: 'boolean', description: 'Fold days into hours' },
    readOnly: { control: 'boolean' },
    compact: { control: 'boolean' },
    clockIcon: { control: false, description: 'Leading clock; pass null to hide' },
    skeleton: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Duration>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          workTime: 28800,
          breakTime: 3600,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={400}>
          <YStack gap="$4">
            <Duration label="Work Duration" name="workTime" helperText="How long did you work?" />
            <Duration label="Break Duration" name="breakTime" helperText="Total break time" />
            <Button action="submit">Log Time</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Duration',
    helperText: 'How long?',
    value: 5400,
    showSeconds: false,
    placeholder: 'Select duration',
  },
};

export const Basic: Story = {
  args: {
    label: 'Duration',
    helperText: 'Select a time duration',
    value: 5400,
    onChange: action('onChange'),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Duration',
    helperText: 'This field is disabled',
    value: 5400,
    disabled: true,
    onChange: action('onChange'),
  },
};

export const WithError: Story = {
  args: {
    label: 'Duration',
    helperText: 'Select a time duration',
    value: 0,
    required: true,
    error: 'Duration is required',
    onChange: action('onChange'),
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={300}>
      <Text fontWeight="bold">Size $2</Text>
      <Duration label="Small" value={3600} size="$2" onChange={action('onChange')} />
      <Text fontWeight="bold">Size $3</Text>
      <Duration label="Medium" value={3600} size="$3" onChange={action('onChange')} />
      <Text fontWeight="bold">Size $4</Text>
      <Duration label="Large" value={3600} size="$4" onChange={action('onChange')} />
    </YStack>
  ),
};

export const FullWidth: Story = {
  name: 'FullWidth',
  render: () => (
    <YStack width="100%" gap="$4">
      <Duration
        label="Full width"
        helperText="Clock and segments stay on the left of a stretched box"
        value={3600}
        onChange={action('onChange')}
      />
      <Duration
        label="Small"
        size="$3"
        helperText="Segment inputs fill the 36px box"
        value={3600}
        onChange={action('onChange')}
      />
    </YStack>
  ),
};

export const WithSeconds: Story = {
  args: {
    label: 'Precise Duration',
    helperText: 'Includes seconds',
    value: 3661,
    showSeconds: true,
    onChange: action('onChange'),
  },
};

export const WithDays: Story = {
  args: {
    label: 'Resolution Time',
    helperText: 'Days stay first-class (Frappe hide_days off)',
    value: 100000,
    hideDays: false,
    showSeconds: true,
    onChange: action('onChange'),
  },
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState(5400);
      const h = Math.floor(value / 3600);
      const m = Math.floor((value % 3600) / 60);
      return (
        <YStack gap="$4" maxWidth={300}>
          <Duration
            label="Session Length"
            helperText={`${h}h ${m}m selected`}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
          />
          <Duration label="Disabled" value={7200} disabled />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Estimated Time', skeleton: true },
};

export const ReadOnly: Story = {
  args: {
    label: 'Logged time',
    helperText: 'Read-only fact',
    value: 5400,
    readOnly: true,
  },
};

export const HideClock: Story = {
  args: {
    label: 'Duration',
    value: 3600,
    clockIcon: null,
  },
};

export const Compact: Story = {
  args: {
    label: 'Compact',
    value: 1800,
    compact: true,
  },
};
