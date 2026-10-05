// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, SizableText, XStack, YStack } from 'tamagui';

import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Knob-aware Card (shared surface with Card.Header / Card.Footer). NestedScale steps density (LC-73); nested hue is opt-in — Card does not wrap Tint (R12).',
      },
    },
  },
  argTypes: {
    tier: {
      control: 'select',
      options: ['content', 'elevated', 'feature'],
    },
  },
  args: { tier: 'content' },
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <Card {...args} maxWidth={420}>
      <SizableText fontWeight="700">Card content</SizableText>
      <Paragraph>Body copy inside the knob-aware card surface.</Paragraph>
    </Card>
  ),
};

export const Tiers: Story = {
  render: () => (
    <XStack gap="$4" flexWrap="wrap">
      {(['content', 'elevated', 'feature'] as const).map((tier) => (
        <Card key={tier} tier={tier} width={220}>
          <SizableText fontWeight="700">{tier}</SizableText>
          <Paragraph>Tier surface.</Paragraph>
        </Card>
      ))}
    </XStack>
  ),
};

export const WithHeaderFooter: Story = {
  render: (args) => (
    <Card {...args} maxWidth={420}>
      <Card.Header>
        <SizableText fontWeight="700">Header title</SizableText>
      </Card.Header>
      <Paragraph>Main content between header and footer.</Paragraph>
      <Card.Footer>
        <XStack gap="$2">
          <Button>Cancel</Button>
          <Button>Confirm</Button>
        </XStack>
      </Card.Footer>
    </Card>
  ),
};

export const Empty: Story = {
  render: (args) => <Card {...args} width={220} height={80} />,
};

export const Nested: Story = {
  render: (args) => (
    <Card {...args} maxWidth={480}>
      <SizableText fontWeight="700">Outer card</SizableText>
      <Card {...args}>
        <Paragraph>Inner nested card — NestedScale steps density; hue does not auto-tint.</Paragraph>
      </Card>
    </Card>
  ),
};

export const CompactDensity: Story = {
  render: (args) => (
    <Preset overrides={{ density: 'compact' }}>
      <Card {...args} maxWidth={420}>
        <Card.Header>
          <SizableText fontWeight="700">Compact density</SizableText>
        </Card.Header>
        <Paragraph>Ancestor compact — NestedScale does not step density up.</Paragraph>
      </Card>
    </Preset>
  ),
};

export const LongContent: Story = {
  render: (args) => (
    <Card {...args} maxWidth={420}>
      <YStack gap="$2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Paragraph key={i}>Long content line {i + 1} to stretch the card vertically.</Paragraph>
        ))}
      </YStack>
    </Card>
  ),
};
