import { Input } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { Text } from '../../Text';

import { KeyboardAvoidingWrapper } from './index';

const meta: Meta<typeof KeyboardAvoidingWrapper> = {
  title: 'Components/KeyboardAvoidingWrapper',
  component: KeyboardAvoidingWrapper,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Platform keyboard wrapper. Native shifts content when the keyboard appears; web is a passthrough. No owned surface — knobs must not change keyboard offset.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof KeyboardAvoidingWrapper>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <KeyboardAvoidingWrapper>
      <YStack>
        <Paragraph>Content inside KeyboardAvoidingWrapper</Paragraph>
        <Text>
          On native, this shifts content when the keyboard appears. On web, it is a simple passthrough wrapper.
        </Text>
        <Input label="Test input" placeholder="Focus to test keyboard avoidance" />
      </YStack>
    </KeyboardAvoidingWrapper>
  ),
};

export const Empty: Story = {
  render: () => <KeyboardAvoidingWrapper />,
};

export const Disabled: Story = {
  render: () => (
    <KeyboardAvoidingWrapper enabled={false}>
      <Input label="Disabled avoidance" placeholder="Keyboard will cover on native" />
    </KeyboardAvoidingWrapper>
  ),
};
