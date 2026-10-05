import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { MonthPicker } from './MonthPicker';

const meta: Meta<typeof MonthPicker> = {
  title: 'Forms/MonthPicker',
  component: MonthPicker,
  parameters: {
    docs: {
      description: {
        component:
          'Month + year picker with a 4x3 month grid, paginated year grid, and optional min/max year clamping.',
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
    minYear: { control: 'number', description: 'Minimum selectable year' },
    maxYear: { control: 'number', description: 'Maximum selectable year' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
  },
  args: {
    label: 'Select Month',
    placeholder: 'Pick a month',
  },
};

export default meta;
type Story = StoryObj<typeof MonthPicker>;

export const Baseline: Story = {
  render: (args) => <MonthPicker {...args} helperText={args.helperText ?? 'Choose a month and year'} />,
};

export const YearRange: Story = {
  args: {
    minYear: 2020,
    maxYear: 2030,
    helperText: 'Clamped between 2020 and 2030',
  },
};

export const ReversedYearRange: Story = {
  args: {
    minYear: 2030,
    maxYear: 2020,
    helperText: 'minYear > maxYear (reversed range edge case)',
  },
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Cannot select' },
};

export const ReadOnly: Story = {
  args: { readOnly: true, helperText: 'Read-only display' },
};

export const WithError: Story = {
  args: { error: 'A month is required', required: true },
};

export const SkeletonState: Story = {
  args: { skeleton: true },
};

export const Compact: Story = {
  args: { compact: true, helperText: 'Compact sizing' },
};

export const FormBound: Story = {
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: { period: null as { year: number; month: number } | null },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      const FormSubscribe = (form as any).Subscribe;
      return (
        <Form form={form}>
          <YStack gap="$4" maxWidth={480}>
            <MonthPicker label="Fiscal Period" name={'period' as any} required helperText="Pick a fiscal period" />
            <FormSubscribe selector={(s: any) => [s.values.period]}>
              {([period]: any[]) => <Text>{`form-value:${JSON.stringify(period)}`}</Text>}
            </FormSubscribe>
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};
