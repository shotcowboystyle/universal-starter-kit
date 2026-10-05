import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { YStack } from 'tamagui';

import type { TreeNode } from '../views/TreeView';

import { TreeSelect } from './index';

const accounts: TreeNode[] = [
  {
    id: 'assets',
    label: 'Assets',
    children: [
      {
        id: 'current',
        label: 'Current Assets',
        children: [
          {
            id: 'bank',
            label: 'Bank Accounts',
            children: [
              { id: 'hdfc', label: 'HDFC Current' },
              { id: 'cash', label: 'Cash' },
            ],
          },
        ],
      },
      { id: 'fixed', label: 'Fixed Assets' },
    ],
  },
  { id: 'liabilities', label: 'Liabilities' },
  { id: 'income', label: 'Income' },
];

const meta: Meta<typeof TreeSelect> = {
  title: 'Components/TreeSelect',
  component: TreeSelect,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'FloatingPanel whose body is a tree, for Link fields whose target DocType is a tree. Cover at OVERLAY_ATTACH_GAP 0; width mode at-least-trigger; caret expands, row pick commits.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof TreeSelect>;

export const Default: Story = {
  render: function Render() {
    const [value, setValue] = useState('hdfc');
    return (
      <YStack width={280} padding="$4">
        <TreeSelect
          label="Account"
          nodes={accounts}
          value={value}
          onChange={setValue}
          placeholder="Select account"
          searchPlaceholder="Filter accounts"
          emptyMessage="No matching accounts"
          defaultExpandedIds={['assets', 'current', 'bank']}
        />
      </YStack>
    );
  },
};

export const Open: Story = {
  render: function Render() {
    const [value, setValue] = useState('hdfc');
    const [open, setOpen] = useState(true);
    return (
      <YStack width={280} padding="$4">
        <TreeSelect
          label="Account"
          nodes={accounts}
          value={value}
          onChange={setValue}
          open={open}
          onOpenChange={setOpen}
          placeholder="Select account"
          searchPlaceholder="Filter accounts"
          emptyMessage="No matching accounts"
          defaultExpandedIds={['assets', 'current', 'bank']}
        />
      </YStack>
    );
  },
};

export const Account: Story = Default;

export const Empty: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <TreeSelect label="Account" nodes={accounts} placeholder="Select account" />
    </YStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <TreeSelect label="Account" nodes={accounts} value="hdfc" disabled placeholder="Select account" />
    </YStack>
  ),
};

export const WithError: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <TreeSelect
        label="Account"
        nodes={accounts}
        required
        error="An account is required"
        placeholder="Select account"
      />
    </YStack>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <TreeSelect label="Account" nodes={accounts} value="hdfc" readOnly placeholder="Select account" />
    </YStack>
  ),
};

export const Skeleton: Story = {
  render: () => (
    <YStack width={280} padding="$4">
      <TreeSelect label="Account" nodes={accounts} skeleton placeholder="Select account" />
    </YStack>
  ),
};
