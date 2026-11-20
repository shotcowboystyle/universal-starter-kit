/**
 * FilterManager — save-current-filters dialog. Backend-free: the caller
 * supplies the filter tuples and the save callback. Playground already
 * mounts this; the Kitchen Sink is story-driven, so this file is the
 * on-device page.
 */

import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { FilterManager } from './FilterManager';

const meta: Meta<typeof FilterManager> = {
  title: 'Table/FilterManager',
  component: FilterManager,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Save-filter dialog: name, optional global checkbox, live count of the ' +
          'current filter tuples. Disabled with a reason when nothing is applied.',
      },
    },
  },
};

export default meta;

const currentFilters: [string, string, unknown][] = [
  ['department', '=', 'Engineering'],
  ['salary', '>', 100_000],
];

export const Default = {
  name: 'Main',
  render: () => (
    <YStack
      padding="$4"
      alignItems="flex-start">
      <FilterManager
        currentFilters={currentFilters}
        onSaveFilter={(name, isGlobal) => {
          action('onSaveFilter')(name, isGlobal);
        }}
      />
    </YStack>
  ),
};

/** No filters applied: the save trigger stays focusable and explains why. */
export const DisabledEmpty = {
  render: () => (
    <YStack
      padding="$4"
      alignItems="flex-start">
      <FilterManager
        currentFilters={[]}
        onSaveFilter={(name, isGlobal) => {
          action('onSaveFilter')(name, isGlobal);
        }}
      />
    </YStack>
  ),
};

export const CanCreateGlobal = {
  render: () => (
    <YStack
      padding="$4"
      alignItems="flex-start">
      <FilterManager
        currentFilters={currentFilters}
        canCreateGlobal
        onSaveFilter={(name, isGlobal) => {
          action('onSaveFilter')(name, isGlobal);
        }}
      />
    </YStack>
  ),
};
