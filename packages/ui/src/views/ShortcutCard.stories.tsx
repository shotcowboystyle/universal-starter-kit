/**
 * ShortcutCard — Frappe workspace shortcut: label + nested count pill.
 */

import { ShoppingCartIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { ShortcutCard } from './Dashboard';

const iconSize = 16;

const meta: Meta<typeof ShortcutCard> = {
  title: 'Components/ShortcutCard',
  component: ShortcutCard,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'Frappe workspace shortcut: label plus a nested count pill.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ShortcutCard>;

export const Main: Story = {
  name: 'Main',
  args: {
    config: {
      id: 'orders',
      title: 'Sales Orders',
      count: 18,
      icon: <ShoppingCartIcon size={iconSize} />,
      onClick: action('shortcut:orders'),
    },
  },
  render: (args) => (
    <YStack width={280} padding="$4">
      <ShortcutCard {...args} />
    </YStack>
  ),
};

export const NoCount: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <ShortcutCard
        config={{
          id: 'new-order',
          title: 'New Order',
          icon: <ShoppingCartIcon size={iconSize} />,
          onClick: action('shortcut:new'),
        }}
      />
    </YStack>
  ),
};
