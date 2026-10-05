import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, SizableText, YStack } from 'tamagui';

import { Card } from '../surfaces';

import { AnimateHeight } from './index';

const lines = [
  'Height is measured, not guessed.',
  'CSS cannot transition to height: auto, so the box drives a numeric height.',
  'Web measures with a ResizeObserver; native measures with onLayout.',
  'Padding belongs inside the children, never on the container.',
];

function Collapsible() {
  const [open, setOpen] = useState(false);
  return (
    <YStack gap="$3" maxWidth={420}>
      <Button
        onPress={() => {
          setOpen((value) => !value);
        }}>
        {open ? 'Collapse' : 'Expand'}
      </Button>
      <AnimateHeight open={open}>
        <Card>
          <YStack gap="$2">
            {lines.map((line) => (
              <Paragraph key={line}>{line}</Paragraph>
            ))}
          </YStack>
        </Card>
      </AnimateHeight>
    </YStack>
  );
}

function Follower() {
  const [count, setCount] = useState(1);
  return (
    <YStack gap="$3" maxWidth={420}>
      <Button
        onPress={() => {
          setCount((value) => (value >= lines.length ? 1 : value + 1));
        }}>
        {`Add a line (${count}/${lines.length})`}
      </Button>
      <AnimateHeight>
        <Card>
          <YStack gap="$2">
            {lines.slice(0, count).map((line) => (
              <Paragraph key={line}>{line}</Paragraph>
            ))}
          </YStack>
        </Card>
      </AnimateHeight>
    </YStack>
  );
}

const meta: Meta<typeof AnimateHeight> = {
  title: 'Components/AnimateHeight',
  component: AnimateHeight,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Auto-height container. CSS never interpolates `height: auto`, so this measures the content (ResizeObserver on web, onLayout on native) and tweens a numeric height through the knob `transition`. Two modes: omit `open` for follower (height tracks content while mounted), pass `open` for collapsible (children unmount once the collapse settles). Under reduced motion or `animation="none"` the knob transition is undefined and heights apply instantly, so state changes still land.',
      },
    },
  },
  argTypes: {
    open: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof AnimateHeight>;

export const Default: Story = {
  name: 'Main',
  render: () => <Collapsible />,
};

export const FollowsContent: Story = {
  name: 'Follower mode',
  render: () => <Follower />,
};

export const AlwaysOpen: Story = {
  name: 'Open',
  args: { open: true },
  render: (args) => (
    <YStack maxWidth={420}>
      <AnimateHeight {...args}>
        <Card>
          <SizableText>Toggle `open` in the controls panel.</SizableText>
        </Card>
      </AnimateHeight>
    </YStack>
  ),
};
