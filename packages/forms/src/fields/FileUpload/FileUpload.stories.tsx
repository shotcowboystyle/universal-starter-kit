import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useEffect, useRef, useState } from 'react';
import { YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { FileUpload } from './index';

const meta: Meta<typeof FileUpload> = {
  title: 'Forms/FileUpload',
  component: FileUpload,
  parameters: {
    docs: {
      description: {
        component:
          'A file upload component with drag-and-drop support, file validation, and preview capabilities for form integration.',
      },
    },
  },
  argTypes: {
    label: { control: 'text', description: 'Field label' },
    helperText: { control: 'text', description: 'Helper text below the field' },
    error: { control: 'text', description: 'Error message' },
    required: { control: 'boolean', description: 'Mark field as required' },
    disabled: { control: 'boolean', description: 'Disable file upload' },
    size: { control: 'select', options: ['$2', '$3', '$4'], description: 'Field size' },
    accept: { control: 'text', description: 'Accepted file types' },
    maxSize: { control: 'number', description: 'Maximum file size in bytes' },
    multiple: { control: 'boolean', description: 'Allow multiple file selection' },
    dragDrop: { control: 'boolean', description: 'Enable drag and drop' },
    showPreview: { control: 'boolean', description: 'Show file preview' },
  },
};

export default meta;
type Story = StoryObj<typeof FileUpload>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const FormExample = () => {
      const form = useForm({
        defaultValues: {
          avatar: null,
          document: null,
          attachments: null,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });

      return (
        <Form form={form}>
          <YStack gap="$4">
            <FileUpload
              {...({
                label: 'Profile Picture',
                name: 'avatar',
                accept: 'image/*',
                helperText: 'Upload your profile picture',
                showPreview: true,
              } as any)}
            />
            <FileUpload
              {...({
                label: 'Document',
                name: 'document',
                accept: '.pdf,.doc,.docx',
                helperText: 'Upload PDF or Word document',
              } as any)}
            />
            <FileUpload
              {...({
                label: 'Attachments',
                name: 'attachments',
                multiple: true,
                helperText: 'Upload multiple files',
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
    label: 'Upload File',
    helperText: 'Max 10MB',
    accept: '*/*',
    maxSize: 10485760,
  },
  render: (args) => <FileUpload {...args} />,
};

export const Basic: Story = {
  render: (args) => <FileUpload {...args} />,
  args: {
    label: 'Upload File',
    placeholder: 'Click to upload or drag and drop',
  },
};

export const Disabled: Story = {
  parameters: {
    // Allowlist: disabled-dial demo; FileUpload's internal upload Button
    // has no disabledReason plumbing yet (component-contract follow-up).
    guardrailSpecimen: {
      warns: ['bare-disabled'],
      reason: "Disabled-dial specimen: FileUpload's internal upload Button has no disabledReason plumbing yet.",
    },
  },
  render: (args) => <FileUpload {...args} />,
  args: {
    label: 'Disabled Upload',
    disabled: true,
    placeholder: 'Cannot upload',
  },
};

export const WithError: Story = {
  render: (args) => <FileUpload {...args} />,
  args: {
    label: 'Required File',
    // Error copy states the rule broken — never "please"/"invalid"/"error".
    error: 'A file is required',
    required: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <FileUpload label="Small" size="$2" placeholder="Upload a file" />
      <FileUpload label="Medium (default)" size="$3" placeholder="Upload a file" />
      <FileUpload label="Large" size="$4" placeholder="Upload a file" />
    </YStack>
  ),
};

export const Interactive: Story = {
  render: () => {
    const InteractiveExample = () => {
      const [file, setFile] = useState<File | null>(null);
      return (
        <YStack gap="$4" maxWidth={400}>
          <FileUpload
            label="Upload File"
            // @ts-expect-error controlled mode not supported
            onChange={(f: File | null) => {
              setFile(f);
              action('onChange')(f);
            }}
            helperText={file ? `Selected: ${file.name}` : 'No file selected'}
          />
        </YStack>
      );
    };
    return <InteractiveExample />;
  },
};

export const ImageOnly: Story = {
  render: (args) => <FileUpload {...args} />,
  args: {
    label: 'Upload Image',
    accept: 'image/*',
    showPreview: true,
    helperText: 'PNG, JPG, GIF up to 5MB',
    maxSize: 5 * 1024 * 1024,
  },
};

/** Loading placeholder — the skeleton mirrors the dropzone's anatomy. */
export const SkeletonState: Story = {
  render: (args) => <FileUpload {...args} />,
  args: { label: 'Upload File', skeleton: true },
};

function TransferStory({ fail }: { fail?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const input = hostRef.current?.querySelector("input[type='file']") as HTMLInputElement | null;
    if (!input) {
      return;
    }
    const file = new File(['payload'], fail ? 'wazuh-dump.sql' : 'restore-log.txt', {
      type: 'text/plain',
    });
    const dt = new DataTransfer();
    dt.items.add(file);
    fireInputFiles(input, dt.files);
  }, [fail]);
  return (
    <div ref={hostRef}>
      <FileUpload
        label="Attachment"
        onUpload={async (_file, { onProgress }) => {
          onProgress(64);
          if (fail) {
            throw new Error('413 Payload Too Large');
          }
          await new Promise<void>(() => {});
        }}
      />
    </div>
  );
}

function fireInputFiles(input: HTMLInputElement, files: FileList) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** In-flight row: name, size, progress, cancel. media-01 / media-04 uploading. */
export const Uploading: Story = {
  render: () => <TransferStory />,
};

/** Failed row: structured {problem, action, cta} plus remove. media-01 / media-04 failed. */
export const Failed: Story = {
  render: () => <TransferStory fail />,
};
