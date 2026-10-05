import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { YStack, Text } from 'tamagui';

import { ViewSwitcher, type ViewOption } from './ViewSwitcher';

const views: ViewOption[] = [
  { type: 'list', label: 'List' },
  { type: 'grid', label: 'Grid' },
  { type: 'kanban', label: 'Kanban' },
];

function ListIcon({ size = 16 }: { size?: number }) {
  return (
    <Text fontSize={size} lineHeight={size} aria-hidden>
      ≡
    </Text>
  );
}

function GridIcon({ size = 16 }: { size?: number }) {
  return (
    <Text fontSize={size} lineHeight={size} aria-hidden>
      ▦
    </Text>
  );
}

function KanbanIcon({ size = 16 }: { size?: number }) {
  return (
    <Text fontSize={size} lineHeight={size} aria-hidden>
      ▯
    </Text>
  );
}

const viewsWithIcons: ViewOption[] = [
  { type: 'list', label: 'List', icon: ListIcon },
  { type: 'grid', label: 'Grid', icon: GridIcon },
  { type: 'kanban', label: 'Kanban', icon: KanbanIcon },
];

const viewsIconsOnly: ViewOption[] = [
  { type: 'list', label: 'List', icon: ListIcon, iconOnly: true },
  { type: 'grid', label: 'Grid', icon: GridIcon, iconOnly: true },
  { type: 'kanban', label: 'Kanban', icon: KanbanIcon, iconOnly: true },
];

function ViewSwitcherExample({ options = views }: { options?: ViewOption[] }) {
  const [current, setCurrent] = useState(options[0]?.type ?? 'list');
  return (
    <YStack gap="$4" padding="$4" alignItems="flex-start">
      <ViewSwitcher views={options} currentView={current} onViewChange={setCurrent} />
      <Text>Current view: {current}</Text>
    </YStack>
  );
}

const meta: Meta<typeof ViewSwitcher> = {
  title: 'Components/ViewSwitcher',
  component: ViewSwitcher,
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;
type Story = StoryObj<typeof ViewSwitcher>;

export const Default: Story = {
  name: 'Main',
  render: () => <ViewSwitcherExample />,
};

export const WithIcons: Story = {
  name: 'With icons',
  render: () => <ViewSwitcherExample options={viewsWithIcons} />,
};

export const IconsOnly: Story = {
  name: 'Icons only',
  render: () => <ViewSwitcherExample options={viewsIconsOnly} />,
};
