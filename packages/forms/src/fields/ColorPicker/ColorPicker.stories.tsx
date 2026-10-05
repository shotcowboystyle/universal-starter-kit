import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { ColorPicker } from './index';

const meta: Meta<typeof ColorPicker> = {
  title: 'Forms/ColorPicker',
  component: ColorPicker,
  parameters: {
    docs: {
      description: {
        component:
          'Color picker: Spectrum ColorArea + Polaris vertical hue (and alpha), ColorSwatchPicker, ColorField. Opens in a popover.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    placeholder: { control: 'text', description: 'Placeholder text' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    disabled: { control: 'boolean', description: 'Disable the color picker' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
    format: {
      control: 'select',
      options: ['hex', 'rgb', 'hsl'],
      description: 'Color format to use',
    },
    showAlpha: { control: 'boolean', description: 'Show alpha channel slider' },
    presetColors: { control: 'object', description: 'Array of preset color values' },
  },
};

export default meta;
type Story = StoryObj<typeof ColorPicker>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          brandColor: '#3B82F6',
          backgroundColor: '#FFFFFF',
          textColor: '#000000',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <ColorPicker label="Brand Color" name="brandColor" helperText="Choose your primary brand color" />
            <ColorPicker label="Background Color" name="backgroundColor" helperText="Choose background color" />
            <ColorPicker label="Text Color" name="textColor" helperText="Choose text color" />
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
    label: 'Brand Color',
    placeholder: 'Pick a color',
    helperText: 'Choose your brand color',
    format: 'hex',
  },
  render: (args) => <ColorPicker {...args} />,
};

export const Basic: Story = {
  render: (args) => <ColorPicker {...args} />,
  args: {
    label: 'Choose Color',
    placeholder: 'Select a color',
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <ColorPicker label="Small" size="$2" placeholder="Pick a color" />
      <ColorPicker label="Medium (default)" size="$3" placeholder="Pick a color" />
      <ColorPicker label="Large" size="$4" placeholder="Pick a color" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [color, setColor] = useState('#3B82F6');
      return (
        <YStack gap="$4" maxWidth={400}>
          <ColorPicker
            label="Pick a Color"
            value={color}
            onChange={(val: string) => {
              setColor(val);
              action('onChange')(val);
            }}
            helperText={`Selected: ${color}`}
          />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const WithAlpha: Story = {
  render: (args) => <ColorPicker {...args} />,
  args: {
    label: 'Color with Alpha',
    showAlpha: true,
    placeholder: 'Select a color with transparency',
  },
};

export const CustomPresets: Story = {
  render: (args) => <ColorPicker {...args} />,
  args: {
    label: 'Brand Palette',
    presetColors: ['#1E40AF', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'],
    helperText: 'Select from the brand color palette',
  },
};

export const Disabled: Story = {
  render: (args) => <ColorPicker {...args} />,
  args: {
    label: 'Disabled Color',
    disabled: true,
    placeholder: 'Cannot select',
  },
};

export const WithError: Story = {
  render: (args) => <ColorPicker {...args} />,
  args: {
    label: 'Required Color',
    // Error copy states the rule broken — never "please"/"invalid"/"error".
    error: 'Color must be a recognized value',
    required: true,
  },
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  render: (args) => <ColorPicker {...args} />,
  args: { label: 'Brand Color', skeleton: true },
};
