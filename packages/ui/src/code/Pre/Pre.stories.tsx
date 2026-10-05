import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, YStack } from 'tamagui';

import { Pre } from './index';

const meta: Meta<typeof Pre> = {
  title: 'Components/Pre',
  component: Pre,
  tags: ['!test'],
  parameters: {
    docs: {
      description: {
        component:
          'A styled pre-formatted text container for displaying code blocks with proper spacing and background.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Pre>;

export const Basic: Story = {
  name: 'Main',
  render: () => (
    <Pre>
      <Text fontFamily="$mono">const greeting = "Hello, World!";</Text>
      <Text fontFamily="$mono">console.log(greeting);</Text>
    </Pre>
  ),
};

export const MultilineCode: Story = {
  render: () => (
    <Pre>
      <Text fontFamily="$mono">function fibonacci(n) {'{'}</Text>
      <Text fontFamily="$mono"> if (n {'<='} 1) return n;</Text>
      <Text fontFamily="$mono"> return fibonacci(n - 1) + fibonacci(n - 2);</Text>
      <Text fontFamily="$mono">{'}'}</Text>
    </Pre>
  ),
};

export const JSONExample: Story = {
  render: () => (
    <Pre>
      <Text fontFamily="$mono">{`{
  "name": "universal-starter-kit",
  "version": "1.0.0",
  "description": "Cross-platform components",
  "main": "index.js"
}`}</Text>
    </Pre>
  ),
};

export const LongCode: Story = {
  render: () => (
    <Pre>
      <Text fontFamily="$mono">{`import React from 'react';
import { View, Text } from 'react-native';

export function MyComponent() {
  const [count, setCount] = React.useState(0);

  return (
    <View>
      <Text>Count: {count}</Text>
      <Button onPress={() => setCount(count + 1)}>
        Increment
      </Button>
    </View>
  );
}`}</Text>
    </Pre>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <YStack gap="$4">
      <Pre backgroundColor="$gray2" borderRadius="$2" padding="$2">
        <Text fontFamily="$mono">Light background</Text>
      </Pre>

      <Pre backgroundColor="$gray10" borderRadius="$6" padding="$6">
        <Text fontFamily="$mono" color="$gray1">
          Dark background with custom padding
        </Text>
      </Pre>
    </YStack>
  ),
};
