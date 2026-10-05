import type { Meta, StoryObj } from '@storybook/react-native';

import { CodeBlock } from './index';

const meta: Meta = {
  title: 'Components/CodeBlock',
  component: CodeBlock,
  parameters: {
    status: { type: 'beta' },
  },
};

export const main: StoryObj<typeof CodeBlock> = {
  name: 'Main',
  args: {
    disableCopy: false,
    language: 'ts',
    showLineNumbers: false,
    children: `
const hello = 'world';

function howdy() {
  return 'texas';
}
`,
  },
};

export default meta;
