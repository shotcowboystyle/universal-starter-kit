import { MagnifyingGlassIcon, TrayIcon, WarningCircleIcon } from '@phosphor-icons/react';
// Catalog Button (story honesty): the raw tamagui action held a
// 9px radius at borderRadius:none and ignored the size knob.
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';

import { EmptyState } from './EmptyState';

function PageCanvas({ children }: { children: ReactNode }) {
  return (
    <YStack minHeight={520} width="100%" backgroundColor="$background">
      {children}
    </YStack>
  );
}

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Centered empty/error placeholder: circular icon well, heading, muted description, action row. Prefer AsyncBoundary for async data views so empty chrome never renders on a failed load (DG-ST-01). First-use and filtered-empty are different states (Polaris); error is sober, one recovery action, no secondary (Primer).',
      },
    },
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    intent: { control: 'select', options: ['neutral', 'error'] },
    compact: { control: 'boolean' },
  },
  args: {
    title: 'Create your first record',
    description: 'Records you add will show up here. Create one to get started.',
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <PageCanvas>
      <EmptyState {...args} icon=<TrayIcon size={40} /> action={<Button>Create record</Button>} />
    </PageCanvas>
  ),
};

export const TitleOnly: Story = {
  args: { description: undefined },
  render: (args) => (
    <PageCanvas>
      <EmptyState {...args} />
    </PageCanvas>
  ),
};

export const NoIcon: Story = {
  render: (args) => (
    <PageCanvas>
      <EmptyState {...args} action={<Button>Retry</Button>} />
    </PageCanvas>
  ),
};

export const MultipleActions: Story = {
  render: (args) => (
    <PageCanvas>
      <EmptyState
        {...args}
        icon=<TrayIcon size={40} />
        action={
          <>
            <Button>Create record</Button>
            <Button>Learn more</Button>
          </>
        }
      />
    </PageCanvas>
  ),
};

export const LongCopyNarrow: Story = {
  args: {
    title: 'Zusammengehörigkeitsgefühl-Konfigurationsproblem',
    description:
      'A very long translated description that runs on and on to verify the copy stays centred, wraps within its reading width, and never overflows the narrow container horizontally.',
  },
  render: (args) => (
    <YStack width={300} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <EmptyState {...args} icon=<TrayIcon size={32} /> action={<Button>Act</Button>} />
    </YStack>
  ),
};

export const Compact: Story = {
  args: { title: 'No matching records', description: undefined },
  parameters: {
    docs: {
      description: {
        story: 'Compact variant for inline use inside tables and kanban columns (Primer narrow).',
      },
    },
  },
  render: (args) => (
    <YStack width={360} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <EmptyState compact {...args} />
    </YStack>
  ),
};

export const NoResults: Story = {
  args: {
    title: 'No matching records',
    description: 'Try a different search, or clear filters to see everything.',
  },
  parameters: {
    docs: {
      description: {
        story:
          "Filtered-empty is not first-use (Polaris resource list). Offer a way to clear filters, never 'create your first'.",
      },
    },
  },
  render: (args) => (
    <PageCanvas>
      <EmptyState {...args} icon=<MagnifyingGlassIcon size={40} /> action={<Button>Clear filters</Button>} />
    </PageCanvas>
  ),
};

export const Error: Story = {
  args: {
    title: "Couldn't load records",
    description: 'Check your connection, then try again.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Sober failure chrome (Primer Blankslate error). Alert icon, one recovery action, no secondary.',
      },
    },
  },
  render: (args) => (
    <PageCanvas>
      <EmptyState
        {...args}
        intent="error"
        icon=<WarningCircleIcon size={40} weight="fill" />
        action={<Button>Retry</Button>}
      />
    </PageCanvas>
  ),
};
