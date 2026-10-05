import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Anchor, H2, Paragraph, YStack } from 'tamagui';

import { CodeInline } from './Code/index';

const meta: Meta<typeof CodeInline> = {
  title: 'Components/CodeInline',
  component: CodeInline,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Inline code chip: mono font, tinted background, percentage-based padding sized relative to surrounding text.',
      },
    },
  },
  argTypes: {
    children: { control: 'text' },
  },
  args: {
    children: 'npm install',
  },
};
export default meta;

type Story = StoryObj<typeof CodeInline>;

export const Default: Story = {
  name: 'Main',
  render: (args) => <CodeInline>{args.children}</CodeInline>,
};

export const InProse: Story = {
  render: (args) => (
    <YStack gap="$4" maxWidth={520}>
      <Paragraph>
        Run <CodeInline>{args.children}</CodeInline> in your terminal, then edit <CodeInline>package.json</CodeInline>{' '}
        to add the script.
      </Paragraph>
      <H2>
        Heading with <CodeInline>inline code</CodeInline>
      </H2>
      <Paragraph>
        Linked:{' '}
        <Anchor href="https://example.com">
          docs for <CodeInline>useResolvedKnobs</CodeInline>
        </Anchor>
      </Paragraph>
    </YStack>
  ),
};

export const EdgeTokens: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={420} borderWidth={1} borderColor="$color6" borderStyle="dashed">
      <Paragraph>
        Spaces: <CodeInline>{'  padded  '}</CodeInline> end.
      </Paragraph>
      <Paragraph>
        Backticks: <CodeInline>`quoted`</CodeInline> end.
      </Paragraph>
      <Paragraph>
        Long token:{' '}
        <CodeInline>averyveryverylongunbrokentokenthatnormallywouldwanttowrapacrosslines_and_keeps_going</CodeInline>{' '}
        end.
      </Paragraph>
      <Paragraph>
        Empty: <CodeInline /> end.
      </Paragraph>
    </YStack>
  ),
};
