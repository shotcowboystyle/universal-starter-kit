import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { MDX as MdxRenderer } from '../Mdx';
import { Notice } from '../Notice';

const EMPTY_SOURCE = '';

const meta: Meta = {
  title: 'Markdown/MDX',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Runtime-compiled MDX renderer (compile + evaluate in the browser, mdxComponents mapping).',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const mdxDoc = `---
title: Sample
---

# MDX Heading 1

## Heading 2

### Heading 3 with anchor

Paragraph with **bold**, _italic_, \`inline code\`, an [internal link](/docs) and an
[external link](https://example.com).

- list item one
- list item two

1. ordered one
2. ordered two

> A blockquote paragraph.

---

\`\`\`tsx
const x: number = 1;
export default x;
\`\`\`
`;

export const Baseline: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MdxRenderer>{mdxDoc}</MdxRenderer>
    </YStack>
  ),
};

export const CustomComponentAndProps: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MdxRenderer
        components={{
          Notice: Notice as any,
        }}>
        {`export const level = 40 + 2;

<Notice theme="blue" title="From MDX">The answer is {level}.</Notice>

Nested components:

<Notice theme="yellow" title="Outer"><Notice theme="green" title="Inner">nested</Notice></Notice>
`}
      </MdxRenderer>
    </YStack>
  ),
};

export const EmptySource: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4"
      borderWidth={1}
      borderColor="$color5">
      <Paragraph>Frame around an empty MDX source:</Paragraph>
      <MdxRenderer>{EMPTY_SOURCE}</MdxRenderer>
    </YStack>
  ),
};

export const InvalidSource: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>Invalid MDX below (unclosed JSX tag) — should fail predictably:</Paragraph>
      <MdxRenderer>{'# Broken\n\n<Unclosed\n'}</MdxRenderer>
      <Paragraph>Text after the invalid MDX renderer.</Paragraph>
    </YStack>
  ),
};

export const MissingComponentMapping: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <Paragraph>MDX referencing an unmapped component:</Paragraph>
      <MdxRenderer>{'<NotMapped>hello</NotMapped>\n'}</MdxRenderer>
      <Paragraph>Text after the MDX renderer.</Paragraph>
    </YStack>
  ),
};
