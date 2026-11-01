import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../field-registry';
import { FrappeStoryProvider } from '../frappe-story-target';
import { FrappeProvider } from '../FrappeProvider';

import { FileUpload } from './FileUpload';
import type { FileUploadProps } from './FileUpload';

// 1x1 transparent PNG
const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const fixtures = new InMemoryFixtureProvider({
  File: [
    {
      name: 'FILE-001',
      doctype: 'File',
      file_name: 'existing.png',
      file_url: tinyPng,
      is_private: 0,
    },
  ],
});

export default {
  title: 'FrappeUI/FileUpload',
  component: FileUpload,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Frappe FileUpload (live-data uploader): uploads into the File doctype collection (fixture-backed here) and previews images.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    accept: { control: 'text' },
    isImage: { control: 'boolean' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    maxSize: { control: 'number' },
  },
};

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args bag forwarded verbatim to the field; controls own the values
type StoryProps = FileUploadProps & Record<string, unknown>;

const Controlled = (props: Omit<StoryProps, 'onChange'>) => {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <FileUpload
      {...(props as any)}
      value={value}
      onChange={(v: string) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

const withProvider = (node: ReactNode) => (
  <FrappeProvider
    baseURL="https://demo.frappe.cloud"
    fixtures={fixtures}>
    {node}
  </FrappeProvider>
);

export const Main = (args: StoryProps) => withProvider(<Controlled {...args} />);
Main.args = { label: 'Attachment' } as Partial<StoryProps>;
Main.storyName = 'Main';

export const ImageWithPreview = (args: StoryProps) => withProvider(<Controlled {...args} />);
ImageWithPreview.args = {
  label: 'Image with existing value',
  isImage: true,
  value: tinyPng,
} as Partial<StoryProps>;

export const BrokenPreview = (args: StoryProps) => withProvider(<Controlled {...args} />);
BrokenPreview.args = {
  label: 'Broken image value',
  isImage: true,
  value: 'https://invalid.example/broken.png',
} as Partial<StoryProps>;

export const TinyMaxSize = (args: StoryProps) => withProvider(<Controlled {...args} />);
TinyMaxSize.args = {
  label: 'Max 1 byte (any upload should error)',
  maxSize: 1,
} as Partial<StoryProps>;

export const States = (args: StoryProps) =>
  withProvider(
    <YStack
      gap="$4"
      maxWidth={420}>
      <Controlled
        {...args}
        label="Disabled"
        disabled
      />
      <Controlled
        {...args}
        label="Required"
        required
      />
      <Controlled
        {...args}
        label="error probe (no error prop on this adapter)"
        {...({ error: 'This should show but cannot' } as any)}
      />
    </YStack>,
  );
States.args = {} as Partial<StoryProps>;

interface FileUploadRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  // oxlint-disable-next-line eslint/func-name-matching -- a capitalized name lets React treat this render function as a component so it may call hooks
  render: function InTableRender() {
    const [data, setData] = useState<FileUploadRow[]>([
      { id: '1', label: 'Alpha', value: tinyPng },
      { id: '2', label: 'Beta', value: 'report.pdf' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<FileUploadRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'File', ...fieldtypeToTableField('Attach') },
    ];
    return (
      <FrappeStoryProvider fixtures={fixtures}>
        <YStack
          width="100%"
          height={320}>
          <DataTable
            data={data}
            columns={columns}
            enablePagination={false}
            onDataChange={setData}
          />
        </YStack>
      </FrappeStoryProvider>
    );
  },
};
