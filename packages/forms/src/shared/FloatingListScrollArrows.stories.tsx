import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { Select } from '../fields/Select';

const meta: Meta = {
  title: 'Forms/FloatingListScrollArrows',
  parameters: { status: { type: 'beta' } },
};

export default meta;
type Story = StoryObj;

const manyOptions = Array.from({ length: 60 }, (_, i) => ({
  value: `option-${i + 1}`,
  label: `Option ${i + 1}`,
}));

// Six entries: short enough that the floating list never scrolls (the story's
// point) while clearing the ≤5 `select-too-few-options` guardrail.
const fewOptions = Array.from({ length: 6 }, (_, i) => ({
  value: `option-${i + 1}`,
  label: `Option ${i + 1}`,
}));

/**
 * Long option list: opening the dropdown overflows the floating list, so the
 * sticky top/bottom scroll arrows (`shared/floatingList.tsx` ScrollArrow)
 * should appear when more content exists in that direction.
 */
export const LongSelect: Story = {
  render: () => (
    <YStack maxWidth={320}>
      <Select
        id="fls-long"
        label="Sixty options"
        options={manyOptions}
        defaultValue="option-30"
        helperText="Open to see scroll arrows"
      />
    </YStack>
  ),
};

/** Short list: content fits, no scroll arrows should ever be visible. */
export const ShortSelect: Story = {
  render: () => (
    <YStack maxWidth={320}>
      <Select id="fls-short" label="Six options" options={fewOptions} helperText="No arrows expected" />
    </YStack>
  ),
};
