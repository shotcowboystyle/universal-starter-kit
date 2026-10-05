import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { DebugLayout, createWithDebugLayout } from './index';

function DebugRows() {
  return <Paragraph>scheme / knobs / env</Paragraph>;
}

const meta: Meta<typeof DebugLayout> = {
  title: 'Components/DebugLayout',
  component: DebugLayout,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Diagnostic overlay: a corner pip (R-PILL) opens a house PopoverContent of debug rows. Off unless DEBUG=1 or `enabled`. The overlay is pointer-events box-none so children keep their hits except on the pip itself.',
      },
    },
  },
  argTypes: {
    enabled: { control: 'boolean' },
    size: { control: 'number' },
  },
  args: {
    enabled: true,
  },
};
export default meta;

type Story = StoryObj<typeof DebugLayout>;

export const Default: Story = {
  name: 'Main',
  render: (args) => (
    <YStack minHeight={240} width="100%" backgroundColor="$background" padding="$4">
      <DebugLayout {...args} debugView={DebugRows}>
        <Button alignSelf="flex-start" onPress={action('onPress')}>
          Hello, world!
        </Button>
      </DebugLayout>
    </YStack>
  ),
};

export const EmptyChildren: Story = {
  render: (args) => (
    <YStack minHeight={160} width="100%" padding="$4">
      <DebugLayout {...args} debugView={DebugRows} />
    </YStack>
  ),
};

export const Nested: Story = {
  render: (args) => (
    <YStack minHeight={240} width="100%" padding="$4">
      <DebugLayout {...args} debugView={DebugRows}>
        <YStack gap="$3">
          <Paragraph>Outer layout</Paragraph>
          <Button alignSelf="flex-start">Nested child</Button>
        </YStack>
      </DebugLayout>
    </YStack>
  ),
};

export const Disabled: Story = {
  args: { enabled: false },
  render: (args) => (
    <YStack minHeight={160} padding="$4">
      <DebugLayout {...args}>
        <Button alignSelf="flex-start">No debug chrome</Button>
      </DebugLayout>
    </YStack>
  ),
};

const HocPage = createWithDebugLayout([], { enabled: true, debugView: DebugRows })(() => (
  <Button alignSelf="flex-start" onPress={action('onHocPress')}>
    HOC child
  </Button>
));

export const WithHoc: Story = {
  name: 'withDebugLayout',
  render: () => (
    <YStack minHeight={160} padding="$4">
      <HocPage />
    </YStack>
  ),
};
