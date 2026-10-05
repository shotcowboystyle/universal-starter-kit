import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import { Text } from '../../Text';

import { SafeAreaWrapper } from './index';

const meta: Meta<typeof SafeAreaWrapper> = {
  title: 'Components/SafeAreaWrapper',
  component: SafeAreaWrapper,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Platform spacing wrapper. Native applies device safe-area insets; web is a passthrough. No owned surface — knobs must not change inset calculation.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof SafeAreaWrapper>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <SafeAreaWrapper>
      <YStack>
        <Paragraph>Content inside SafeAreaWrapper</Paragraph>
        <Text>On native, this respects device safe area insets. On web, it is a simple passthrough wrapper.</Text>
      </YStack>
    </SafeAreaWrapper>
  ),
};

export const Empty: Story = {
  render: () => <SafeAreaWrapper />,
};

export const TopAndBottom: Story = {
  render: () => (
    <SafeAreaWrapper edges={['top', 'bottom']}>
      <Paragraph>edges=top,bottom — ignored on web, applied on native.</Paragraph>
    </SafeAreaWrapper>
  ),
};

export const CallerPadding: Story = {
  render: () => (
    <SafeAreaWrapper padding="$4">
      <Paragraph>Caller padding composes on the wrapper; insets stay platform-owned.</Paragraph>
    </SafeAreaWrapper>
  ),
};
