// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, XStack, YStack } from 'tamagui';

import { Card } from './Card';

const CardFooter = Card.Footer;

const meta: Meta<typeof CardFooter> = {
  title: 'Components/CardFooter',
  component: CardFooter,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Card.Footer action row — zero padding of its own (LC-09); the Card frame owns the inset. Bare captions ride T-BODY (LC-82). Nested hue is opt-in on Card — this part does not wrap Tint (R12).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof CardFooter>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <Card maxWidth={420}>
      <Paragraph>Card body content.</Paragraph>
      <Card.Footer>
        Ready to submit
        <XStack gap="$2">
          <Button>Cancel</Button>
          <Button>Confirm</Button>
        </XStack>
      </Card.Footer>
    </Card>
  ),
};

export const EmptyFooter: Story = {
  render: () => (
    <Card maxWidth={420}>
      <Paragraph>Body above an empty footer.</Paragraph>
      <Card.Footer />
    </Card>
  ),
};

export const ManyActionsNarrow: Story = {
  render: () => (
    <YStack maxWidth={260}>
      <Card>
        <Paragraph>Narrow card body.</Paragraph>
        <Card.Footer>
          <XStack gap="$2" flexWrap="wrap">
            <Button size="$2">A very long action label</Button>
            <Button size="$2">Another action</Button>
            <Button size="$2">Primary confirm</Button>
          </XStack>
        </Card.Footer>
      </Card>
    </YStack>
  ),
};
