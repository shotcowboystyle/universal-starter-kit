import { BarcodeIcon, CameraIcon, XIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { Barcode } from './index';

const iconProps = {
  barcodeIcon: <BarcodeIcon size={18} />,
  scanIcon: <CameraIcon size={18} />,
  stopIcon: <XIcon size={18} />,
};

const meta: Meta<typeof Barcode> = {
  title: 'Forms/Barcode',
  component: Barcode,
  parameters: {
    docs: {
      description: {
        component: 'A barcode input field with optional camera-based scanning via html5-qrcode.',
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
    value: { control: 'text' },
    enableScan: { control: 'boolean', description: 'Enable camera scanner' },
    formats: { control: 'object', description: 'Decoder symbologies (e.g. code128, qr, ean13)' },
  },
};

export default meta;
type Story = StoryObj<typeof Barcode>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          barcode: '',
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form} maxWidth={400}>
          <YStack gap="$4">
            <Barcode
              label="Item Barcode"
              name="barcode"
              helperText="Scan or type the barcode"
              enableScan
              {...iconProps}
            />
            <Button action="submit">Look Up</Button>
          </YStack>
        </Form>
      );
    };
    return <FormExample />;
  },
};

export const Standalone: Story = {
  args: {
    label: 'Barcode',
    helperText: 'Scan or enter barcode',
    enableScan: true,
  },
  render: (args) => <Barcode {...args} {...iconProps} />,
};

/**
 * Bare contract (UX-010 / Axiom 13 ONE BODY): no icon props — the package
 * defaults render the barcode adornment and the camera scan button.
 */
export const Bare: Story = {
  args: {
    label: 'Barcode',
    helperText: 'No icon props — package default icons',
    enableScan: true,
    onChange: action('onChange'),
  },
};

export const Basic: Story = {
  args: {
    label: 'Product Barcode',
    helperText: 'Enter or scan a barcode',
    onChange: action('onChange'),
  },
  render: (args) => <Barcode {...args} {...iconProps} />,
};

export const Disabled: Story = {
  args: {
    label: 'Product Barcode',
    helperText: 'This field is disabled',
    disabled: true,
    onChange: action('onChange'),
  },
  render: (args) => <Barcode {...args} {...iconProps} />,
};

export const WithError: Story = {
  args: {
    label: 'Product Barcode',
    helperText: 'Enter or scan a barcode',
    required: true,
    error: 'Barcode is required',
    onChange: action('onChange'),
  },
  render: (args) => <Barcode {...args} {...iconProps} />,
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <Text fontWeight="bold">Size $2</Text>
      <Barcode label="Small" size="$2" {...iconProps} onChange={action('onChange')} />
      <Text fontWeight="bold">Size $3</Text>
      <Barcode label="Medium" size="$3" {...iconProps} onChange={action('onChange')} />
      <Text fontWeight="bold">Size $4</Text>
      <Barcode label="Large" size="$4" {...iconProps} onChange={action('onChange')} />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [value, setValue] = useState('');
      return (
        <YStack gap="$4" maxWidth={400}>
          <Barcode
            label="Scan Product"
            helperText={value ? `Scanned: ${value}` : 'Enter a barcode'}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
            {...iconProps}
          />
          <Barcode
            label="Without Camera"
            enableScan={false}
            value={value}
            onChange={(v) => {
              setValue(v);
              action('onChange')(v);
            }}
            {...iconProps}
          />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Product Barcode', skeleton: true },
  render: (args) => <Barcode {...args} {...iconProps} />,
};

/** Encoded value + trailing scan inside one composite (preview under the box). */
export const Filled: Story = {
  args: {
    label: 'Product Barcode',
    helperText: 'Scan or enter barcode',
    value: 'SKU-001234',
    enableScan: true,
    onChange: action('onChange'),
  },
  render: (args) => <Barcode {...args} {...iconProps} />,
};

/**
 * QR format: `formats: ["qr"]` restricts the scanner to QR and
 * the preview draws the same symbology — a real, canvas-free QR matrix from
 * ./qr, theme ink on theme surface in both schemes. The value here exceeds
 * Code 128 B's charset on purpose: QR draws what the 1-D strip cannot.
 */
export const FilledQr: Story = {
  args: {
    label: 'QR Code',
    helperText: 'Scan or enter a QR value',
    value: 'https://multiplatform.one',
    enableScan: true,
    formats: ['qr'],
    onChange: action('onChange'),
  },
  render: (args) => <Barcode {...args} {...iconProps} />,
};
