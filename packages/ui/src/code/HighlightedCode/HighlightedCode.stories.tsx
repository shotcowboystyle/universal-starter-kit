import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import type { ComponentProps } from 'react';
import { YStack } from 'tamagui';

import type { HighlightLine } from '../Highlighter';

import { HighlightedCode } from './index';

// What highlightCode returns under the house syntax theme: theme tokens, so
// one fixture reads in both schemes.
const sampleTokens: HighlightLine[] = [
  [
    { content: 'const', color: '$syntaxPurple' },
    { content: ' ', color: '$color12' },
    { content: 'hello', color: '$syntaxBlue' },
    { content: ' ', color: '$color12' },
    { content: '=', color: '$syntaxPurple' },
    { content: ' ', color: '$color12' },
    { content: "'world'", color: '$syntaxGreen' },
    { content: ';', color: '$color12' },
  ],
  [
    { content: 'console.', color: '$color12' },
    { content: 'log', color: '$syntaxBlue' },
    { content: '(hello);', color: '$color12' },
  ],
];

const SampleHighlightedCode = (props: Omit<ComponentProps<typeof HighlightedCode>, 'tokens'>) => (
  <HighlightedCode tokens={sampleTokens} {...props} />
);

const meta: Meta<typeof HighlightedCode> = {
  title: 'Components/HighlightedCode',
  component: HighlightedCode,
  parameters: {
    status: { type: 'beta' },
  },
};

export default meta;
type Story = StoryObj<typeof HighlightedCode>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack padding="$4" backgroundColor="$color2" borderRadius="$3">
      <SampleHighlightedCode />
    </YStack>
  ),
};

export const WithLineNumbers: Story = {
  render: () => (
    <YStack padding="$4" backgroundColor="$color2" borderRadius="$3">
      <SampleHighlightedCode showLineNumbers />
    </YStack>
  ),
};

export const WithHighlightedLines: Story = {
  render: () => (
    <YStack padding="$4" backgroundColor="$color2" borderRadius="$3">
      <SampleHighlightedCode highlightLines={[1]} showLineNumbers />
    </YStack>
  ),
};

export const Loading: Story = {
  render: () => (
    <YStack padding="$4" backgroundColor="$color2" borderRadius="$3">
      <HighlightedCode tokens={null}>Loading code...</HighlightedCode>
    </YStack>
  ),
};
