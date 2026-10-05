import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { DateRangePicker } from './DateRangePicker';

const meta: Meta<typeof DateRangePicker> = {
  title: 'Forms/DateRangePicker',
  component: DateRangePicker,
  parameters: {
    docs: {
      description: {
        component:
          'Start/end date range picker with dual-calendar popup, range highlighting, and automatic inversion when the second click is before the first.',
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
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
  },
  args: {
    label: 'Date Range',
    placeholder: 'Start date – End date',
  },
};

export default meta;
type Story = StoryObj<typeof DateRangePicker>;

export const Baseline: Story = {
  render: (args) => <DateRangePicker {...args} helperText={args.helperText ?? 'Select a start and end date'} />,
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Cannot select' },
};

export const ReadOnly: Story = {
  args: { readOnly: true, helperText: 'Read-only display' },
};

export const WithError: Story = {
  args: { error: 'A complete range is required', required: true },
};

export const SkeletonState: Story = {
  args: { skeleton: true },
};

export const Compact: Story = {
  args: { compact: true, helperText: 'Compact sizing' },
};

export const MinMax: Story = {
  render: (args) => {
    const now = new Date();
    return (
      <DateRangePicker
        {...args}
        label="Mid-month range"
        helperText="Only the 5th through the 25th of this month are selectable"
        minDate={new Date(now.getFullYear(), now.getMonth(), 5)}
        maxDate={new Date(now.getFullYear(), now.getMonth(), 25)}
      />
    );
  },
};

export const FormBound: Story = {
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: { range: null as { start: Date | null; end: Date | null } | null },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      const FormSubscribe = (form as any).Subscribe;
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={480}>
            <DateRangePicker label="Trip Dates" name={'range' as any} required helperText="Select trip start and end" />
            <FormSubscribe selector={(s: any) => [s.values.range]}>
              {([range]: any[]) => <Text>{`form-value:${JSON.stringify(range)}`}</Text>}
            </FormSubscribe>
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

interface InTableRow {
  id: string;
  label: string;
  value: { start: Date | null; end: Date | null };
}
