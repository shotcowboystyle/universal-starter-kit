import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { Icon } from './index';

const meta: Meta<typeof Icon> = {
  title: 'Forms/Icon',
  component: Icon,
  parameters: {
    docs: {
      description: {
        component:
          'Icon picker over FloatingPanel. Options come from the DG-IDN-06 drawn set. The panel matches its field and wraps fixed-size glyph cells.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Icon>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const Example = () => {
      const [value, setValue] = useState('mail');
      return (
        <YStack gap="$4" width={320}>
          <Icon
            label="Workspace icon"
            value={value}
            onChange={(next) => {
              setValue(next);
              action('onChange')(next);
            }}
          />
        </YStack>
      );
    };
    return <Example />;
  },
};

export const Empty: Story = {
  render: () => (
    <YStack width={320}>
      <Icon label="Workspace icon" placeholder="Choose an icon" />
    </YStack>
  ),
};

export const Wide: Story = {
  render: () => (
    <YStack width={600} maxWidth="100%">
      <Icon label="Workspace icon" value="mail" />
    </YStack>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <YStack width={320}>
      <Icon label="Workspace icon" value="upload" readOnly />
    </YStack>
  ),
};
