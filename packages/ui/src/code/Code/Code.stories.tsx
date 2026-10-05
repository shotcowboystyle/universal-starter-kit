import type { Meta, StoryObj } from '@storybook/react-native';

import { Code } from './index';

const meta: Meta = {
  title: 'Components/Code',
  component: Code,
  parameters: {
    status: { type: 'beta' },
  },
};

export const main: StoryObj<typeof Code> = {
  name: 'Main',
  args: {
    children: `const hello = "world"
const hello = "world"`,
  },
};

export default meta;
