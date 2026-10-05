import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { SkeletonText } from './index';

const meta: Meta<typeof SkeletonText> = {
  title: 'Components/SkeletonText',
  component: SkeletonText,
  parameters: {
    status: { type: 'stable' },
    // Explicitly-labeled skeleton specimen (the
    // skeleton is the subject here, not a promise about pending data).
    skeletonSpecimen: true,
    docs: {
      description: {
        component:
          'SKELETON SPECIMEN (D-10). Multi-line text loading placeholder. Last line renders at lastLineWidth (default 70%). Skeletons persist on this page by design; product surfaces must show zero skeletons once their pending source settles.',
      },
    },
  },
  argTypes: {
    lines: { control: 'number' },
    gap: { control: 'text' },
    lastLineWidth: { control: 'text' },
    animate: { control: 'boolean' },
    width: { control: 'text' },
    height: { control: 'text' },
    size: { control: 'select', options: ['body', 'display'] },
  },
  args: {
    lines: 3,
    animate: true,
    size: 'body',
  },
};
export default meta;

type Story = StoryObj<typeof SkeletonText>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <YStack maxWidth={400}>
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const SingleLine: Story = {
  args: { lines: 1 },
  render: (args) => (
    <YStack maxWidth={400}>
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const ManyLines: Story = {
  args: { lines: 12 },
  render: (args) => (
    <YStack maxWidth={400}>
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const ZeroLines: Story = {
  args: { lines: 0 },
  render: (args) => (
    <YStack maxWidth={400} borderWidth={1} borderColor="$color6" borderStyle="dashed" minHeight={24}>
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const NegativeLines: Story = {
  args: { lines: -3 },
  render: (args) => (
    <YStack maxWidth={400} borderWidth={1} borderColor="$color6" borderStyle="dashed" minHeight={24}>
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const CustomMetricsNarrow: Story = {
  args: { lines: 4, gap: '$4', lastLineWidth: '40%', height: 24 },
  render: (args) => (
    <YStack width={220} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const Display: Story = {
  args: { lines: 1, size: 'display', lastLineWidth: 180 },
  render: (args) => (
    <YStack maxWidth={400}>
      <SkeletonText {...args} />
    </YStack>
  ),
};

export const Static: Story = {
  args: { lines: 3, animate: false },
  render: (args) => (
    <YStack maxWidth={400}>
      <SkeletonText {...args} />
    </YStack>
  ),
};
