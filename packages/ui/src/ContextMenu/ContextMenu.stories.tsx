import { CopyIcon, DotsThreeVerticalIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, YStack, isWeb } from 'tamagui';

import { ContextMenu, type ContextMenuEntry } from './index';

const meta: Meta<typeof ContextMenu> = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Right-click (web) or long-press (native) action menu on the FloatingPanel overlay stack. Opens at the pointer as a free overlay: content width, 4px from the point, flipping at the viewport edges; a keyboard open starts at the target's bottom start corner. Sheet at ≤640. Rows share DropdownMenu grammar.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ContextMenu>;

const basicItems: ContextMenuEntry[] = [
  { label: 'Copy' },
  { label: 'Duplicate' },
  { separator: true },
  { label: 'Delete', destructive: true },
];

export const Default: Story = {
  name: 'Main',
  args: { defaultOpen: true },
  render: (args) => (
    <YStack minHeight={340} paddingTop="$4" alignItems="center">
      <ContextMenu {...args} items={basicItems}>
        <Button>Right-click or long-press</Button>
      </ContextMenu>
    </YStack>
  ),
};

export const IconsAndShortcuts: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <YStack minHeight={380} paddingTop="$4" alignItems="center">
      <ContextMenu {...args}>
        <ContextMenu.Trigger>
          <Button icon=<DotsThreeVerticalIcon size={16} />>Canvas</Button>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item icon=<PencilSimpleIcon size={16} /> shortcut="⌘E">
            Edit
          </ContextMenu.Item>
          <ContextMenu.Item icon=<CopyIcon size={16} /> shortcut="⌘C">
            Copy
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item icon=<TrashIcon size={16} /> shortcut="⌫" destructive>
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu>
    </YStack>
  ),
};

export const Checkable: Story = {
  args: { defaultOpen: true },
  render: (args) => {
    const [pinned, setPinned] = useState(true);
    const [hidden, setHidden] = useState(false);
    return (
      <YStack minHeight={340} paddingTop="$4" alignItems="center">
        <ContextMenu {...args}>
          <ContextMenu.Trigger>
            <Button>Row</Button>
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Label>View</ContextMenu.Label>
            <ContextMenu.CheckboxItem checked={pinned} onCheckedChange={setPinned}>
              Pinned
            </ContextMenu.CheckboxItem>
            <ContextMenu.CheckboxItem checked={hidden} onCheckedChange={setHidden}>
              Hidden
            </ContextMenu.CheckboxItem>
          </ContextMenu.Content>
        </ContextMenu>
      </YStack>
    );
  },
};

export const AtThePointer: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <ContextMenu items={basicItems}>
      <YStack
        {...(isWeb ? { height: '100vh' } : { flex: 1, minHeight: 480 })}
        width="100%"
        alignItems="center"
        justifyContent="center"
        backgroundColor="$color2"
        data-testid="context-surface">
        <Text color="$color11" fontSize="$2">
          Right-click anywhere. The menu opens at the pointer and flips at the edges.
        </Text>
      </YStack>
    </ContextMenu>
  ),
};

export const Closed: Story = {
  render: () => (
    <YStack minHeight={200} paddingTop="$4" alignItems="center" gap="$3">
      <ContextMenu items={basicItems}>
        <Button>Right-click me</Button>
      </ContextMenu>
      <Text color="$color11" fontSize="$2">
        Web: right-click. Native: long-press. Same menu.
      </Text>
    </YStack>
  ),
};
