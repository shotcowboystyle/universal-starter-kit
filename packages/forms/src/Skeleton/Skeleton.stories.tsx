import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, XStack, YStack } from 'tamagui';

import { Skeleton, SkeletonCircle, SkeletonText } from './index';

const meta: Meta<typeof Skeleton> = {
  title: 'Forms/Skeleton',
  component: Skeleton,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The placeholder every field paints while its value is loading — what `skeleton` on Input, Select, CheckboxGroup and the rest resolves to. A flat blob: it takes the radius knob but never draws a border, and its pulse rides the animation knob, so `animation: none` stops it dead rather than dimming it.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['text', 'circular', 'rectangular', 'rounded'] },
    animate: { control: 'boolean' },
    width: { control: 'text' },
    height: { control: 'text' },
  },
  args: {
    variant: 'text',
    animate: true,
    width: 240,
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Basic: Story = {
  render: (args) => <Skeleton {...args} />,
};

/** The four variants. `text` and `circular` carry their own height. */
export const Variants: Story = {
  render: () => (
    <YStack gap="$4">
      {(['text', 'rounded', 'rectangular'] as const).map((variant) => (
        <YStack key={variant} gap="$2">
          <Paragraph size="$2">{variant}</Paragraph>
          <Skeleton variant={variant} width={240} height={variant === 'text' ? undefined : 48} />
        </YStack>
      ))}
      <YStack gap="$2">
        <Paragraph size="$2">circular</Paragraph>
        <Skeleton variant="circular" width={48} height={48} />
      </YStack>
    </YStack>
  ),
};

/**
 * `SkeletonText` stacks lines and shortens the last one, which is what makes a
 * block of bones read as a paragraph rather than a table.
 */
export const TextLines: Story = {
  render: () => (
    <YStack gap="$6" width={320}>
      <YStack gap="$2">
        <Paragraph size="$2">one line</Paragraph>
        <SkeletonText />
      </YStack>
      <YStack gap="$2">
        <Paragraph size="$2">three lines, last at 70%</Paragraph>
        <SkeletonText lines={3} />
      </YStack>
      <YStack gap="$2">
        <Paragraph size="$2">five lines, last at 40%</Paragraph>
        <SkeletonText lines={5} lastLineWidth="40%" />
      </YStack>
    </YStack>
  ),
};

/** `SkeletonCircle` sizes itself one height step above the control ramp. */
export const Circles: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <SkeletonCircle />
      <SkeletonCircle size={32} />
      <SkeletonCircle size={64} />
    </XStack>
  ),
};

/** What a loading row actually looks like: avatar, name, two lines of body. */
export const LoadingRow: Story = {
  render: () => (
    <XStack gap="$3" width={360} alignItems="flex-start">
      <SkeletonCircle size={40} />
      <YStack flex={1} gap="$2">
        <Skeleton variant="text" width="45%" />
        <SkeletonText lines={2} />
      </YStack>
    </XStack>
  ),
};

/**
 * MOTION-RIDES-KNOB: the pulse is on when the animation knob
 * is, and gone when it is not. `animate={false}` is the same off switch at the
 * call site — neither leaves a half-speed shimmer behind.
 */
export const MotionOff: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start">
      <YStack gap="$2" width={180}>
        <Paragraph size="$2">animation knob on</Paragraph>
        <SkeletonText lines={3} />
      </YStack>
      <YStack gap="$2" width={180}>
        <Paragraph size="$2">animate={'{false}'}</Paragraph>
        <SkeletonText lines={3} animate={false} />
      </YStack>
      <Preset overrides={{ animation: 'none' }}>
        <YStack gap="$2" width={180}>
          <Paragraph size="$2">animation: none</Paragraph>
          <SkeletonText lines={3} />
        </YStack>
      </Preset>
    </XStack>
  ),
};

/**
 * R-CLAMP / R-PILL: a text bone squares off at `borderRadius: none`, and a
 * circle stays round at every radius value because it declares R-PILL.
 */
export const RadiusKnob: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start">
      {(['none', 'medium', 'large'] as const).map((borderRadius) => (
        <Preset key={borderRadius} overrides={{ borderRadius }}>
          <YStack gap="$2" width={160}>
            <Paragraph size="$2">borderRadius: {borderRadius}</Paragraph>
            <Skeleton variant="text" width={140} />
            <Skeleton variant="rounded" width={140} height={40} />
            <SkeletonCircle size={40} />
          </YStack>
        </Preset>
      ))}
    </XStack>
  ),
};
