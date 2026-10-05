/**
 * ListCard — Frappe link card / Polaris resource list / Grafana table-lite.
 */

import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { ListCard } from './Dashboard';

const meta: Meta<typeof ListCard> = {
  title: 'Components/ListCard',
  component: ListCard,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'Dashboard list widget: a titled card of clickable rows with optional meta.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ListCard>;

export const Main: Story = {
  name: 'Main',
  args: {
    config: {
      id: 'links',
      title: 'Shortcuts',
      items: [
        { id: 'open', label: 'Open quotations', meta: '12', onClick: action('list:open') },
        { id: 'overdue', label: 'Overdue invoices', meta: '4', onClick: action('list:overdue') },
        { id: 'draft', label: 'Draft orders', meta: '9', onClick: action('list:draft') },
      ],
    },
  },
  render: (args) => (
    <YStack width={320} padding="$4">
      <ListCard {...args} />
    </YStack>
  ),
};
