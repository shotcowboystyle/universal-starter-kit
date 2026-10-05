import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { XStack } from 'tamagui';

import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'House Button served by @repo/ui — a thin prop-compat shim over the knob-correct forms Button (radius/elevation/size knobs, LC-54 press floor, LC-53 icon slot). Raw tamagui stays reachable as TamaguiButton. `circular` is a consumer shape eject and stays round at borderRadius none (R-IDENTITY).',
      },
    },
  },
  argTypes: {
    children: { control: 'text', description: 'Button label' },
    outlined: { control: 'boolean', description: 'House outlined channel' },
    variant: {
      control: 'select',
      options: [undefined, 'outlined'],
      description: 'Raw-tamagui prop-compat; outlined maps onto the house outlined prop',
    },
    circular: {
      control: 'boolean',
      description: 'Consumer shape eject (stays round at radius none)',
    },
    chromeless: { control: 'boolean' },
    accent: { control: 'boolean' },
    error: { control: 'boolean' },
    warning: { control: 'boolean' },
    success: { control: 'boolean' },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    skeleton: { control: 'boolean' },
  },
  args: { children: 'Button' },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  name: 'Main',
};

export const Outlined: Story = {
  args: { outlined: true },
};

/** Pre-shadow consumers pass tamagui's `variant="outlined"`; the shim maps it to `outlined`. */
export const VariantCompat: Story = {
  args: { variant: 'outlined', children: 'variant=\u201coutlined\u201d' },
};

export const Intents: Story = {
  render: () => (
    <XStack gap="$3" flexWrap="wrap">
      <Button accent>Accent</Button>
      <Button error>Error</Button>
      <Button warning>Warning</Button>
      <Button success>Success</Button>
    </XStack>
  ),
};

export const IconSlots: Story = {
  render: () => (
    <XStack gap="$3" alignItems="center" flexWrap="wrap">
      <Button icon=<PlusIcon size={16} />>Leading</Button>
      <Button iconAfter=<TrashIcon size={16} /> error>
        Trailing
      </Button>
      <Button circular icon=<PlusIcon size={16} /> aria-label="Add" />
      <Button chromeless icon=<PlusIcon size={16} /> aria-label="Add row" />
    </XStack>
  ),
};

export const States: Story = {
  render: () => (
    <XStack gap="$3" alignItems="center" flexWrap="wrap">
      <Button loading>Loading</Button>
      <Button disabled disabledReason="Select a row first">
        Delete
      </Button>
      <Button skeleton />
    </XStack>
  ),
};
