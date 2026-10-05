import { action } from '@repo/storybook';
import { YStack, Text } from 'tamagui';

import { Attachments, type AttachmentItem } from './Attachments';

export default {
  title: 'Components/Attachments',
  component: Attachments,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A generic file attachment component for displaying, uploading, downloading, and removing file attachments.',
      },
    },
  },
  argTypes: {
    enableAdd: { control: 'boolean', description: 'Allow file uploads' },
    enableDownload: { control: 'boolean', description: 'Allow file downloads' },
    enableRemove: { control: 'boolean', description: 'Allow file deletion' },
    enablePreview: { control: 'boolean', description: 'Allow image previews' },
    compact: { control: 'boolean', description: 'Use compact layout' },
    maxAttachments: { control: 'number', description: 'Maximum number of attachments' },
  },
};

const sampleItems: AttachmentItem[] = [
  {
    id: 'file-001',
    fileName: 'invoice-2026-001.pdf',
    fileUrl: '/files/invoice-2026-001.pdf',
    fileSize: 125000,
    fileType: 'application/pdf',
  },
  {
    id: 'file-002',
    fileName: 'product-image.jpg',
    fileUrl: 'https://picsum.photos/800/600',
    fileSize: 450000,
    fileType: 'image/jpeg',
    isImage: true,
  },
  {
    id: 'file-003',
    fileName: 'contract.docx',
    fileUrl: '/files/contract.docx',
    fileSize: 85000,
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
];

export const Default = () => (
  <YStack width="100%" maxWidth={360}>
    <Attachments
      items={sampleItems}
      label="Attachments"
      onAdd={(file) => {
        console.log('Add:', file.name);
      }}
      onRemove={(item) => {
        console.log('Remove:', item.id);
      }}
    />
  </YStack>
);
Default.storyName = 'Main';
Default.parameters = {
  docs: {
    description: {
      story: 'Basic attachment list with upload, download, and delete functionality.',
    },
  },
};

export const ReadOnly = () => (
  <YStack width="100%" maxWidth={360}>
    <Attachments items={sampleItems} label="Attachments" enableAdd={false} enableRemove={false} />
  </YStack>
);
ReadOnly.parameters = {
  docs: {
    description: {
      story: 'Read-only attachment list without upload or delete options.',
    },
  },
};

export const CompactMode = () => (
  <YStack width="100%" maxWidth={360}>
    <Attachments
      items={sampleItems}
      label="Attachments"
      compact
      onAdd={(file) => {
        console.log('Add:', file.name);
      }}
      onRemove={(item) => {
        console.log('Remove:', item.id);
      }}
    />
  </YStack>
);
CompactMode.parameters = {
  docs: {
    description: {
      story: 'Compact layout for smaller UI spaces.',
    },
  },
};

export const Empty = () => (
  <YStack width="100%" maxWidth={360}>
    <Attachments
      items={[]}
      label="Attachments"
      onAdd={(file) => {
        console.log('Add:', file.name);
      }}
    />
  </YStack>
);
Empty.parameters = {
  docs: {
    description: {
      story: 'Empty attachment list with upload prompt.',
    },
  },
};

export const Loading = () => <Attachments items={[]} label="Attachments" isLoading />;
Loading.parameters = {
  docs: {
    description: {
      story:
        'Attachment data still loading — the row-shaped skeleton twin renders, never the empty chrome (LC-20 / DG-ST-02).',
    },
  },
};

export const Error = () => (
  <Attachments
    items={[]}
    label="Attachments"
    error="The File list could not be loaded."
    onRetry={action('onRetry')}
    onAdd={action('onAdd')}
  />
);
Error.parameters = {
  docs: {
    description: {
      story:
        'Failed load wins over empty — semantic error chrome with Retry, visually distinct from "no attachments"; the count badge and upload affordance hide so they can\'t lie (DG-ST-01 / DG-ST-04 / Axiom 6).',
    },
  },
};

export const AllStates = () => (
  <YStack gap="$6" maxWidth={360}>
    <YStack gap="$2">
      <Text fontWeight="600">With Files</Text>
      <Attachments items={sampleItems} />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Empty</Text>
      <Attachments
        items={[]}
        onAdd={(file) => {
          console.log('Add:', file.name);
        }}
      />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Read Only</Text>
      <Attachments items={sampleItems.slice(0, 1)} enableAdd={false} enableRemove={false} />
    </YStack>

    <YStack gap="$2">
      <Text fontWeight="600">Compact</Text>
      <Attachments items={sampleItems.slice(0, 2)} compact />
    </YStack>
  </YStack>
);
AllStates.parameters = {
  docs: {
    description: {
      story: 'All states of the Attachments component.',
    },
  },
};
