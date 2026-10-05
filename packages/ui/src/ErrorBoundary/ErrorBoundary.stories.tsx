import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { type ReactNode, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { ErrorBoundary } from './index';

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['!test'],
  parameters: {
    docs: {
      description: {
        component:
          'A React error boundary component that catches JavaScript errors in child components and displays a fallback UI.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

function ThrowError(): ReactNode {
  throw new Error('This is a test error!');
}

function BuggyCounter() {
  const [count, setCount] = useState(0);

  if (count === 5) {
    throw new Error('Count reached 5!');
  }

  return (
    <YStack gap="$4">
      <Text>Count: {count}</Text>
      <Button
        onPress={() => {
          setCount(count + 1);
        }}>
        Increment
      </Button>
      <Text fontSize="$2" color="$color10">
        Click 5 times to trigger error
      </Text>
    </YStack>
  );
}

export const Basic: Story = {
  name: 'Main',
  render: () => (
    <ErrorBoundary>
      <Text>This content renders normally</Text>
    </ErrorBoundary>
  ),
};

export const WithError = () => {
  const [showBuggy, setShowBuggy] = useState(false);

  return (
    <YStack gap="$4">
      <Button
        onPress={() => {
          setShowBuggy(!showBuggy);
        }}>
        Toggle Buggy Component
      </Button>

      <ErrorBoundary key={showBuggy ? 'buggy' : 'normal'}>
        {showBuggy ? <ThrowError /> : <Text>No errors yet</Text>}
      </ErrorBoundary>
    </YStack>
  );
};

export const CounterExample = () => (
  <YStack gap="$4">
    <Text fontSize="$6" fontWeight="bold">
      Counter with Error Boundary
    </Text>
    <ErrorBoundary>
      <BuggyCounter />
    </ErrorBoundary>
  </YStack>
);

export const MultipleChildren = () => (
  <YStack gap="$4">
    <Text fontSize="$6" fontWeight="bold">
      Error Boundary with Multiple Children
    </Text>
    <ErrorBoundary>
      <Text>First child - renders fine</Text>
      <Text>Second child - renders fine</Text>
      <Text>Third child - renders fine</Text>
    </ErrorBoundary>
  </YStack>
);

export const NestedBoundaries = () => {
  const [trigger1, setTrigger1] = useState(false);
  const [trigger2, setTrigger2] = useState(false);

  return (
    <YStack gap="$4">
      <Text fontSize="$6" fontWeight="bold">
        Nested Error Boundaries
      </Text>

      <ErrorBoundary>
        <YStack gap="$2" padding="$4" backgroundColor="$blue2" borderRadius="$4">
          <Text fontWeight="bold">Outer Boundary</Text>
          <Button
            size="$3"
            onPress={() => {
              setTrigger1(!trigger1);
            }}>
            Trigger Outer Error
          </Button>
          {trigger1 && <ThrowError />}

          <ErrorBoundary>
            <YStack gap="$2" padding="$4" backgroundColor="$green2" borderRadius="$4">
              <Text fontWeight="bold">Inner Boundary</Text>
              <Button
                size="$3"
                onPress={() => {
                  setTrigger2(!trigger2);
                }}>
                Trigger Inner Error
              </Button>
              {trigger2 && <ThrowError />}
              <Text>Inner content</Text>
            </YStack>
          </ErrorBoundary>
        </YStack>
      </ErrorBoundary>
    </YStack>
  );
};
