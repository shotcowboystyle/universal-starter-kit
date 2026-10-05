import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { XStack, YStack } from 'tamagui';

import { SkeletonCircle } from './index';

const meta: Meta<typeof SkeletonCircle> = {
  title: 'Components/SkeletonCircle',
  component: SkeletonCircle,
  parameters: {
    status: { type: 'stable' },
    // Explicitly-labeled skeleton specimen (the
    // skeleton is the subject here, not a promise about pending data).
    skeletonSpecimen: true,
    docs: {
      description: {
        component:
          'SKELETON SPECIMEN (D-10). Circular loading placeholder (avatar-shaped). Default diameter follows the size recipe (LC-80): one height step above the control ramp, 1:1 at every radius (R-PILL). Skeletons persist on this page by design; product surfaces must show zero skeletons once their pending source settles.',
      },
    },
  },
  argTypes: {
    size: { control: 'number' },
    animate: { control: 'boolean' },
  },
  args: {
    animate: true,
  },
};
export default meta;

type Story = StoryObj<typeof SkeletonCircle>;

export const Default: Story = {
  name: 'Main',
  render: (args) => <SkeletonCircle {...args} />,
};

export const Sizes: Story = {
  render: (args) => (
    <XStack gap="$4" alignItems="center">
      {[0, 16, 24, 40, 64, 96, 200].map((size) => (
        <SkeletonCircle key={size} {...args} size={size} />
      ))}
    </XStack>
  ),
};

export const ConstrainedParent: Story = {
  args: { size: 120 },
  render: (args) => (
    <YStack width={80} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <SkeletonCircle {...args} />
    </YStack>
  ),
};

export const Static: Story = {
  args: { animate: false },
  render: (args) => <SkeletonCircle {...args} />,
};
