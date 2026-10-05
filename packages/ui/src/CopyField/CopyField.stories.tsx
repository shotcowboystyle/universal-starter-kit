import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { NotifyHost } from '../feedback';

import { CopyField } from './index';

const meta: Meta<typeof CopyField> = {
  title: 'Components/CopyField',
  component: CopyField,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Declared copy on a read-only Input. The end-cap is a real Input.Button tab stop that rings its glyph (chip-dismiss). Confirm is notify(): Copied to clipboard.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    helperText: { control: 'text' },
    disabled: { control: 'boolean' },
    size: { control: 'select', options: ['$3', '$4', '$5'] },
  },
  decorators: [
    (Story) => (
      <NotifyHost>
        <Story />
      </NotifyHost>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CopyField>;

export const Main: Story = {
  args: {
    label: 'API token',
    value: 'mpo_live_4f2a9c81e0b3',
    helperText: 'Read-only. The value is the identifier register (mono).',
  },
};

export const Empty: Story = {
  args: {
    label: 'Webhook URL',
    value: '',
    helperText: 'Nothing to copy — the end-cap is omitted, one tab stop.',
  },
};

export const Disabled: Story = {
  args: {
    label: 'API token',
    value: 'mpo_live_4f2a9c81e0b3',
    disabled: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <YStack gap="$4" maxWidth={400}>
      <CopyField label="API token" value="mpo_live_4f2a9c81e0b3" size="$3" />
      <CopyField label="API token" value="mpo_live_4f2a9c81e0b3" size="$4" />
      <CopyField label="API token" value="mpo_live_4f2a9c81e0b3" size="$5" />
    </YStack>
  ),
};
