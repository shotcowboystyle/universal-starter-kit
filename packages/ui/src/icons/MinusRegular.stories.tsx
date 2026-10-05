import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, Theme, XStack, YStack } from 'tamagui';

import { MinusRegular } from './MinusRegular';

const meta: Meta<typeof MinusRegular> = {
  title: 'Components/MinusRegular',
  component: MinusRegular,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Minus icon wrapped with themed(): used for indeterminate checkbox state. Colour and size resolve through the theme — no black fallback.',
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

type Story = StoryObj<typeof MinusRegular>;

function parseSize(size: unknown): number | string {
  return /^\d+$/.test(String(size)) ? Number(size) : (size as string);
}

export const Default: Story = {
  name: 'Main',
  render: (args) => <MinusRegular color={args.color} size={parseSize(args.size)} />,
};

export const ColorModes: Story = {
  render: () => (
    <YStack gap="$3">
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>default (theme color)</Paragraph>
        <MinusRegular size={24} />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>theme key color10</Paragraph>
        <MinusRegular size={24} color="color10" />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>theme key color11</Paragraph>
        <MinusRegular size={24} color="color11" />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Paragraph width={160}>green Theme wrapper</Paragraph>
        <Theme name="green">
          <MinusRegular size={24} />
        </Theme>
      </XStack>
    </YStack>
  ),
};

export const IndeterminateSizes: Story = {
  render: () => (
    <XStack gap="$4" alignItems="center">
      {[12, 16, 20, 24, 32, 48].map((size) => (
        <YStack
          key={size}
          width={size + 8}
          height={size + 8}
          alignItems="center"
          justifyContent="center"
          borderWidth={1}
          borderColor="$color8"
          borderRadius="$2"
          backgroundColor="$color3">
          <MinusRegular size={size} />
        </YStack>
      ))}
    </XStack>
  ),
};
