import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Input as TamaguiInput, Paragraph, XStack, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Input } from './index';

const meta: Meta<typeof Input> = {
  title: 'Forms/Input',
  component: Input,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    compact: { control: 'boolean' },
    chromeless: { control: 'boolean' },
    labelHidden: { control: 'boolean' },
    copy: { control: 'boolean' },
    size: { control: 'select', options: ['$3', '$4', '$5'] },
    value: { control: 'text' },
    defaultValue: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          firstName: '',
          email: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <Input label="First name" name="firstName" placeholder="Jane" required />
            <Input
              label="Email"
              name="email"
              placeholder="jane@example.com"
              required
              validators={{
                onBlur: ({ value }) => {
                  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) {
                    return 'Invalid email address';
                  }
                },
              }}
            />
            <Button action="submit">Submit</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Basic: Story = {
  args: {
    label: 'Full name',
    placeholder: 'Enter your name',
    helperText: 'This appears on your profile',
    defaultValue: '',
  },
  render: (args) => (
    <Input
      onChangeText={(text) => action('onChangeText')(text)}
      rightIcon=<XIcon />
      leftIcon=<MagnifyingGlassIcon />
      {...args}
    />
  ),
};

export const Disabled: Story = {
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

/**
 * Density and size are orthogonal. Compact steps knob chrome; `size` ejects
 * the painted box height. Default density is comfortable (44px box).
 */
export const Density: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Input label="Comfortable" placeholder="Default density — 44px box" />
      <Input compact label="Compact" placeholder="Density step, same size axis" />
    </YStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Input label="Default size" placeholder="sizeToken from knobs ($4 / 44px)" />
      <Input size="$5" label="Size eject large" placeholder="Explicit size, comfortable density" />
    </YStack>
  ),
};

export const ReadOnly: Story = {
  args: {
    label: 'Account id',
    readOnly: true,
    value: 'ACC-1042',
    helperText: 'Assigned at create — not editable',
  },
};

export const Copy: Story = {
  args: {
    label: 'API token',
    readOnly: true,
    copy: true,
    value: 'mpo_live_4f2a9c81e0b3',
    helperText: 'Read-only. The value is the identifier register (mono).',
  },
};

export const Chromeless: Story = {
  args: {
    label: 'Toolbar search',
    chromeless: true,
    placeholder: 'Filter…',
  },
  render: (args) => <Input leftIcon=<MagnifyingGlassIcon /> {...args} />,
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Full name', skeleton: true },
};

/**
 * FOREIGN CONTRAST SPECIMEN: the right column renders the
 * RAW tamagui Input beside the house Input strictly so the difference stays
 * visible. Raw primitives here are by design and labeled — knob/contrast probes
 * skip this story via `parameters.foreignContrastSpecimen`.
 */
export const Comparison: StoryObj = {
  name: 'Foreign contrast specimen (raw tamagui)',
  parameters: {
    // Machine-readable exemption for knob/contrast probes and the story-honesty linter.
    foreignContrastSpecimen: true,
    docs: {
      description: {
        story:
          'FOREIGN CONTRAST SPECIMEN (LC-56 STORY-HONESTY). The right column is the raw ' +
          'tamagui Input, rendered for contrast only: it ignores house knobs and field ' +
          'recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => {
    const ComparisonExample = () => {
      const [customVal, setCustomVal] = useState('');
      const [tamaguiVal, setTamaguiVal] = useState('');
      return (
        <XStack gap="$6" alignItems="flex-start" padding="$4">
          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Custom Input
            </Paragraph>
            <Input
              placeholder="Enter your name"
              value={customVal}
              onChangeText={(text) => {
                setCustomVal(text);
                action('custom.onChangeText')(text);
              }}
            />
          </YStack>

          <YStack gap="$3" width={300}>
            <Paragraph size="$2" color="$placeholderColor">
              Tamagui Input
            </Paragraph>
            <TamaguiInput
              placeholder="Enter your name"
              value={tamaguiVal}
              onChangeText={(text) => {
                setTamaguiVal(text);
                action('tamagui.onChangeText')(text);
              }}
            />
          </YStack>
        </XStack>
      );
    };
    return <ComparisonExample />;
  },
};
