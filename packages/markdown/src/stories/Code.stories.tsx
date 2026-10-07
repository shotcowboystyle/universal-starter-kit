import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { CodeBlock } from '../components/CodeBlock';
import { MDXCodeBlock } from '../MdxCodeBlock';

const meta: Meta = {
  title: 'Markdown/Code',
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component: 'Markdown CodeBlock (Shiki token renderer) and MDXCodeBlock (Pre/Code + copy).',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const tsSample = `interface User {
  id: string;
  name: string;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}`;

const longLineSample = `const reallyLongLine = someFunction(argumentOne, argumentTwo, argumentThree, argumentFour, argumentFive, argumentSix, argumentSeven, argumentEight, argumentNine);\nshort();`;

export const CodeBlockBaseline: Story = {
  args: { lang: 'typescript', theme: 'auto' },
  argTypes: {
    lang: { control: 'text' },
    theme: { control: 'select', options: ['auto', 'github-dark', 'github-light'] },
  },
  render: (args: any) => (
    <YStack
      maxWidth={700}
      padding="$4">
      <CodeBlock
        lang={args.lang}
        theme={args.theme}>
        {tsSample}
      </CodeBlock>
    </YStack>
  ),
};

export const CodeBlockEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <CodeBlock lang="notareallanguage">unknown language fallback</CodeBlock>
      <CodeBlock lang="typescript" />
      <CodeBlock lang="javascript">{longLineSample}</CodeBlock>
    </YStack>
  ),
};

const mdxLines = Array.from({ length: 14 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');
const mdxLong = Array.from({ length: 30 }, (_, i) => `console.log("line ${i + 1}");`).join('\n');

export const MdxCodeBlockBaseline: Story = {
  name: 'MDXCodeBlock',
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXCodeBlock className="language-tsx">{tsSample}</MDXCodeBlock>
    </YStack>
  ),
};

export const MdxCodeBlockLineNumbers: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXCodeBlock className="language-ts">{mdxLines}</MDXCodeBlock>
    </YStack>
  ),
};

export const MdxCodeBlockCutoff: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXCodeBlock className="language-js">{mdxLong}</MDXCodeBlock>
    </YStack>
  ),
};

export const MdxCodeBlockCollapsible: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXCodeBlock
        className="language-ts"
        isCollapsible>
        {tsSample}
      </MDXCodeBlock>
    </YStack>
  ),
};

export const MdxCodeBlockHighlight: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXCodeBlock
        className="language-ts"
        isHighlightingLines
        {...({ line: '2-3' } as any)}>
        {tsSample}
      </MDXCodeBlock>
    </YStack>
  ),
};

export const MdxCodeBlockEdge: Story = {
  render: () => (
    <YStack
      maxWidth={700}
      padding="$4">
      <MDXCodeBlock className="language-notareallanguage">weird lang</MDXCodeBlock>
      <MDXCodeBlock />
      <MDXCodeBlock
        className="language-js"
        disableCopy>
        // copy disabled
      </MDXCodeBlock>
      <MDXCodeBlock className="language-js">{longLineSample}</MDXCodeBlock>
    </YStack>
  ),
};
