// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { SizableText, XStack, YStack } from 'tamagui';

import { Card } from './Card';

const CardHeader = Card.Header;

const meta: Meta<typeof CardHeader> = {
  title: 'Components/CardHeader',
  component: CardHeader,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: 'Card.Header title row — zero padding of its own; the Card frame owns the inset.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof CardHeader>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <Card maxWidth={420}>
      <Card.Header>
        <SizableText fontWeight="700">Header title</SizableText>
      </Card.Header>
    </Card>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Card maxWidth={420}>
      <Card.Header>
        <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
          <SizableText fontWeight="700">Header with actions</SizableText>
          <Button size="$2">Edit</Button>
        </XStack>
      </Card.Header>
    </Card>
  ),
};

export const LongTitleNarrow: Story = {
  render: () => (
    <YStack maxWidth={260}>
      <Card>
        <Card.Header>
          <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
            <SizableText fontWeight="700" flexShrink={1}>
              A very long header title that must wrap inside a narrow card without clipping
            </SizableText>
            <Button size="$2">Act</Button>
          </XStack>
        </Card.Header>
      </Card>
    </YStack>
  ),
};
