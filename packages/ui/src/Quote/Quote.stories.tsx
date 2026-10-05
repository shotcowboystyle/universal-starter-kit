import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Quote } from './index';

const meta: Meta<typeof Quote> = {
  title: 'Components/Quote',
  component: Quote,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Standalone pull / block quote: figure > blockquote + figcaption > cite, flush logical-start rail (RTL-safe). Same chrome as markdown Blockquote, usable outside MDX.',
      },
    },
  },
  argTypes: {
    children: { control: 'text' },
    cite: { control: 'text' },
    compact: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Quote>;

export const Default: Story = {
  name: 'Main',
  args: {
    children: 'The best way to predict the future is to invent it.',
    cite: 'Alan Kay',
  },
};

export const WithoutCite: Story = {
  args: {
    children: 'Simplicity is a great virtue but it requires hard work to achieve it.',
  },
};

export const Compact: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={480}>
      <Quote compact cite="Design guidelines">
        Prefer one composition over a dashboard of cards.
      </Quote>
      <Quote compact>Short callout without attribution.</Quote>
    </YStack>
  ),
};
