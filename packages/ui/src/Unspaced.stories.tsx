import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Unspaced, YStack } from './tamagui';
import { Text } from './Text';

const meta: Meta<typeof Unspaced> = {
  title: 'Components/Unspaced',
  component: Unspaced,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Spacing opt-out marker (MPO-21 G4). Paints nothing. Tells the parent stack to ' +
          'skip gap on its children. AdaptivePopup already imported this from tamagui; ' +
          'the house barrel now owns the bare name. Knob-immune.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Unspaced>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack maxWidth={420} gap="$4">
      <Text>First row — takes the stack gap.</Text>
      <Unspaced>
        <Text>Unspaced row — the parent gap does not apply here.</Text>
      </Unspaced>
      <Text>Third row — takes the stack gap again.</Text>
    </YStack>
  ),
};
