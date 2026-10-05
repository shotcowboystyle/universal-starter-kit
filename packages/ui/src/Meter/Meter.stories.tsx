import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Meter } from './index';

const meta: Meta<typeof Meter> = {
  title: 'Components/Meter',
  component: Meter,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Bounded-quantity display (disk, quota, seats, battery). Progress is activity toward completion; Meter is position within bounds. role=meter, DEFAULT radius class (no thumb), threshold zones only when low/high/optimum are declared.',
      },
    },
  },
  argTypes: {
    value: { control: { type: 'number', min: 0, max: 8, step: 0.1 } },
    min: { control: 'number' },
    max: { control: 'number' },
    low: { control: 'number' },
    high: { control: 'number' },
    optimum: { control: 'number' },
    label: { control: 'text' },
    unit: { control: 'text' },
    format: { control: 'radio', options: ['number', 'percent'] },
    layout: { control: 'radio', options: ['adjacent', 'inline', 'bare'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Meter>;

export const Default: Story = {
  name: 'Main',
  args: {
    label: 'Disk usage',
    value: 6.2,
    min: 0,
    max: 8,
    low: 6.4,
    high: 7.6,
    optimum: 0,
    unit: 'GB',
    format: 'number',
    layout: 'adjacent',
  },
};

export const Thresholds: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={360}>
      <Meter label="Disk usage" value={5} min={0} max={8} low={6.4} high={7.6} optimum={0} unit="GB" />
      <Meter label="Disk usage" value={6.8} min={0} max={8} low={6.4} high={7.6} optimum={0} unit="GB" />
      <Meter label="Disk usage" value={7.8} min={0} max={8} low={6.4} high={7.6} optimum={0} unit="GB" />
      <Meter label="Battery" value={9} min={0} max={100} low={10} high={20} optimum={100} format="percent" />
    </YStack>
  ),
};

export const Segmented: Story = {
  args: {
    label: 'Seats',
    value: 7,
    min: 0,
    max: 10,
    low: 8,
    high: 10,
    optimum: 0,
    segments: 10,
  },
};

export const Unknown: Story = {
  args: {
    label: 'Quota',
    min: 0,
    max: 8,
    unit: 'GB',
  },
};

export const Loading: Story = {
  args: {
    label: 'Disk usage',
    min: 0,
    max: 8,
    unit: 'GB',
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disk usage',
    value: 6.2,
    min: 0,
    max: 8,
    low: 6.4,
    high: 7.6,
    optimum: 0,
    unit: 'GB',
    disabled: true,
  },
};

export const Inline: Story = {
  args: {
    label: 'Disk usage',
    value: 6.2,
    min: 0,
    max: 8,
    low: 6.4,
    high: 7.6,
    optimum: 0,
    format: 'percent',
    layout: 'inline',
  },
};
