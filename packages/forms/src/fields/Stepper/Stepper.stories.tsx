import { action } from '@repo/storybook';
import type { GuardrailSpecimenParameter } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Paragraph, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Stepper } from './index';

const meta: Meta<typeof Stepper> = {
  title: 'Forms/Stepper',
  component: Stepper,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$2', '$3', '$4'] },
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    value: { control: 'number' },
    defaultValue: { control: 'number' },
    precision: { control: 'number' },
    showButtons: { control: 'boolean' },
    buttonPosition: { control: 'select', options: ['left', 'right', 'both'] },
    allowEmpty: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Stepper>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          quantity: 5,
          price: 10.99,
          // Mid-range: a value at `min` bare-disables the decrement button at
          // rest and demos nothing.
          discount: 10,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      return (
        <Form form={form}>
          <YStack gap="$4">
            <Stepper label="Quantity" name="quantity" min={1} max={100} buttonPosition="both" />
            <Stepper label="Price" name="price" step={0.01} precision={2} min={0} />
            <Stepper label="Discount (%)" name="discount" min={0} max={50} step={5} />
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
    label: 'Quantity',
    placeholder: '0',
    helperText: 'Enter a number',
    disabled: false,
    required: false,
    size: '$3',
    min: 0,
    max: 100,
    step: 1,
  },
  render: (args) => <Stepper {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Quantity',
    error: undefined,
    helperText: 'Enter a number between 1 and 100',
    defaultValue: 5,
    min: 1,
    max: 100,
  },
};

export const Disabled: Story = {
  parameters: {
    // Allowlist: this story IS the disabled-dial demo. Stepper has no
    // disabledReason plumbing (component-contract change, tracked separately),
    // so its +/- buttons bare-disable here by design. The warn still fires;
    // the harvester tolerates exactly this code on this story.
    guardrailSpecimen: {
      warns: ['bare-disabled'],
      reason: 'Disabled-dial specimen: the whole field rests disabled and Stepper has no disabledReason plumbing yet.',
    } satisfies GuardrailSpecimenParameter,
  },
  args: {
    label: 'Disabled Field',
    disabled: true,
    placeholder: 'Cannot interact',
  },
};

export const WithError: Story = {
  args: {
    label: 'Field with Error',
    error: 'This field is required',
    required: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Stepper label="Small" size="$2" placeholder="Small input" />
      <Stepper label="Medium (default)" size="$3" placeholder="Medium input" />
      <Stepper label="Large" size="$4" placeholder="Large input" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState<number | null>(0);
      return (
        <YStack gap="$4" maxWidth={400}>
          <Stepper
            label="Quantity"
            value={value}
            onChange={(val: number | null) => {
              setValue(val);
              action('onChange')(val);
            }}
            min={0}
            max={100}
            step={1}
          />
          <Paragraph size="$2">Current value: {value ?? 'empty'}</Paragraph>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the stepper row anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Quantity', skeleton: true },
};
