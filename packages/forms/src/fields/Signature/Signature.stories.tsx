import { EraserIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Signature } from './index';

const meta: Meta<typeof Signature> = {
  title: 'Forms/Signature',
  component: Signature,
  parameters: {
    docs: {
      description: {
        component: 'A signature pad field that captures handwritten signatures as base64 data URLs.',
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
    penColor: { control: 'text', description: 'Pen color' },
    width: { control: 'number', description: 'Canvas width in pixels' },
    height: { control: 'number', description: 'Canvas height in pixels' },
    backgroundColor: { control: 'color', description: 'Canvas background' },
  },
};

export default meta;
type Story = StoryObj<typeof Signature>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          signature: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={520}>
          <YStack gap="$4">
            <Signature
              label="Your Signature"
              name="signature"
              helperText="Required for submission"
              required
              clearIcon=<EraserIcon size={16} />
            />
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
    label: 'Signature',
    helperText: 'Sign here',
  },
  render: (args) => <Signature {...args} clearIcon=<EraserIcon size={16} /> />,
};

export const Basic: Story = {
  args: {
    label: 'Signature',
    helperText: 'Draw your signature above',
    onChange: action('onChange'),
  },
  render: (args) => <Signature {...args} clearIcon=<EraserIcon size={16} /> />,
};

export const Disabled: Story = {
  args: {
    label: 'Signature',
    helperText: 'This field is disabled',
    disabled: true,
    onChange: action('onChange'),
  },
  render: (args) => <Signature {...args} clearIcon=<EraserIcon size={16} /> />,
};

export const WithError: Story = {
  args: {
    label: 'Signature',
    helperText: 'Draw your signature above',
    required: true,
    error: 'Signature is required',
    onChange: action('onChange'),
  },
  render: (args) => <Signature {...args} clearIcon=<EraserIcon size={16} /> />,
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={520}>
      <Text fontWeight="bold">Size $2</Text>
      <Signature label="Small" size="$2" clearIcon=<EraserIcon size={16} /> onChange={action('onChange')} />
      <Text fontWeight="bold">Size $3</Text>
      <Signature label="Medium" size="$3" clearIcon=<EraserIcon size={16} /> onChange={action('onChange')} />
      <Text fontWeight="bold">Size $4</Text>
      <Signature label="Large" size="$4" clearIcon=<EraserIcon size={16} /> onChange={action('onChange')} />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('');
      return (
        <YStack gap="$4" maxWidth={520}>
          <Signature
            label="Sign Here"
            helperText={value ? 'Signature captured' : 'Please sign above'}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v ? '[base64 data]' : '');
            }}
            clearIcon=<EraserIcon size={16} />
          />
          <Signature label="Disabled Signature" disabled clearIcon=<EraserIcon size={16} /> />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const CustomSize: Story = {
  args: {
    label: 'Large Signature',
    width: 600,
    height: 300,
    onChange: action('onChange'),
  },
  render: (args) => <Signature {...args} clearIcon=<EraserIcon size={16} /> />,
};

/** Loading placeholder — the skeleton mirrors the canvas anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Sign Here', skeleton: true },
  render: (args) => <Signature {...args} clearIcon=<EraserIcon size={16} /> />,
};
