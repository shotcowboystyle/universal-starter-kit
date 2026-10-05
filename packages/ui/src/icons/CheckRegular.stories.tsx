import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, Theme, XStack, YStack } from 'tamagui';

import { CheckRegular } from './CheckRegular';

const meta: Meta<typeof CheckRegular> = {
  title: 'Components/CheckRegular',
  component: CheckRegular,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Check icon wrapped with themed(): colour comes from the active theme (or a theme key). Size follows numeric px or a size token. No structural knob applies (R-NONE).',
      },
    },
  },
  argTypes: {
    color: { control: 'text' },
    size: { control: 'text' },
  },
  args: {
    size: '24',
  },
};
export default meta;

type Story = StoryObj<typeof CheckRegular>;

function parseSize(size: unknown): number | string {
  return /^\d+$/.test(String(size)) ? Number(size) : (size as string);
}

export const Default: Story = {
  name: 'Main',
  render: (args) => <CheckRegular color={args.color} size={parseSize(args.size)} />,
};

export const ColorModes: Story = {
  render: () => (
    <YStack gap="$3">
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>default (theme color)</Paragraph>
        <CheckRegular size={24} />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>theme key color10</Paragraph>
        <CheckRegular size={24} color="color10" />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>theme key color11</Paragraph>
        <CheckRegular size={24} color="color11" />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>green Theme wrapper</Paragraph>
        <Theme name="green">
          <CheckRegular size={24} />
        </Theme>
      </XStack>
    </YStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      <CheckRegular size={0} />
      <CheckRegular size={12} />
      <CheckRegular size={16} />
      <CheckRegular size={24} />
      <CheckRegular size={48} />
      <CheckRegular size="$4" />
    </XStack>
  ),
};
