import { PrinterIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Platform } from 'react-native';
import { YStack, XStack } from 'tamagui';

import { Tooltip } from './index';

const triggerLabel = Platform.OS === 'web' ? 'Hover me' : 'Long-press me';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack padding="$8" alignItems="center">
      <Tooltip content="This is a tooltip">
        <Button>{triggerLabel}</Button>
      </Tooltip>
    </YStack>
  ),
};

export const Placements: Story = {
  render: () => (
    <YStack padding="$8" gap="$4" alignItems="center">
      <Tooltip content="Top tooltip" placement="top">
        <Button>Top</Button>
      </Tooltip>
      <XStack gap="$4">
        <Tooltip content="Left tooltip" placement="left">
          <Button>Left</Button>
        </Tooltip>
        <Tooltip content="Right tooltip" placement="right">
          <Button>Right</Button>
        </Tooltip>
      </XStack>
      <Tooltip content="Bottom tooltip" placement="bottom">
        <Button>Bottom</Button>
      </Tooltip>
    </YStack>
  ),
};

export const LongContent: Story = {
  render: () => (
    <YStack padding="$8" alignItems="center">
      <Tooltip content="Saving applies your new settings right away. You can change them later from Preferences.">
        <Button>Save</Button>
      </Tooltip>
    </YStack>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <YStack padding="$8" alignItems="center">
      <Tooltip content="Print">
        <Button circular aria-label="Print">
          <PrinterIcon />
        </Button>
      </Tooltip>
    </YStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <YStack padding="$8" alignItems="center">
      <Tooltip content="You should not see this" disabled>
        <Button>Disabled tooltip</Button>
      </Tooltip>
    </YStack>
  ),
};
