import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Paragraph, XStack, YStack } from 'tamagui';

import { Wheel } from './index';

const numbers = Array.from({ length: 24 }, (_, i) => i);
const pad2 = (n: number) => String(n).padStart(2, '0');
const hours = numbers.map((h) => ({ value: h, label: pad2(h) }));
const minutes = Array.from({ length: 60 }, (_, m) => ({ value: m, label: pad2(m) }));
const periods = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];
const currencyNames = { usd: 'US Dollar', eur: 'Euro', inr: 'Rupee', jpy: 'Yen' } as const;

const meta: Meta<typeof Wheel> = {
  title: 'Forms/Wheel',
  component: Wheel,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'iOS UIPickerView / Flutter CupertinoPicker cylinder. Drag, flick or arrow-key to bring an item through the centre band. TimePicker and DatePicker paint columns of these; `highlightEdges` joins adjacent columns into one selection band.',
      },
    },
  },
  argTypes: {
    visibleItems: { control: 'select', options: [3, 5, 7] },
    loop: { control: 'boolean' },
    disabled: { control: 'boolean' },
    width: { control: 'number' },
    itemHeight: { control: 'number' },
    highlightEdges: { control: 'select', options: ['all', 'start', 'end', 'none'] },
    size: { control: 'select', options: ['$6', '$8', '$9'] },
  },
  args: {
    items: hours,
    value: 9,
    visibleItems: 5,
    loop: false,
    disabled: false,
    highlightEdges: 'all',
  },
};

export default meta;
type Story = StoryObj<typeof Wheel>;

export const Basic: Story = {
  render: (args) => {
    const Example = () => {
      const [value, setValue] = useState<number>((args.value as number) ?? 9);
      return (
        <YStack gap="$3" alignItems="flex-start">
          <Wheel
            {...args}
            value={value}
            onChange={(next) => {
              setValue(next as number);
              action('onChange')(next);
            }}
            aria-label="Hour"
          />
          <Paragraph size="$3">selected: {pad2(value)}</Paragraph>
        </YStack>
      );
    };
    return <Example />;
  },
};

/** Plain values (no `{ value, label }` wrapper) render their own `String(item)`. */
export const PlainValues: Story = {
  render: () => (
    <Wheel
      items={['Small', 'Medium', 'Large', 'Extra large']}
      value="Medium"
      width={140}
      onChange={action('onChange')}
      aria-label="Size"
    />
  ),
};

/**
 * `visibleItems` is the cylinder depth. 3 is a compact inline row, 7 the full
 * iOS sheet; the value must stay odd so an item sits dead centre.
 */
export const VisibleItems: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start">
      {([3, 5, 7] as const).map((count) => (
        <YStack key={count} gap="$2" alignItems="center">
          <Paragraph size="$2">visibleItems={count}</Paragraph>
          <Wheel items={hours} value={9} visibleItems={count} aria-label={`Hour ${count}`} />
        </YStack>
      ))}
    </XStack>
  ),
};

/**
 * `loop` wraps at the ends instead of rubber-banding. Hours and minutes loop;
 * a bounded set like AM/PM must not, or the user can scroll past the last row
 * into a value that was never offered.
 */
export const LoopingAndBounded: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start">
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">loop</Paragraph>
        <Wheel items={minutes} value={30} loop onChange={action('onChange')} aria-label="Minute" />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">bounded</Paragraph>
        <Wheel items={periods} value="AM" loop={false} width={72} onChange={action('onChange')} aria-label="AM/PM" />
      </YStack>
    </XStack>
  ),
};

/**
 * Multi-column joining: the row of columns reads as ONE selection band because
 * the first declares `start`, the last `end`, and everything between `none`.
 * This is the arrangement TimePicker ships.
 */
export const JoinedColumns: Story = {
  render: () => (
    <XStack width={320}>
      <Wheel items={hours} value={9} loop flex={1} highlightEdges="start" aria-label="Hour" />
      <Wheel items={minutes} value={30} loop flex={1} highlightEdges="none" aria-label="Minute" />
      <Wheel items={periods} value="AM" flex={1} highlightEdges="end" aria-label="AM/PM" />
    </XStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start">
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">enabled</Paragraph>
        <Wheel items={hours} value={9} aria-label="Hour enabled" />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">disabled</Paragraph>
        <Wheel items={hours} value={9} disabled aria-label="Hour disabled" />
      </YStack>
    </XStack>
  ),
};

/**
 * `renderItem` owns the row; the wheel keeps geometry and selection. It is
 * handed the VALUE, not the `{ value, label }` wrapper — so a story that wants
 * a display string looks it up itself.
 */
export const CustomRenderItem: Story = {
  render: () => (
    <Wheel
      items={Object.keys(currencyNames)}
      value="inr"
      width={200}
      onChange={action('onChange')}
      aria-label="Currency"
      renderItem={(item, _index, isSelected) => (
        <Paragraph size="$5" fontWeight={isSelected ? '700' : '400'}>
          {currencyNames[item as keyof typeof currencyNames]}
        </Paragraph>
      )}
    />
  ),
};

/** Edge cases the geometry has to survive: empty, single item, very long labels. */
export const EdgeCases: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start" flexWrap="wrap">
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">empty</Paragraph>
        <Wheel items={[]} aria-label="Empty" />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">single item</Paragraph>
        <Wheel items={[{ value: 'only', label: 'Only' }]} value="only" aria-label="Single" />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">long labels</Paragraph>
        <Wheel
          items={[
            { value: 'a', label: 'Asia/Kolkata' },
            { value: 'b', label: 'America/Argentina/Buenos_Aires' },
            { value: 'c', label: 'Europe/Isle_of_Man' },
          ]}
          value="b"
          width={200}
          aria-label="Timezone"
        />
      </YStack>
    </XStack>
  ),
};

/**
 * MOTION-RIDES-KNOB: at `animation: "none"` a keyboard snap must JUMP,
 * not tween. Arrow-key both wheels and watch the difference.
 */
export const MotionOff: Story = {
  render: () => (
    <XStack gap="$6" alignItems="flex-start">
      <YStack gap="$2" alignItems="center">
        <Paragraph size="$2">animation: medium</Paragraph>
        <Wheel items={hours} value={9} loop aria-label="Hour animated" />
      </YStack>
      <Preset overrides={{ animation: 'none' }}>
        <YStack gap="$2" alignItems="center">
          <Paragraph size="$2">animation: none</Paragraph>
          <Wheel items={hours} value={9} loop aria-label="Hour static" />
        </YStack>
      </Preset>
    </XStack>
  ),
};
