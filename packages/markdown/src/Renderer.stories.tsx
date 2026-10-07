/**
 * renderMarkdown / renderNode — the mdast walker. Markdown.tsx is the
 * component wrapper around it; this story renders the walker DIRECTLY over a
 * parsed tree, which is the surface library consumers actually call when they
 * own the parse step (streaming, caching, an AST they mutated themselves).
 *
 * Every branch of the switch is on screen at once, so a node type that stops
 * rendering shows up here rather than in whichever page happened to use it.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph as TamaguiParagraph, YStack } from 'tamagui';

import { parseMarkdown } from './parser';
import { renderMarkdown } from './renderer';
import type { MarkdownComponents } from './types';

const meta: Meta = {
  title: 'Markdown/Renderer',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'renderMarkdown walks an mdast Root and maps every node type onto the markdown component set. Custom components override any node; unknown nodes degrade to their children instead of vanishing.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const kitchenSink = `# Renderer kitchen sink

A paragraph with **strong**, *emphasis*, ~~strikethrough~~, \`inlineCode\` and a
[link to tamagui](https://tamagui.dev).

## Lists

- unordered one
- unordered two

1. ordered one
2. ordered two

- [x] a checked task
- [ ] an unchecked task

> A blockquote, which carries its own paragraph.

---

| Prop | Type | Default |
| --- | --- | --- |
| level | 1-6 | 1 |
| children | ReactNode | none |

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

const mermaidFence = `Fenced \`mermaid\` goes to the live diagram renderer, not the code block:

\`\`\`mermaid
graph TD
  A[Parse] --> B[Render]
  B --> C[Paint]
\`\`\`
`;

export const Main: Story = {
  args: { codeTheme: 'auto' },
  argTypes: {
    codeTheme: { control: 'select', options: ['auto', 'github-dark', 'github-light'] },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      {renderMarkdown(parseMarkdown(kitchenSink), { codeTheme: args.codeTheme })}
    </YStack>
  ),
};

/** GitLab parity: a mermaid fence renders as a diagram, not as code. */
export const MermaidFence: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      {renderMarkdown(parseMarkdown(mermaidFence))}
    </YStack>
  ),
};

const overrides: Partial<MarkdownComponents> = {
  h1: ({ children }) => (
    <TamaguiParagraph
      size="$8"
      color="$blue10">
      {children}
    </TamaguiParagraph>
  ),
  p: ({ children }) => <TamaguiParagraph color="$green10">{children}</TamaguiParagraph>,
  blockquote: ({ children }) => (
    <YStack
      borderLeftWidth={4}
      borderColor="$blue8"
      paddingLeft="$3">
      {children}
    </YStack>
  ),
};

/**
 * Any node type can be replaced. The overrides here are deliberately loud so
 * a silently-ignored `components` map is obvious.
 */
export const CustomComponents: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      {renderMarkdown(parseMarkdown('# Overridden heading\n\nAn overridden paragraph.\n\n> An overridden quote.'), {
        components: overrides,
      })}
    </YStack>
  ),
};

/**
 * Degradation: an unknown container renders its children, an unknown leaf
 * renders its value, and an empty document renders an empty frame rather
 * than throwing.
 */
export const UnknownNodes: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4"
      gap="$3">
      <TamaguiParagraph>Unknown container keeps its children:</TamaguiParagraph>
      {renderMarkdown({
        type: 'root',
        children: [
          {
            type: 'somethingNobodyMapped',
            children: [{ type: 'text', value: 'the child survived' }],
          },
          { type: 'anotherUnknownLeaf', value: 'the leaf value survived' },
        ],
      } as any)}
      <TamaguiParagraph>An empty document renders an empty frame:</TamaguiParagraph>
      {renderMarkdown(parseMarkdown(''))}
    </YStack>
  ),
};
