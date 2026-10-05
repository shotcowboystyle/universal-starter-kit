import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Collapsible, YStack } from './tamagui';
import { Text } from './Text';

const meta: Meta<typeof Collapsible> = {
  title: 'Components/Collapsible',
  component: Collapsible,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Raw open/close primitive (MPO-21 G1). Accordion and Fold compose this — the ' +
          'compound is the substrate, not a painted section. Trigger/Content are statics. ' +
          'Knob-immune: the composing surface owns chrome.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  name: 'Main',
  render: () => (
    <YStack maxWidth={420} gap="$3">
      <Collapsible defaultOpen>
        <Collapsible.Trigger asChild>
          <Button chromeless>Toggle section</Button>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Text>Fold's substrate. The raw primitive opens and closes; Accordion (and Fold) paint the row.</Text>
        </Collapsible.Content>
      </Collapsible>
    </YStack>
  ),
};
