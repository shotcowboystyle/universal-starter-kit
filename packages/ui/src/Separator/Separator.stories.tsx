import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, XStack, YStack } from 'tamagui';

import { sectionHeading } from '../componentColors';

import { Separator } from './index';

const meta: Meta<typeof Separator> = {
  title: 'Components/Separator',
  component: Separator,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'House rule between content groups: a painted 1px line in $borderColor ' +
          '(tamagui-rendered-reference §7.3 — 1px, never 0.5px). The quiet variant dims ' +
          'with opacity 0.5 rather than a lighter colour; vertical rules are 1px wide.',
      },
    },
  },
  argTypes: {
    vertical: { control: 'boolean', description: '1px-wide vertical rule' },
    quiet: { control: 'boolean', description: 'Half-opacity rule (never a lighter colour)' },
  },
};
export default meta;

type Story = StoryObj<typeof Separator>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <YStack width={420} gap="$3">
      <Text {...sectionHeading}>Group title</Text>
      <Separator {...args} />
      <Text>Content under the rule — the separator paints, it is not a 1px gap.</Text>
    </YStack>
  ),
};

export const Quiet: Story = {
  args: { quiet: true },
  render: (args) => (
    <YStack width={420} gap="$3">
      <Separator />
      <Text>Between a default rule…</Text>
      <Separator {...args} />
      <Text>…and a quiet one: same colour, half the opacity.</Text>
    </YStack>
  ),
};

export const Vertical: Story = {
  args: { vertical: true },
  render: (args) => (
    <XStack height={44} alignItems="center" gap="$3">
      <Text>Start</Text>
      <Separator {...args} />
      <Text>End</Text>
    </XStack>
  ),
};
