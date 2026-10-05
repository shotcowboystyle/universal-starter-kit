import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Calendar } from './Calendar';

const meta: Meta<typeof Calendar> = {
  title: 'Forms/Calendar',
  component: Calendar,
  parameters: {
    docs: {
      description: {
        component:
          'Inline calendar (forms package) with single/multiple/range selection modes, dual panels on wide screens, and month/year drill-down.',
      },
    },
  },
  argTypes: {
    mode: {
      control: 'select',
      options: ['single', 'multiple', 'range'],
      description: 'Selection mode',
    },
    showTabs: { control: 'boolean', description: 'Show mode-switcher tabs' },
    limit: { control: 'number', description: 'Max dates in multiple mode' },
  },
  args: {
    showTabs: true,
  },
};

export default meta;
type Story = StoryObj<typeof Calendar>;

export const Baseline: Story = {
  render: (args) => (
    <YStack maxWidth={720}>
      <Calendar {...args} onDatesChange={action('onDatesChange')} />
    </YStack>
  ),
};

export const SingleMode: Story = {
  args: { mode: 'single', showTabs: false },
  render: (args) => (
    <YStack maxWidth={720}>
      <Calendar {...args} onDatesChange={action('onDatesChange')} />
    </YStack>
  ),
};

export const MultipleMode: Story = {
  args: { mode: 'multiple', showTabs: false, limit: 3 },
  render: (args) => (
    <YStack maxWidth={720}>
      <Calendar {...args} onDatesChange={action('onDatesChange')} />
    </YStack>
  ),
};

export const RangeMode: Story = {
  args: { mode: 'range', showTabs: false },
  render: (args) => (
    <YStack maxWidth={720}>
      <Calendar {...args} onDatesChange={action('onDatesChange')} />
    </YStack>
  ),
};

export const MinMax: Story = {
  render: (args) => {
    const now = new Date();
    // Window spans past the initially visible month(s) in BOTH directions:
    // every day cell and both month-nav buttons render live at rest, so the
    // story doesn't sit on bare-disabled buttons. The
    // clamp is still demonstrable — navigate two months either way to hit
    // the disabled out-of-range days.
    return (
      <YStack maxWidth={720}>
        <Calendar
          {...args}
          mode="single"
          showTabs={false}
          minDate={new Date(now.getFullYear(), now.getMonth() - 2, 10)}
          maxDate={new Date(now.getFullYear(), now.getMonth() + 2, 20)}
          onDatesChange={action('onDatesChange')}
        />
      </YStack>
    );
  },
};

export const ControlledRejection: Story = {
  render: () => {
    const Example = () => {
      const [pinned] = useState(() => [new Date(2026, 7, 5), new Date(2026, 7, 12)]);
      const [attempts, setAttempts] = useState(0);
      return (
        <YStack gap="$4" maxWidth={720}>
          <Calendar
            mode="range"
            showTabs={false}
            selectedDates={pinned}
            onDatesChange={(dates) => {
              setAttempts((a) => a + 1);
              action('onDatesChange')(dates);
            }}
          />
          <Text>{`attempts:${attempts}`}</Text>
        </YStack>
      );
    };
    return <Example />;
  },
};
