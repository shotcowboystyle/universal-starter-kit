import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { LinearGradient, YStack } from './tamagui';
import { Text } from './Text';

const meta: Meta<typeof LinearGradient> = {
  title: 'Components/LinearGradient',
  component: LinearGradient,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Paint primitive (MPO-21 G2). Color stops are content — the house barrel ' +
          're-exports the `tamagui/linear-gradient` subpath under the bare name so ' +
          'consumers stop deep-importing `@tamagui/linear-gradient`. Knob-immune.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof LinearGradient>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack maxWidth={420} gap="$3">
      <Text>A fade strip. Stops are the consumer's; the primitive just paints them.</Text>
      <LinearGradient
        width="100%"
        height={80}
        borderRadius="$4"
        colors={['$color4', '$background']}
        start={[0, 0]}
        end={[0, 1]}
      />
    </YStack>
  ),
};
