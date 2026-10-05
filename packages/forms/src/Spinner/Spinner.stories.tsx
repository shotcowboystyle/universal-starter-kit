import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { XStack, YStack, Paragraph } from 'tamagui';

import { Button } from '../Button';

import { Spinner } from './index';

const meta: Meta<typeof Spinner> = {
  title: 'Forms/Spinner',
  component: Spinner,
  parameters: { status: { type: 'beta' } },
  argTypes: {
    size: { control: 'select', options: ['small', 'large'] },
    color: { control: 'color' },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Basic: Story = {
  render: (args) => <Spinner {...args} />,
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$6">
      <XStack gap="$6" alignItems="center">
        <YStack gap="$2" alignItems="center">
          <Spinner size="small" />
          <Paragraph size="$2">small</Paragraph>
        </YStack>
        <YStack gap="$2" alignItems="center">
          <Spinner size="large" />
          <Paragraph size="$2">large</Paragraph>
        </YStack>
        <YStack gap="$2" alignItems="center">
          <Spinner size="small" color="$red10" />
          <Paragraph size="$2">custom color</Paragraph>
        </YStack>
      </XStack>
      <XStack gap="$6" alignItems="center">
        <YStack gap="$2" alignItems="center">
          <Preset overrides={{ size: 'small' }}>
            <Spinner />
          </Preset>
          <Paragraph size="$2">knob small</Paragraph>
        </YStack>
        <YStack gap="$2" alignItems="center">
          <Preset overrides={{ size: 'medium' }}>
            <Spinner />
          </Preset>
          <Paragraph size="$2">knob medium</Paragraph>
        </YStack>
        <YStack gap="$2" alignItems="center">
          <Preset overrides={{ size: 'large' }}>
            <Spinner />
          </Preset>
          <Paragraph size="$2">knob large</Paragraph>
        </YStack>
        <YStack gap="$2" alignItems="center">
          <Preset overrides={{ animation: 'none' }}>
            <Spinner size="large" />
          </Preset>
          <Paragraph size="$2">motion off</Paragraph>
        </YStack>
      </XStack>
    </YStack>
  ),
};

export const MountUnmount: Story = {
  render: () => {
    const Example = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <YStack gap="$4" alignItems="flex-start">
          <Button
            onPress={() => {
              setMounted((m) => !m);
            }}>
            {mounted ? 'Unmount spinner' : 'Mount spinner'}
          </Button>
          <XStack height={48} alignItems="center">
            {mounted ? <Spinner size="large" /> : <Paragraph size="$2">unmounted</Paragraph>}
          </XStack>
        </YStack>
      );
    };
    return <Example />;
  },
};
