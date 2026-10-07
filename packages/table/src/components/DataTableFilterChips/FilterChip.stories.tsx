/**
 * FilterChip — one active filter as a pill, standalone.
 *
 * DataTableFilterChips stories show the bar; this file shows the unit the bar
 * is made of, with no table around it. Two focusables, two rings (LC-71):
 * pressing the pill reopens the editor and rings the pill, pressing the X
 * removes the filter and rings the glyph, never the 44px hit box. A chip with
 * no `onPress` is display-only — no button role, no pill ring, dismiss still
 * works.
 */

import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, XStack, YStack } from 'tamagui';

import { FilterChip } from './FilterChip';

const meta: Meta<typeof FilterChip> = {
  title: 'Table/FilterChip',
  component: FilterChip,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'One active filter as a removable pill. Gray fill, label, dismiss glyph. ' +
          'Editable chips take a button role and a focus ring; display-only chips take neither.',
      },
    },
  },
};

export default meta;

/** Editable: the pill is a button (edit) and the X is a second button (remove). */
export const Default = {
  name: 'Main',
  render: () => (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <FilterChip
        label="Email contains corp"
        onPress={action('press')}
        onRemove={action('remove')}
      />
    </YStack>
  ),
};

/** Without `onPress` the chip is display-only: no button role on the pill. */
export const DisplayOnly = {
  render: () => (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <FilterChip
        label="Department is Engineering"
        onRemove={action('remove')}
      />
    </YStack>
  ),
};

/** A row of siblings, as the chips bar renders them. Long labels do not truncate. */
export const Row = {
  render: () => (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <XStack
        gap="$2"
        flexWrap="wrap">
        <FilterChip
          label="Email contains corp"
          onPress={action('press')}
          onRemove={action('remove')}
        />
        <FilterChip
          label="Department is Engineering"
          onPress={action('press')}
          onRemove={action('remove')}
        />
        <FilterChip
          label="Age is greater than 30"
          onPress={action('press')}
          onRemove={action('remove')}
        />
      </XStack>
    </YStack>
  ),
};

function RemovableRow() {
  const [labels, setLabels] = useState(['Email contains corp', 'Department is Engineering', 'Age is greater than 30']);
  return (
    <YStack
      padding="$4"
      gap="$3"
      alignItems="flex-start">
      <XStack
        gap="$2"
        flexWrap="wrap">
        {labels.map((label) => (
          <FilterChip
            key={label}
            label={label}
            onPress={action('press')}
            onRemove={() => {
              setLabels((current) => current.filter((item) => item !== label));
            }}
          />
        ))}
      </XStack>
      <Paragraph
        size="$2"
        testID="chip-count">
        {`${labels.length} active`}
      </Paragraph>
    </YStack>
  );
}

/** Dismiss actually removes: press an X and the count drops. */
export const Removable = {
  render: () => <RemovableRow />,
};
