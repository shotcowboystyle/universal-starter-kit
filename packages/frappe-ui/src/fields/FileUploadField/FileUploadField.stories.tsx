import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import { useEffect, useRef, useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField } from '../../fieldRegistry';
import { FrappeStoryProvider } from '../../frappeStoryTarget';

import { FileUploadField } from '.';
import type { FileUploadFieldProps } from '.';

export default {
  title: 'FrappeUI/FileUploadField',
  component: FileUploadField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Frappe Attach / Attach Image field backed by forms FileUpload (form-driven; no controlled value/onChange surface).',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    accept: { control: 'text' },
    maxSize: { control: 'number' },
    multiple: { control: 'boolean' },
    isImage: { control: 'boolean' },
  },
};

type StoryProps = FileUploadFieldProps & Record<string, unknown>;

export const Main = (args: StoryProps) => <FileUploadField {...(args as any)} />;
Main.args = { label: 'Attachment' } as Partial<StoryProps>;
Main.storyName = 'Main';

export const AttachImage = (args: StoryProps) => <FileUploadField {...(args as any)} />;
AttachImage.args = {
  label: 'Attach Image (registry isImage)',
  isImage: true,
} as Partial<StoryProps>;

export const Constraints = (args: StoryProps) => <FileUploadField {...(args as any)} />;
Constraints.args = {
  label: 'PDF only, max 1MB, multiple',
  accept: 'application/pdf',
  maxSize: 1024 * 1024,
  multiple: true,
} as Partial<StoryProps>;

export const States = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <FileUploadField
      {...(args as any)}
      label="Disabled"
      disabled
    />
    <FileUploadField
      {...(args as any)}
      label="Disabled + error"
      disabled
      error="Broken while disabled"
    />
    <FileUploadField
      {...(args as any)}
      label="Required"
      required
    />
    <FileUploadField
      {...(args as any)}
      label="Error"
      error="Value does not match the required format"
    />
    <FileUploadField
      {...(args as any)}
      label="Helper text"
      helperText="Some helpful context"
    />
  </YStack>
);
States.args = {} as Partial<StoryProps>;
// LC-57 allowlist: the Disabled rows demo the disabled dial, and the field's
// internal upload Button has no disabledReason plumbing yet (component-contract
// follow-up). The warn still fires; the harvester tolerates exactly this code.
States.parameters = {
  guardrailSpecimen: {
    warns: ['bare-disabled'],
    reason: "Disabled-dial rows: FileUpload's internal upload Button has no disabledReason plumbing yet.",
  },
};

function TransferFieldStory({ fail }: { fail?: boolean }) {
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
    Object.defineProperty(input, 'files', { configurable: true, value: dt.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [fail]);
  return (
    <div ref={hostRef}>
      <FileUploadField
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

export const Uploading = () => <TransferFieldStory />;
Uploading.storyName = 'Uploading';

export const Failed = () => <TransferFieldStory fail />;
Failed.storyName = 'Failed';

export const FromLibrary = () => (
  <FileUploadField
    label="Cluster diagram"
    library
    libraryFolder="Home/Invoices"
    libraryFiles={[
      { name: 'Home', file_name: 'Home', folder: '', is_folder: 1 },
      { name: 'Home/Invoices', file_name: 'Invoices', folder: 'Home', is_folder: 1 },
      {
        name: 'inv-1',
        file_name: 'invoice.pdf',
        folder: 'Home/Invoices',
        file_url: '/files/invoice.pdf',
        file_size: 72_400,
        file_type: 'pdf',
      },
    ]}
  />
);
FromLibrary.storyName = 'From Library';

/** Thin-adapter contract probe: readOnly / skeleton / compact forwarding. */
export const ContractProbe = (args: StoryProps) => (
  <YStack
    gap="$4"
    maxWidth={420}>
    <FileUploadField
      {...(args as any)}
      label="readOnly probe"
      {...({ readOnly: true } as any)}
    />
    <FileUploadField
      {...(args as any)}
      label="skeleton probe"
      {...({ skeleton: true } as any)}
    />
    <FileUploadField
      {...(args as any)}
      label="compact probe"
      {...({ compact: true } as any)}
    />
  </YStack>
);
ContractProbe.args = {} as Partial<StoryProps>;

interface FileRow {
  id: string;
  label: string;
  value: string;
}

export const InTable = {
  name: 'In table',
  render: function InTableRender() {
    const [data, setData] = useState<FileRow[]>([
      { id: '1', label: 'Alpha', value: 'report.pdf' },
      { id: '2', label: 'Beta', value: 'invoice.pdf' },
      { id: '3', label: 'Gamma', value: '' },
    ]);
    const columns: DataTableColumn<FileRow>[] = [
      { accessorKey: 'label', header: 'Row' },
      { accessorKey: 'value', header: 'Attachment', ...fieldtypeToTableField('Attach') },
    ];
    return (
      <FrappeStoryProvider>
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
