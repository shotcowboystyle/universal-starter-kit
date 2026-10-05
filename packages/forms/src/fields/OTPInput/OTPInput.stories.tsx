import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';
import { Input } from '../Input';

import { OTPInput } from './index';

const meta: Meta<typeof OTPInput> = {
  title: 'Forms/OTPInput',
  component: OTPInput,
  parameters: {
    docs: {
      description: {
        component: 'A one-time password input component with form integration for secure verification codes.',
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the OTP input',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the OTP input',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    required: {
      control: 'boolean',
      description: 'Whether the OTP input is required',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the OTP input is disabled',
    },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4'],
      description: 'Size of the OTP input',
    },
    length: {
      control: 'number',
      description: 'Number of input fields',
    },
    value: {
      control: 'text',
      description: 'Current OTP value',
    },
    type: {
      control: 'select',
      options: ['numeric', 'alphanumeric', 'password'],
      description: 'Input type restriction',
    },
  },
};

export default meta;
type Story = StoryObj<typeof OTPInput>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          phoneNumber: '',
          verificationCode: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
          // Simulate verification process
          await new Promise((resolve) => setTimeout(resolve, 1000));
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={400}>
          <YStack gap="$4">
            <Input label="Phone Number" placeholder="+1 (555) 123-4567" />

            <OTPInput
              label="Verification Code"
              name="verificationCode"
              length={6}
              helperText="Enter the 6-digit code sent to your phone"
              required
            />

            <Button action="submit">Verify Phone Number</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Verification Code',
    helperText: 'Enter the 6-digit code',
    length: 6,
  },
  render: (args) => <OTPInput {...args} />,
};

export const Basic: Story = {
  args: {
    label: 'Verification Code',
    helperText: 'Enter the 6-digit code sent to your phone',
    name: 'otp',
    length: 6,
    onChange: action('onChange'),
    onComplete: action('onComplete'),
  },
};

export const Filled: Story = {
  args: {
    label: 'Verification Code',
    helperText: 'Enter the 6-digit code',
    length: 6,
    value: '482193',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled OTP',
    disabled: true,
    length: 6,
  },
};

export const WithError: Story = {
  args: {
    label: 'OTP with Error',
    error: 'This field is required',
    required: true,
    length: 6,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <OTPInput label="Small" size="$2" length={6} />
      <OTPInput label="Medium (default)" size="$3" length={6} />
      <OTPInput label="Large" size="$4" length={6} />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('');
      return (
        <YStack gap="$4" maxWidth={400}>
          <OTPInput label="Enter Code" length={6} value={value} onChange={setValue} />
          <Text>Current value: {value || 'Empty'}</Text>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const AutoSubmit: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const AutoSubmitDemo = () => {
      const [submittedValue, setSubmittedValue] = useState('');

      const handleComplete = (value: string) => {
        setSubmittedValue(value);
        action('Auto-submitted')(value);
      };

      return (
        <YStack gap="$4">
          <OTPInput {...args} onComplete={handleComplete} />

          {submittedValue ? (
            <Text fontWeight="600">Submitted {submittedValue}</Text>
          ) : (
            <Text>Enter a complete 6-digit code to auto-submit.</Text>
          )}
        </YStack>
      );
    };

    return <AutoSubmitDemo />;
  },
};

/** Loading placeholder — the skeleton mirrors the cell row anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Verification Code', skeleton: true },
};
