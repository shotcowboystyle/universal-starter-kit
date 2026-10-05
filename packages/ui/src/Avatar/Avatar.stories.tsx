import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { SizableText, XStack, YStack } from 'tamagui';

import { Avatar } from './index';

const meta: Meta<typeof Avatar> = {
  title: 'Components/Avatar',
  component: Avatar,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Themed Avatar for assigned users, comments, and activity feeds. Image with initials fallback; size recipe (density ≠ size, nested scales down); compound Avatar.Image / Avatar.Fallback / Avatar.Group.',
      },
    },
  },
  argTypes: {
    name: { control: 'text' },
    src: { control: 'text' },
    size: { control: 'text' },
    circular: { control: 'boolean' },
    nested: { control: 'boolean' },
    compact: { control: 'boolean' },
    status: { control: 'select', options: ['online', 'busy', 'away', 'offline'] },
  },
};
export default meta;

type Story = StoryObj<typeof Avatar>;

const Caption = ({ children }: { children: string }) => (
  <SizableText size="$1" color="$color11">
    {children}
  </SizableText>
);

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack gap="$4" padding="$4">
      <XStack gap="$3" alignItems="center">
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
        <Avatar name="Katherine Johnson" />
        <Avatar name="Linus Torvalds" />
        <Avatar />
      </XStack>
      <XStack gap="$3" alignItems="flex-end">
        {(['$1.5', '$2', '$3', '$4', '$6'] as const).map((size) => (
          <YStack key={size} alignItems="center" gap="$1">
            <Avatar name="Ada Lovelace" size={size} />
            <Caption>{size}</Caption>
          </YStack>
        ))}
      </XStack>
      <XStack gap="$4" alignItems="flex-end">
        <YStack alignItems="center" gap="$1">
          <Avatar name="Ada Lovelace" />
          <Caption>page</Caption>
        </YStack>
        <YStack alignItems="center" gap="$1">
          <Avatar name="Ada Lovelace" nested />
          <Caption>nested</Caption>
        </YStack>
        <YStack alignItems="center" gap="$1">
          <Avatar name="Ada Lovelace" compact />
          <Caption>compact</Caption>
        </YStack>
        <Avatar name="Ada Lovelace" status="online" />
        <Avatar name="Grace Hopper" status="busy" />
        <Avatar circular={false} name="Bitspur Labs" />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Avatar.Group>
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" />
          <Avatar name="Alan Turing" />
          <Avatar name="Katherine Johnson" />
          <Avatar name="Linus Torvalds" />
        </Avatar.Group>
        <Avatar.Group circular={false} overlap={false}>
          <Avatar name="Core Team" />
          <Avatar name="Ops Bot" />
          <Avatar name="Docs Org" />
        </Avatar.Group>
      </XStack>
    </YStack>
  ),
};

export const WithImage: Story = {
  args: {
    name: 'Grace Hopper',
    src: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&dpr=2&q=80',
    size: '$5',
    status: 'online',
  },
};

export const Sizes: Story = {
  render: () => (
    <XStack gap="$3" alignItems="center">
      {(['$1.5', '$2', '$3', '$4', '$6'] as const).map((size) => (
        <YStack key={size} alignItems="center" gap="$1">
          <Avatar name="Ada Lovelace" size={size} />
          <SizableText size="$1" color="$color11">
            {size}
          </SizableText>
        </YStack>
      ))}
    </XStack>
  ),
};

export const InitialsFallback: Story = {
  render: () => (
    <XStack gap="$3" alignItems="center">
      <Avatar name="Ada Lovelace" />
      <Avatar name="grace.hopper@navy.mil" />
      <Avatar name="X" />
      <Avatar initials="MP" name="Multiplatform" />
    </XStack>
  ),
};

export const Nested: Story = {
  render: () => (
    <XStack gap="$4" alignItems="flex-end">
      <YStack alignItems="center" gap="$1">
        <Avatar name="Ada Lovelace" />
        <SizableText size="$1" color="$color11">
          page
        </SizableText>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <Avatar name="Ada Lovelace" nested />
        <SizableText size="$1" color="$color11">
          nested
        </SizableText>
      </YStack>
      <YStack alignItems="center" gap="$1">
        <Avatar name="Ada Lovelace" compact />
        <SizableText size="$1" color="$color11">
          compact
        </SizableText>
      </YStack>
    </XStack>
  ),
};

export const Group: Story = {
  render: () => (
    <YStack gap="$4">
      <Avatar.Group>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
        <Avatar name="Katherine Johnson" />
        <Avatar name="Linus Torvalds" />
      </Avatar.Group>
      <Avatar.Group circular={false} overlap={false}>
        <Avatar name="Core Team" />
        <Avatar name="Ops Bot" />
        <Avatar name="Docs Org" />
      </Avatar.Group>
    </YStack>
  ),
};

export const Compound: Story = {
  render: () => (
    <Avatar circular size="$5" backgroundColor="$blue4">
      <Avatar.Fallback backgroundColor="$blue4" alignItems="center" justifyContent="center">
        <SizableText fontSize="$3" color="$blue11" fontWeight="600">
          CH
        </SizableText>
      </Avatar.Fallback>
    </Avatar>
  ),
};
