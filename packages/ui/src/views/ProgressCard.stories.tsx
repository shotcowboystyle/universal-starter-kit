/**
 * ProgressCard — dashboard bar-gauge. The rail is Meter (position within
 * bounds), not Progress-the-task. Composed Dashboard already mounts one;
 * this file is the export's own Kitchen Sink title.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { ProgressCard } from './Dashboard';

const meta: Meta<typeof ProgressCard> = {
  title: 'Components/ProgressCard',
  component: ProgressCard,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'Dashboard bar-gauge card. The rail is Meter — capacity, not activity toward completion.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProgressCard>;

export const Main: Story = {
  name: 'Main',
  args: {
    config: {
      id: 'quota',
      title: 'Quota filled',
      value: 72,
      max: 100,
      format: 'percent',
    },
  },
  render: (args) => (
    <YStack width={280} padding="$4">
      <ProgressCard {...args} />
    </YStack>
  ),
};

export const NumberFormat: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <ProgressCard
        config={{
          id: 'seats',
          title: 'Seats used',
          value: 18,
          max: 25,
          format: 'number',
        }}
      />
    </YStack>
  ),
};
