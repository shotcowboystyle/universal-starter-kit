/**
 * MermaidBlock — read-only mermaid diagram for rendered markdown.
 * Engine is lazy; native falls back to a mermaid CodeBlock because the
 * engine needs a DOM. Import is colocated (MPO-10: the ./mermaid subpath
 * is the engine helpers, not this block).
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, YStack } from 'tamagui';

import { MermaidBlock } from './MermaidBlock';

const FLOWCHART = `graph TD
  A[Scan] --> B[Preview]
  B --> C[Commit]`;

const meta: Meta<typeof MermaidBlock> = {
  title: 'Markdown/Mermaid',
  component: MermaidBlock,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Fenced mermaid source rendered as SVG on web. Invalid source shows the parse error above the source (Axiom 6). Native hosts fall back to a mermaid CodeBlock.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof MermaidBlock>;

export const Main: Story = {
  name: 'Main',
  args: { children: FLOWCHART },
};

/** Same diagram; Storybook scheme addon is the dark specimen. */
export const DarkScheme: Story = {
  args: { children: FLOWCHART },
  parameters: { backgrounds: { default: 'dark' } },
};

/** Axiom 6: parse failure is visible, never a blank box. */
export const InvalidSource: Story = {
  args: { children: 'graph TD\n A--' },
};

export const NativeFallbackNote: Story = {
  render: () => (
    <YStack
      gap="$3"
      maxWidth={700}
      padding="$4">
      <Text
        fontSize="$2"
        color="$color10">
        Native has no DOM mermaid engine, so MermaidBlock.native.tsx renders the source as a mermaid CodeBlock. This web
        story is the live SVG path.
      </Text>
      <MermaidBlock>{FLOWCHART}</MermaidBlock>
    </YStack>
  ),
};
