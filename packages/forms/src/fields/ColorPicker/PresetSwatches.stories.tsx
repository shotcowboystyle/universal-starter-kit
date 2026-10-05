/**
 * PresetSwatches — the color-preset row ColorPicker embeds. Exported from
 * the forms barrel, previously invisible in Kitchen Sink because it had no
 * story of its own.
 */

import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { PresetSwatches } from './parts';

const BRAND = ['#1E40AF', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'];

const meta: Meta<typeof PresetSwatches> = {
  title: 'Forms/PresetSwatches',
  component: PresetSwatches,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component: "Radiogroup of preset color swatches. Named entries, hex strings, and a null 'no color' chip.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PresetSwatches>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const Example = () => {
      const [selected, setSelected] = useState<string | null>(BRAND[3]);
      return (
        <YStack gap="$3" padding="$4" width={280}>
          <PresetSwatches
            presetColors={BRAND}
            selectedColor={selected}
            onSelect={(next) => {
              setSelected(next);
              action('onSelect')(next);
            }}
          />
          <Text fontSize="$2" color="$color10">
            {selected ?? 'none'}
          </Text>
        </YStack>
      );
    };
    return <Example />;
  },
};

export const Selected: Story = {
  render: () => (
    <YStack padding="$4" width={280}>
      <PresetSwatches presetColors={BRAND} selectedColor="#3B82F6" onSelect={action('onSelect')} />
    </YStack>
  ),
};

/** Null entry is the "no color" chip with the diagonal strike. */
export const NoColor: Story = {
  render: () => {
    const Example = () => {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <YStack gap="$3" padding="$4" width={280}>
          <PresetSwatches
            presetColors={[{ name: 'None', value: null }, ...BRAND]}
            selectedColor={selected}
            onSelect={setSelected}
          />
        </YStack>
      );
    };
    return <Example />;
  },
};

/** Empty list paints nothing; the host owns the empty marker. */
export const Empty: Story = {
  render: () => (
    <YStack padding="$4">
      <Text fontSize="$2" color="$color10">
        empty presetColors — row is null
      </Text>
      <PresetSwatches presetColors={[]} selectedColor={null} onSelect={action('onSelect')} />
    </YStack>
  ),
};
