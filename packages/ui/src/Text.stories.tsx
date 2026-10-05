import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Text } from './Text';
import { Paragraph, SizableText } from './Text';

const meta: Meta<typeof Text> = {
  title: 'Components/Text',
  component: Text,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'House body text (MPO-20). Spreads knobProps.body and the textAccent ink as props, so bodyFont/fontWeight/textAccent restyle it on every platform. Default label ramp is 400 at 14/25. App text rides this, never raw tamagui typography (AN-8).',
      },
    },
  },
  argTypes: {
    children: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Text>;

export const Default: Story = {
  name: 'Main',
  args: {
    children: 'Body text follows the bodyFont, fontWeight and textAccent knobs.',
  },
};

export const Voices: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={520}>
      <Text>Text — unsized body voice.</Text>
      <SizableText size="$5">SizableText — sized body voice.</SizableText>
      <Paragraph>Paragraph — flowing copy voice with the body size default.</Paragraph>
    </YStack>
  ),
};

export const TextAccentFlip: Story = {
  name: 'textAccent flip (high vs low)',
  render: () => (
    <YStack gap="$3" maxWidth={520}>
      <Preset overrides={{ textAccent: 'high' }}>
        <Text>high — full ink ($color).</Text>
      </Preset>
      <Preset overrides={{ textAccent: 'low' }}>
        <Text>low — muted ink on the AA floor ($color11).</Text>
      </Preset>
    </YStack>
  ),
};

export const FontWeightFlip: Story = {
  name: 'fontWeight flip (regular vs bold)',
  render: () => (
    <YStack gap="$3" maxWidth={520}>
      <Preset overrides={{ fontWeight: 'regular' }}>
        <Text>regular — labels are 400 (500/600 are not label weights).</Text>
      </Preset>
      <Preset overrides={{ fontWeight: 'bold' }}>
        <Text>bold — 700.</Text>
      </Preset>
    </YStack>
  ),
};
