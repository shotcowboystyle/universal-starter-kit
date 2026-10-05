import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Label, Paragraph, RadioGroup as TamaguiRadioGroup, Text, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { RadioGroup } from './index';

const meta: Meta<typeof RadioGroup> = {
  title: 'Forms/RadioGroup',
  component: RadioGroup,
  parameters: {
    docs: {
      description: {
        component: 'A radio group component with form integration for single selection.',
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Label for the radio group',
    },
    helperText: {
      control: 'text',
      description: 'Helper text displayed below the radio group',
    },
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    required: {
      control: 'boolean',
      description: 'Whether the radio group is required',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the radio group is disabled',
    },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4'],
      description: 'Size of the radio group',
    },
    value: {
      control: 'text',
      description: 'The selected value',
    },
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: 'Layout orientation of the radio group',
    },
  },
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

const sampleOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          role: '',
          notifications: 'enabled',
          theme: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} className="max-w-md">
          <YStack gap="$4">
            <RadioGroup
              label="User Role"
              name="role"
              helperText="Select your role in the system"
              required
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'user', label: 'User' },
                { value: 'guest', label: 'Guest' },
              ]}
            />

            <RadioGroup
              label="Email Notifications"
              name="notifications"
              helperText="Choose how you want to receive notifications"
              options={[
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ]}
            />

            <RadioGroup
              label="Theme Preference"
              name="theme"
              helperText="Select your preferred theme"
              orientation="horizontal"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'auto', label: 'Auto' },
              ]}
            />

            <Button action="submit">Save Preferences</Button>
          </YStack>
        </Form>
      );
    };

    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Favorite color',
    helperText: 'Pick one',
    options: sampleOptions,
  },
  render: (args) => <RadioGroup {...args} />,
};

/**
 * Selection-card mode: radio in a leading slot, bold label to its right,
 * muted `option.description` under the label; the whole card selects.
 * Consumes the shared CheckboxCard primitives.
 */
export const CardMode: Story = {
  render: (args) => (
    <YStack maxWidth={400}>
      <RadioGroup
        {...args}
        card
        label="Payment methods"
        helperText={undefined}
        options={[
          {
            value: 'card',
            label: 'Credit or debit card',
            description: 'Visa, Mastercard, and American Express.',
          },
          {
            value: 'bank',
            label: 'Bank transfer',
            description: 'Direct transfer from your bank account.',
          },
          {
            value: 'wallet',
            label: 'Digital wallet',
            description: 'Apple Pay, Google Pay, or PayPal.',
          },
        ]}
        defaultValue="card"
        onChange={action('onChange')}
      />
    </YStack>
  ),
};

export const Basic: Story = {
  args: {
    label: 'Choose an option',
    helperText: 'Select one option from the list',
    name: 'basic',
    value: 'option1',
    options: sampleOptions,
    onValueChange: action('onValueChange'),
  },
};

export const Horizontal: Story = {
  args: {
    label: 'Horizontal Layout',
    helperText: 'Options arranged horizontally',
    name: 'horizontal',
    orientation: 'horizontal',
    options: sampleOptions,
  },
};

export const WithChildren: Story = {
  args: {
    label: 'Custom children',
    helperText: 'Using children instead of options prop',
    name: 'custom',
  },
  render: (args) => (
    <RadioGroup {...args}>
      <YStack gap="$2">
        {sampleOptions.map((option) => (
          <XStack key={option.value} gap="$2" alignItems="center">
            <RadioGroup.Item value={option.value} id={option.value}>
              <RadioGroup.Indicator />
            </RadioGroup.Item>
            <Label htmlFor={option.value}>{option.label}</Label>
          </XStack>
        ))}
      </YStack>
    </RadioGroup>
  ),
};

/**
 * Radio disc is R-IDENTITY: `pointy` and `borderRadius:none` leave it round
 * (Clay 2026-08-28; checkbox is the inverse).
 */
export const Pointy: Story = {
  name: 'Identity (always round)',
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <RadioGroup
        label="pointy prop (ignored — disc stays round)"
        pointy
        options={sampleOptions}
        defaultValue="option1"
      />
      <Preset overrides={{ borderRadius: 'none' }}>
        <RadioGroup label="borderRadius none (disc stays round)" options={sampleOptions} defaultValue="option1" />
      </Preset>
    </YStack>
  ),
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Radio Group',
    disabled: true,
    options: sampleOptions,
    value: 'option1',
  },
};

export const WithError: Story = {
  args: {
    label: 'Radio Group with Error',
    error: 'This field is required',
    required: true,
    options: sampleOptions,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <RadioGroup label="Small" size="$2" options={sampleOptions} />
      <RadioGroup label="Medium (default)" size="$3" options={sampleOptions} />
      <RadioGroup label="Large" size="$4" options={sampleOptions} />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('');
      return (
        <YStack gap="$4" maxWidth={400}>
          <RadioGroup label="Select an option" options={sampleOptions} value={value} onValueChange={setValue} />
          <Text>Selected: {value || 'None'}</Text>
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const Comparison: Story = {
  parameters: { foreignContrastSpecimen: true },
  render: () => {
    const ComparisonExample = () => {
      const [customVal, setCustomVal] = useState('option1');
      const [tamaguiVal, setTamaguiVal] = useState('option1');
      return (
        <XStack gap="$6" alignItems="flex-start" padding="$4">
          <YStack gap="$3" width={250}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom RadioGroup
            </Paragraph>
            <RadioGroup
              options={sampleOptions}
              value={customVal}
              onValueChange={(val) => {
                setCustomVal(val);
                action('custom.onValueChange')(val);
              }}
            />
          </YStack>

          <YStack gap="$3" width={250}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui RadioGroup
            </Paragraph>
            <TamaguiRadioGroup
              value={tamaguiVal}
              onValueChange={(val) => {
                setTamaguiVal(val);
                action('tamagui.onValueChange')(val);
              }}>
              <YStack gap="$2">
                {sampleOptions.map((option) => (
                  <XStack key={option.value} gap="$2" alignItems="center">
                    <TamaguiRadioGroup.Item value={option.value} id={`t-${option.value}`}>
                      <TamaguiRadioGroup.Indicator />
                    </TamaguiRadioGroup.Item>
                    <Label htmlFor={`t-${option.value}`}>{option.label}</Label>
                  </XStack>
                ))}
              </YStack>
            </TamaguiRadioGroup>
          </YStack>
        </XStack>
      );
    };
    return <ComparisonExample />;
  },
};

/** Loading placeholder — the skeleton mirrors control + label rows. */
export const SkeletonState: Story = {
  render: () => <RadioGroup label="Notification Preference" options={sampleOptions} skeleton />,
};
