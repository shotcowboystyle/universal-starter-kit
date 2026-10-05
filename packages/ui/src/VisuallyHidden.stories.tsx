import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { VisuallyHidden, YStack } from './tamagui';
import { Text } from './Text';

const meta: Meta<typeof VisuallyHidden> = {
  title: 'Components/VisuallyHidden',
  component: VisuallyHidden,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'A11y hide utility (MPO-21 G3). Paints nothing visible. AdaptivePopup used a ' +
          'private YStack copy; the house barrel now exports the tamagui primitive so ' +
          'that copy is gone. Knob-immune.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof VisuallyHidden>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack maxWidth={420} gap="$3">
      <Text>Visible caption. The next node is in the tree and hidden from sight.</Text>
      <VisuallyHidden>Hidden label for assistive technology</VisuallyHidden>
    </YStack>
  ),
};
