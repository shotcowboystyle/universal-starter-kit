import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { MultiDatePicker } from './MultiDatePicker';

const meta: Meta<typeof MultiDatePicker> = {
  title: 'Forms/MultiDatePicker',
  component: MultiDatePicker,
  parameters: {
    docs: {
      description: {
        component: 'Multiple-date picker built on the DatePicker calendar. Toggle-selects up to `limit` dates.',
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
    limit: { control: 'number', description: 'Max number of selectable dates' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
  },
  args: {
    label: 'Select Dates',
    placeholder: 'Pick multiple dates',
    limit: 5,
  },
};

export default meta;
type Story = StoryObj<typeof MultiDatePicker>;

export const Baseline: Story = {
  render: (args) => <MultiDatePicker {...args} helperText={args.helperText ?? 'Up to 5 dates'} />,
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Cannot select' },
};

export const ReadOnly: Story = {
  args: { readOnly: true, helperText: 'Read-only display' },
};

export const WithError: Story = {
  args: { error: 'Pick at least one date', required: true },
};

export const SkeletonState: Story = {
  args: { skeleton: true },
};

export const Compact: Story = {
  args: { compact: true, helperText: 'Compact sizing' },
};

export const LimitOne: Story = {
  args: { limit: 1, helperText: 'Only one date allowed' },
};

export const MinMax: Story = {
  render: (args) => {
    const now = new Date();
    return (
      <MultiDatePicker
        {...args}
        label="Mid-month only"
        helperText="Only the 10th through the 20th of this month are selectable"
        minDate={new Date(now.getFullYear(), now.getMonth(), 10)}
        maxDate={new Date(now.getFullYear(), now.getMonth(), 20)}
      />
    );
  },
};

export const FormBound: Story = {
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: { dates: [] as Date[] },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      const FormSubscribe = (form as any).Subscribe;
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={480}>
            <MultiDatePicker
              label="Meeting Days"
              name={'dates' as any}
              required
              helperText="Select up to 5 meeting days"
            />
            <FormSubscribe selector={(s: any) => [s.values.dates]}>
              {([dates]: any[]) => (
                <Text>
                  {`form-value:${JSON.stringify(
                    Array.isArray(dates) ? dates.map((d: any) => (d instanceof Date ? d.toDateString() : d)) : dates,
                  )}`}
                </Text>
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
