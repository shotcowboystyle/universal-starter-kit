import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CopyIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  TrashIcon,
} from '@phosphor-icons/react';
// Catalog Button (story honesty).
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { DropdownMenu, type DropdownMenuEntry } from './index';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Components/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Standalone action menu on the FloatingPanel overlay stack (cover contract: attach gap 0, at-least-trigger). Edge-to-edge rows (SP-EDGE), keyboard operable (arrows/Enter/Escape/typeahead), destructive rows on the error intent. Composable parts plus a convenience items=[] prop.',
      },
    },
  },
  argTypes: {
    placement: {
      control: 'select',
      options: ['bottom-start', 'bottom', 'bottom-end', 'top-start', 'top', 'top-end'],
      description: 'Menu placement relative to the trigger',
    },
    defaultOpen: { control: 'boolean', description: 'Uncontrolled initial open state' },
    maxHeight: { control: 'number', description: 'Max menu height before scrolling (items path)' },
    onOpenChange: { action: 'openChange' },
  },
};
export default meta;

type Story = StoryObj<typeof DropdownMenu>;

const basicItems: DropdownMenuEntry[] = [
  {
    label: 'Edit',
    onSelect: () => {
      console.log('edit');
    },
  },
  {
    label: 'Duplicate',
    onSelect: () => {
      console.log('duplicate');
    },
  },
  {
    label: 'Archive',
    onSelect: () => {
      console.log('archive');
    },
  },
  { separator: true },
  {
    label: 'Delete',
    destructive: true,
    onSelect: () => {
      console.log('delete');
    },
  },
];

export const Default: Story = {
  name: 'Main',
  args: { defaultOpen: true, placement: 'bottom-start' },
  render: (args) => (
    <YStack minHeight={340} paddingTop="$4" alignItems="center">
      <DropdownMenu {...args} items={basicItems}>
        <Button>Actions</Button>
      </DropdownMenu>
    </YStack>
  ),
};

export const IconsAndShortcuts: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <YStack minHeight={380} paddingTop="$4" alignItems="center">
      <DropdownMenu {...args}>
        <DropdownMenu.Trigger asChild>
          <Button icon=<DotsThreeVerticalIcon size={16} />>More</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item icon=<PencilSimpleIcon size={16} /> shortcut="⌘E">
            Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item icon=<CopyIcon size={16} /> shortcut="⌘C">
            Copy link
          </DropdownMenu.Item>
          <DropdownMenu.Item icon=<ShareNetworkIcon size={16} />>Share</DropdownMenu.Item>
          <DropdownMenu.Item
            icon=<DownloadSimpleIcon size={16} />
            shortcut="⌘S"
            disabled
            disabledReason="Export is still generating">
            Download
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item icon=<TrashIcon size={16} /> shortcut="⌫" destructive>
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </YStack>
  ),
};

export const Checkable: Story = {
  args: { defaultOpen: true },
  render: (args) => {
    const [showGrid, setShowGrid] = useState(true);
    const [showRulers, setShowRulers] = useState(false);
    const [snap, setSnap] = useState(true);
    return (
      <YStack minHeight={340} paddingTop="$4" alignItems="center">
        <DropdownMenu {...args}>
          <DropdownMenu.Trigger asChild>
            <Button>View options</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Label>Canvas</DropdownMenu.Label>
            <DropdownMenu.CheckboxItem checked={showGrid} onCheckedChange={setShowGrid}>
              Show grid
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem checked={showRulers} onCheckedChange={setShowRulers}>
              Show rulers
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator />
            <DropdownMenu.CheckboxItem checked={snap} onCheckedChange={setSnap}>
              Snap to grid
            </DropdownMenu.CheckboxItem>
          </DropdownMenu.Content>
        </DropdownMenu>
      </YStack>
    );
  },
};

export const Destructive: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <YStack minHeight={300} paddingTop="$4" alignItems="center">
      <DropdownMenu
        {...args}
        items={[
          { label: 'Open', icon: <ArrowSquareOutIcon size={16} /> },
          { separator: true },
          { label: 'Remove member', destructive: true, icon: <TrashIcon size={16} /> },
          {
            label: 'Delete workspace',
            destructive: true,
            disabled: true,
            disabledReason: 'Transfer ownership first',
          },
        ]}>
        <Button>Danger zone</Button>
      </DropdownMenu>
    </YStack>
  ),
};

export const LongListScroll: Story = {
  args: { defaultOpen: true, maxHeight: 240 },
  render: (args) => (
    <YStack minHeight={380} paddingTop="$4" alignItems="center">
      <DropdownMenu
        {...args}
        items={Array.from({ length: 24 }, (_, i) => ({
          key: `item-${i}`,
          label: `Menu item ${i + 1}`,
          onSelect: () => {
            console.log(`item ${i + 1}`);
          },
        }))}>
        <Button>Long list</Button>
      </DropdownMenu>
    </YStack>
  ),
};

/**
 * Single-select "radio-style" navigation menu — the exact app
 * consumer shape (ViewHeader view switcher, KanbanBoardPicker, SortControl):
 * every entry is a checkable item (shared 18px check gutter, aria-checked on
 * the current pick), each entry carries `onSelect` for the navigation, and
 * the menu-level `closeOnSelect` opts the COMPOSE-class checkbox rows into
 * commit-and-close. Selecting a view updates the trigger label AND
 * closes the menu — no controlled-open wiring in the consumer.
 */
export const RadioStyleNavigation: Story = {
  render: () => {
    const views = ['List', 'Report', 'Kanban', 'Calendar'];
    const [view, setView] = useState('List');
    return (
      <YStack minHeight={340} paddingTop="$4" alignItems="center" gap="$3">
        <DropdownMenu
          closeOnSelect
          items={views.map((candidate) => ({
            key: candidate,
            label: candidate,
            checked: candidate === view,
            onSelect: () => {
              setView(candidate);
            },
          }))}>
          <Button iconAfter=<CaretDownIcon size={14} />>{view}</Button>
        </DropdownMenu>
        <Text color="$color11" fontSize="$2" data-testid="current-view">
          Current view: {view}
        </Text>
      </YStack>
    );
  },
};

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [last, setLast] = useState<string | null>(null);
    return (
      <YStack minHeight={340} paddingTop="$4" alignItems="center" gap="$3">
        <XStack gap="$3" alignItems="center">
          <DropdownMenu
            open={open}
            onOpenChange={setOpen}
            items={[
              {
                label: 'First action',
                onSelect: () => {
                  setLast('First action');
                },
              },
              {
                label: 'Second action',
                onSelect: () => {
                  setLast('Second action');
                },
              },
            ]}>
            <Button>Controlled menu</Button>
          </DropdownMenu>
          <Button
            onPress={() => {
              setOpen(!open);
            }}>
            Toggle from outside
          </Button>
        </XStack>
        <Text color="$color11" fontSize="$2">
          {last ? `Last action: ${last}` : 'No action selected yet'}
        </Text>
      </YStack>
    );
  },
};
