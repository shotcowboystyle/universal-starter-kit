import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { PhoneInput } from './index';

const meta: Meta<typeof PhoneInput> = {
  title: 'Forms/PhoneInput',
  component: PhoneInput,
  parameters: {
    docs: {
      description: {
        component: 'A phone number input component with country selection and international formatting.',
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the phone input',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text for the input',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the phone input',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    required: {
      control: 'boolean',
      description: 'Whether the phone input is required',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the phone input is disabled',
    },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4'],
      description: 'Size of the phone input',
    },
    defaultCountry: {
      control: 'text',
      description: "Default country code (e.g., 'US', 'GB', 'CA')",
    },
  },
};

export default meta;
type Story = StoryObj<typeof PhoneInput>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          primaryPhone: '',
          secondaryPhone: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} className="max-w-md">
          <YStack gap="$4">
            <PhoneInput label="Primary Phone" name="primaryPhone" helperText="Your main contact number" required />

            <PhoneInput
              label="Secondary Phone"
              name="secondaryPhone"
              helperText="Alternative contact number (optional)"
            />

            <Button action="submit">Save Contact Info</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Phone Number',
    helperText: 'Include country code',
    defaultCountry: 'US',
  },
  render: (args) => <PhoneInput {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Phone Number',
    helperText: 'Enter your phone number',
    name: 'phone',
    defaultCountry: 'US',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Phone',
    disabled: true,
    defaultCountry: 'US',
  },
};

export const WithError: Story = {
  args: {
    label: 'Phone with Error',
    error: 'This field is required',
    required: true,
    defaultCountry: 'US',
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <PhoneInput label="Small" size="$2" defaultCountry="US" />
      <PhoneInput label="Medium (default)" size="$3" defaultCountry="US" />
      <PhoneInput label="Large" size="$4" defaultCountry="US" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('');
      return (
        <YStack gap="$4" maxWidth={400}>
          <PhoneInput label="Phone Number" defaultCountry="US" value={value} onChange={setValue} />
          <Text>Current value: {value || 'Empty'}</Text>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const DifferentCountries: Story = {
  render: () => (
    <YStack gap="$4" padding="$4">
      <PhoneInput label="US Phone Number" name="usPhone" defaultCountry="US" helperText="United States format" />

      <PhoneInput label="UK Phone Number" name="ukPhone" defaultCountry="GB" helperText="United Kingdom format" />

      <PhoneInput label="Canada Phone Number" name="caPhone" defaultCountry="CA" helperText="Canada format" />

      <PhoneInput label="Germany Phone Number" name="dePhone" defaultCountry="DE" helperText="Germany format" />
    </YStack>
  ),
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  render: () => <PhoneInput label="Phone Number" skeleton />,
};
