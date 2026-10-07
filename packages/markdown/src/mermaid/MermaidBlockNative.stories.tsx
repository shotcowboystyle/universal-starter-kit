/**
 * MermaidBlock.native — the NATIVE fallback, rendered here on web so the
 * fallback itself is inspectable.
 *
 * Markdown/Mermaid's NativeFallbackNote story described this file in prose
 * and then rendered the web block instead, so nobody had ever looked at what
 * native actually paints. The native tier has no DOM, mermaid needs one, so
 * the fallback renders the diagram SOURCE as a mermaid-tagged CodeBlock.
 * Importing the `.native` module explicitly is what makes that visible —
 * the web resolver would otherwise hand back MermaidBlock.tsx.
 */

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { MermaidBlock as NativeMermaidBlock } from './MermaidBlock.native';

const FLOWCHART = `graph TD
  A[Scan] --> B[Preview]
  B --> C[Commit]`;

const SEQUENCE = `sequenceDiagram
  Client->>Server: parse
  Server-->>Client: mdast`;

const meta: Meta<typeof NativeMermaidBlock> = {
  title: 'Markdown/Mermaid Native',
  component: NativeMermaidBlock,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'The native tier of MermaidBlock. No DOM means no mermaid engine, so the diagram source renders as a mermaid CodeBlock instead of an SVG. Same props as the web block, no diagram host and no error state — invalid source is just source.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof NativeMermaidBlock>;

export const Main: Story = {
  args: { children: FLOWCHART },
};

/** A second grammar: the fallback never parses, so any source is fine. */
export const Sequence: Story = {
  args: { children: SEQUENCE },
};

/**
 * The web block shows a parse error above the source for invalid input.
 * Native has no parser, so the same input is shown verbatim with no alert.
 */
export const InvalidSourceIsJustSource: Story = {
  args: { children: 'graph TD\n A--' },
};

/** Side by side with what the fallback is standing in for. */
export const AgainstTheWebPath: Story = {
  render: () => (
    <YStack
      gap="$3"
      maxWidth={700}
      padding="$4">
      <Paragraph
        size="$2"
        color="$color10">
        This is MermaidBlock.native.tsx, the tier iOS and Android resolve. The web tier of the same component renders a
        live SVG for this source; see Markdown/Mermaid.
      </Paragraph>
      <NativeMermaidBlock>{FLOWCHART}</NativeMermaidBlock>
    </YStack>
  ),
};

/** Empty and single-line sources still paint a code block, never nothing. */
export const Edge: Story = {
  render: () => (
    <YStack
      gap="$4"
      maxWidth={700}
      padding="$4">
      <NativeMermaidBlock />
      <NativeMermaidBlock>{'graph LR; A-->B'}</NativeMermaidBlock>
    </YStack>
  ),
};
