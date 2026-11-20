/**
 * SavedFilterDropdown — picker over persisted filter records. Uses the
 * forms Select trigger (same FloatingPanel contract as every other Select
 * in the catalog). Renders nothing when the list is empty.
 */

import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { YStack } from 'tamagui';

import type { ParsedFilter } from '../hooks/use-saved-filters';

import { SavedFilterDropdown } from './SavedFilterDropdown';

const meta: Meta<typeof SavedFilterDropdown> = {
  title: 'Table/SavedFilterDropdown',
  component: SavedFilterDropdown,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Select over saved filter records. Global filters are labeled in the option ' +
          'text. The empty list is a silent no-op so toolbars do not grow a dead trigger.',
      },
    },
  },
};

export default meta;

const savedFilters: ParsedFilter[] = [
  {
    name: 'Engineering Only',
    filter_name: 'Engineering Only',
    for_user: 'admin',
    filters: [['department', '=', 'Engineering']],
    isGlobal: false,
  },
  {
    name: 'High Salary',
    filter_name: 'High Salary',
    for_user: '',
    filters: [['salary', '>', 100_000]],
    isGlobal: true,
  },
  {
    name: 'Recent hires',
    filter_name: 'Recent hires',
    for_user: 'admin',
    filters: [['joinDate', 'after', '2024-01-01']],
    isGlobal: false,
  },
];

const DropdownHarness = ({ initial, disabled = false }: { initial?: ParsedFilter | null; disabled?: boolean }) => {
  const [selected, setSelected] = useState<ParsedFilter | null>(initial ?? null);
  return (
    <YStack
      padding="$4"
      alignItems="flex-start"
      width={280}>
      <SavedFilterDropdown
        filters={savedFilters}
        selectedFilter={selected}
        disabled={disabled}
        onSelectFilter={(next) => {
          setSelected(next);
          action('onSelectFilter')(next);
        }}
        onDeleteFilter={(name) => action('onDeleteFilter')(name)}
      />
    </YStack>
  );
};

export const Default = {
  name: 'Main',
  render: () => <DropdownHarness />,
};

export const Selected = {
  render: () => <DropdownHarness initial={savedFilters[0]} />,
};

export const Disabled = {
  render: () => (
    <DropdownHarness
      initial={savedFilters[0]}
      disabled
    />
  ),
};
