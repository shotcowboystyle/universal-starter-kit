// Catalog Button + Input (story honesty).
import { Button, Input } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, SizableText, XStack, YStack } from 'tamagui';

import { Panel } from './surfaces';

const meta: Meta<typeof Panel> = {
  title: 'Components/Panel',
  component: Panel,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Generic knob-aware container: surface + borderRadius + elevation + panelPadding + gap applied to a plain View.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Panel>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <Panel maxWidth={420}>
      <SizableText fontWeight="600">Panel title</SizableText>
      <Paragraph>Generic knob-aware panel content.</Paragraph>
    </Panel>
  ),
};

export const Empty: Story = {
  render: () => <Panel width={220} height={80} />,
};

export const Nested: Story = {
  render: () => (
    <Panel maxWidth={480}>
      <SizableText fontWeight="600">Outer panel</SizableText>
      <Panel>
        <Paragraph>Inner nested panel — single border/radius each, no doubling.</Paragraph>
      </Panel>
    </Panel>
  ),
};

export const InteractiveContent: Story = {
  render: () => (
    <Panel maxWidth={420}>
      <SizableText fontWeight="600">Interactive content</SizableText>
      <Input placeholder="Focus me" inputProps={{ 'aria-label': 'Focus demo' }} />
      <XStack gap="$2">
        <Button>Cancel</Button>
        <Button>Submit</Button>
      </XStack>
    </Panel>
  ),
};

export const Overflow: Story = {
  render: () => (
    <YStack maxWidth={300}>
      <Panel maxHeight={160} overflow="hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <Paragraph key={i}>Overflowing panel line {i + 1}.</Paragraph>
        ))}
      </Panel>
    </YStack>
  ),
};
