import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { YStack, XStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { ImageField } from './index';

const ATTACHED = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#4a90d9"/><circle cx="120" cy="60" r="36" fill="#fff"/></svg>',
)}`;

const meta: Meta<typeof ImageField> = {
  title: 'Forms/ImageField',
  component: ImageField,
  parameters: {
    docs: {
      description: {
        component:
          'Frappe Attach Image: a preview frame that attaches, replaces, and accepts drops. Empty shows Add image; Remove is a sibling action (R11: never a status pip on the media). Keyboard focus rings the frame (LC-71), never the hidden file input. Radius on the tile is unclamped.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    disabled: { control: 'boolean', description: 'Disable image upload' },
    readOnly: { control: 'boolean', description: 'Read-only mode' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
    imageWidth: { control: 'number', description: 'Width of the image area' },
    imageHeight: { control: 'number', description: 'Height of the image area' },
    showRemove: { control: 'boolean', description: 'Show remove action when an image is set' },
    placeholder: { control: 'text', description: 'Placeholder text when no image' },
  },
};

export default meta;
type Story = StoryObj<typeof ImageField>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          avatar: null as string | File | null,
          logo: ATTACHED as string | File | null,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <ImageField
              {...({
                label: 'Profile Avatar',
                name: 'avatar',
                helperText: 'Drop or click to attach',
                imageWidth: 96,
                imageHeight: 96,
              } as any)}
            />
            <ImageField
              {...({
                label: 'Company Logo',
                name: 'logo',
                helperText: 'Click to replace · Remove clears the attachment',
                imageWidth: 160,
                imageHeight: 72,
                objectFit: 'contain',
              } as any)}
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
    label: 'Upload Image',
    helperText: 'Click to upload an image',
    imageWidth: 64,
    imageHeight: 64,
  },
  render: (args) => <ImageField {...args} />,
};

export const WithPlaceholder: Story = {
  args: {
    label: 'Profile Picture',
    placeholder: 'Upload',
    imageWidth: 80,
    imageHeight: 80,
  },
  render: (args) => <ImageField {...args} />,
};

export const WithExistingImage: Story = {
  args: {
    label: 'Current Avatar',
    value: ATTACHED,
    imageWidth: 96,
    imageHeight: 96,
    helperText: 'Click to replace',
  },
  render: (args) => <ImageField {...args} />,
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Image',
    disabled: true,
    imageWidth: 64,
    imageHeight: 64,
  },
  render: (args) => <ImageField {...args} />,
};

export const ReadOnly: Story = {
  args: {
    label: 'Read Only',
    readOnly: true,
    value: ATTACHED,
    imageWidth: 96,
    imageHeight: 96,
  },
  render: (args) => <ImageField {...args} />,
};

export const WithError: Story = {
  args: {
    label: 'Required Image',
    // Error copy states the rule broken — never "please"/"invalid"/"error".
    error: 'An image is required',
    required: true,
    imageWidth: 64,
    imageHeight: 64,
  },
  render: (args) => <ImageField {...args} />,
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4">
      <XStack gap="$4" alignItems="flex-end">
        <ImageField label="Small (32x32)" imageWidth={32} imageHeight={32} />
        <ImageField label="Medium (48x48)" imageWidth={48} imageHeight={48} />
        <ImageField label="Large (64x64)" imageWidth={64} imageHeight={64} />
        <ImageField label="XL (96x96)" imageWidth={96} imageHeight={96} />
      </XStack>
    </YStack>
  ),
};

export const RectangularSizes: Story = {
  render: () => (
    <YStack gap="$4">
      <ImageField label="Banner (200x80)" imageWidth={200} imageHeight={80} placeholder="Banner" />
      <ImageField label="Logo (160x40)" imageWidth={160} imageHeight={40} placeholder="Logo" />
      <ImageField label="Thumbnail (120x90)" imageWidth={120} imageHeight={90} placeholder="Thumb" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [image, setImage] = useState<string | File | null>(null);
      return (
        <YStack gap="$4">
          <ImageField
            label="Upload Image"
            value={image}
            onChange={(val) => {
              setImage(val);
              action('onChange')(val);
            }}
            imageWidth={96}
            imageHeight={96}
            helperText={
              image ? (typeof image === 'string' ? 'URL loaded' : `File: ${image.name}`) : 'No image selected'
            }
          />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const NoRemoveButton: Story = {
  args: {
    label: 'No Remove Button',
    value: ATTACHED,
    showRemove: false,
    imageWidth: 96,
    imageHeight: 96,
    helperText: 'Click image to change',
  },
  render: (args) => <ImageField {...args} />,
};

export const BrokenImage: Story = {
  args: {
    label: 'Broken attachment',
    value: 'https://invalid.invalid/missing.png',
    imageWidth: 96,
    imageHeight: 96,
    helperText: 'Failed load keeps the frame and stays labelled',
  },
  render: (args) => <ImageField {...args} />,
};

/** Loading placeholder — the skeleton mirrors the field's anatomy. */
export const SkeletonState: Story = {
  args: { label: 'Profile Photo', skeleton: true },
  render: (args) => <ImageField {...args} />,
};
