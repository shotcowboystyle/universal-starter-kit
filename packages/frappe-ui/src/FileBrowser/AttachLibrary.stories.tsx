import { useState } from 'react';
import { YStack } from 'tamagui';

import { AttachLibrary } from './AttachLibrary';
import type { FileBrowserFile } from './types';

const INVOICES_FOLDER = 'Home/Invoices';

const files: FileBrowserFile[] = [
  { name: 'Home', file_name: 'Home', folder: '', is_folder: 1 },
  { name: INVOICES_FOLDER, file_name: 'Invoices', folder: 'Home', is_folder: 1 },
  {
    name: 'inv-1',
    file_name: 'hetzner-hel1-invoice-aug.pdf',
    folder: INVOICES_FOLDER,
    file_size: 72_400,
    file_type: 'pdf',
    file_url: '/files/invoice.pdf',
    modified: '2026-08-12',
  },
  {
    name: 'img-1',
    file_name: 'swarm01-topology.png',
    folder: INVOICES_FOLDER,
    file_size: 612_000,
    file_type: 'png',
    file_url: '/files/topology.png',
    modified: '2026-08-09',
  },
];

export default {
  title: 'FrappeUI/AttachLibrary',
  component: AttachLibrary,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Attach dialog: Upload tab plus a FileBrowser "From library" tab. FileUploadField opens this; picking a library row commits and closes.',
      },
    },
  },
};

export const Default = () => {
  const [open, setOpen] = useState(true);
  return (
    <YStack height={520}>
      <AttachLibrary
        open={open}
        onOpenChange={setOpen}
        files={files}
        currentFolder="Home/Invoices"
        onPick={() => {
          setOpen(false);
        }}
      />
    </YStack>
  );
};
Default.storyName = 'Main';

export const Empty = () => {
  const [open, setOpen] = useState(true);
  return (
    <YStack height={520}>
      <AttachLibrary
        open={open}
        onOpenChange={setOpen}
        files={[]}
        currentFolder="Home"
        onPick={() => {
          setOpen(false);
        }}
      />
    </YStack>
  );
};
Empty.parameters = {
  docs: {
    description: {
      story:
        'Library with no rows: both FileBrowser panes fall through AsyncBoundary to their empty state (No folders / No files) instead of a blank dialog.',
    },
  },
};

export const Closed = () => (
  <AttachLibrary
    open={false}
    onOpenChange={() => {
      // Closed story: the dialog never opens.
    }}
    files={files}
    currentFolder="Home/Invoices"
    onPick={() => {
      // Closed story: nothing to pick.
    }}
  />
);
