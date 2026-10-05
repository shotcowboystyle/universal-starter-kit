import { action } from '@repo/storybook';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '../../Button';
import { Form } from '../../Form';
import type { DateRange } from '../DatePicker/DateRangePicker';

import { TimeRangeScrubber } from './index';

const NOW = new Date('2026-08-28T14:30:00.000Z');
const WINDOW = {
  start: new Date('2026-08-28T14:00:00.000Z'),
  end: new Date('2026-08-28T14:30:00.000Z'),
};
const FRAMES = [
  new Date('2026-08-28T14:02:00.000Z'),
  new Date('2026-08-28T14:08:00.000Z'),
  new Date('2026-08-28T14:14:00.000Z'),
  new Date('2026-08-28T14:22:31.000Z'),
  new Date('2026-08-28T14:27:00.000Z'),
];
const KEYS = [
  new Date('2026-08-28T14:22:26.000Z'),
  new Date('2026-08-28T14:22:30.000Z'),
  new Date('2026-08-28T14:22:33.000Z'),
];

const meta: Meta<typeof TimeRangeScrubber> = {
  title: 'Forms/TimeRangeScrubber',
  component: TimeRangeScrubber,
  parameters: {
    docs: {
      description: {
        component:
          "A direct-manipulation time rail. The brush is DateRangePicker's `{ start, end }` value; the playhead emits a Date beside it.",
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    disabled: { control: 'boolean' },
    snapTo: { control: 'select', options: ['none', 'frames', 'grid'] },
  },
};

export default meta;
type Story = StoryObj<typeof TimeRangeScrubber>;

export const Main: Story = {
  name: 'Main',
  render: () => {
    const Example = () => {
      const form = useForm({
        defaultValues: {
          window: {
            start: new Date('2026-08-28T14:17:30.000Z'),
            end: new Date('2026-08-28T14:27:30.000Z'),
          } as DateRange,
        },
        onSubmit: async ({ value }) => {
          action('onSubmit')(value);
        },
      });
      return (
        <Form form={form} maxWidth={720}>
          <YStack gap="$4">
            <TimeRangeScrubber
              label="Session review window"
              name="window"
              now={NOW}
              window={WINDOW}
              frames={FRAMES}
              keys={KEYS}
              activity={[
                { start: WINDOW.start, end: new Date('2026-08-28T14:09:00.000Z'), label: 'editor' },
                { start: new Date('2026-08-28T14:17:20.000Z'), end: WINDOW.end, label: 'review' },
              ]}
              helperText="Brush is the value. The playhead is time, not a frame index."
            />
            <Button action="submit">Save range</Button>
          </YStack>
        </Form>
      );
    };
    return <Example />;
  },
};

export const Dark: Story = {
  name: 'Dark',
  render: () => (
    <Preset theme="dark">
      <YStack backgroundColor="$background" padding="$4">
        <TimeRangeScrubber
          label="Session review window"
          now={NOW}
          window={WINDOW}
          frames={FRAMES}
          keys={KEYS}
          value={{
            start: new Date('2026-08-28T14:17:30.000Z'),
            end: new Date('2026-08-28T14:27:30.000Z'),
          }}
        />
      </YStack>
    </Preset>
  ),
};

export const RadiusNone: Story = {
  name: 'Radius none',
  render: () => (
    <Preset overrides={{ borderRadius: 'none' }}>
      <TimeRangeScrubber
        label="Square world"
        now={NOW}
        window={WINDOW}
        frames={FRAMES}
        value={{
          start: new Date('2026-08-28T14:10:00.000Z'),
          end: new Date('2026-08-28T14:20:00.000Z'),
        }}
      />
    </Preset>
  ),
};

export const OverflowMenu: Story = {
  name: 'Overflow menu',
  render: () => {
    const [value, setValue] = useState<DateRange | null>(null);
    return (
      <YStack gap="$3" maxWidth={420}>
        <TimeRangeScrubber
          label="Narrow chip row"
          now={NOW}
          window={WINDOW}
          value={value}
          onChange={setValue}
          maxVisibleQuickRanges={2}
        />
        <Text fontFamily="$mono" fontSize={12}>
          {value?.start?.toISOString() ?? '—'} → {value?.end?.toISOString() ?? '—'}
        </Text>
      </YStack>
    );
  },
};
