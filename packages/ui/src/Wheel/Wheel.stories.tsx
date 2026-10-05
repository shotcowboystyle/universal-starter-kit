import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Wheel } from './index';

const meta: Meta<typeof Wheel> = {
  title: 'Components/Wheel',
  component: Wheel,
  parameters: {
    docs: {
      description: {
        component:
          'An iOS-style wheel picker with momentum scrolling and snap-to-center behavior. Ideal for finite lists like hours, minutes, or other cyclical values.',
      },
    },
  },
  argTypes: {
    visibleItems: { control: 'select', options: [3, 5, 7] },
    itemHeight: { control: 'number' },
    disabled: { control: 'boolean' },
    loop: { control: 'boolean' },
    highlightEdges: { control: 'select', options: ['all', 'start', 'end', 'none'] },
  },
};

export default meta;
type Story = StoryObj<typeof Wheel>;

// Generate arrays for time
const hours12 = Array.from({ length: 12 }, (_, i) => i + 1);
const hours24 = Array.from({ length: 24 }, (_, i) => i);
const minutes = Array.from({ length: 60 }, (_, i) => i);

// Format number with leading zero
const pad = (n: number) => n.toString().padStart(2, '0');

export const Main: Story = {
  name: 'Main',
  render: () => {
    const WheelExample = () => {
      const [value, setValue] = useState(5);
      return (
        <YStack gap="$4" alignItems="center">
          <Text fontSize="$5" fontWeight="400">
            Selected: {value}
          </Text>
          <Wheel items={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} value={value} onChange={setValue} />
        </YStack>
      );
    };
    return <WheelExample />;
  },
};

export const TimePicker: Story = {
  render: () => {
    const TimePickerExample = () => {
      const [hour, setHour] = useState(10);
      const [minute, setMinute] = useState(30);
      const [second, setSecond] = useState(0);

      return (
        <YStack gap="$4" alignItems="center">
          <Text fontSize="$5" fontWeight="400">
            {pad(hour)}:{pad(minute)}:{pad(second)}
          </Text>
          <XStack alignItems="center" backgroundColor="$color2" borderRadius="$4" paddingVertical="$2">
            <Wheel
              items={hours24.map((h) => ({ value: h, label: pad(h) }))}
              value={hour}
              onChange={setHour}
              visibleItems={5}
              itemHeight={36}
              width={72}
              highlightEdges="start"
            />
            <Text fontSize="$8" fontWeight="400" color="$color11" px="$1">
              :
            </Text>
            <Wheel
              items={minutes.map((m) => ({ value: m, label: pad(m) }))}
              value={minute}
              onChange={setMinute}
              visibleItems={5}
              itemHeight={36}
              width={72}
              highlightEdges="none"
            />
            <Text fontSize="$8" fontWeight="400" color="$color11" px="$1">
              :
            </Text>
            <Wheel
              items={minutes.map((s) => ({ value: s, label: pad(s) }))}
              value={second}
              onChange={setSecond}
              visibleItems={5}
              itemHeight={36}
              width={72}
              highlightEdges="end"
            />
          </XStack>
        </YStack>
      );
    };
    return <TimePickerExample />;
  },
};

export const Hour12Picker: Story = {
  render: () => {
    const Hour12Example = () => {
      const [hour, setHour] = useState(10);
      const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

      return (
        <YStack gap="$4" alignItems="center">
          <Text fontSize="$5" fontWeight="400">
            {hour}:00 {ampm}
          </Text>
          <XStack alignItems="center" backgroundColor="$color2" borderRadius="$4" paddingVertical="$2">
            <Wheel
              items={hours12}
              value={hour}
              onChange={setHour}
              visibleItems={5}
              itemHeight={40}
              width={80}
              highlightEdges="start"
            />
            <Wheel
              items={['AM', 'PM'] as const}
              value={ampm}
              onChange={setAmpm as (v: string) => void}
              visibleItems={3}
              itemHeight={40}
              width={80}
              highlightEdges="end"
            />
          </XStack>
        </YStack>
      );
    };
    return <Hour12Example />;
  },
};

export const VisibleItems3: Story = {
  args: {
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    value: 5,
    visibleItems: 3,
    itemHeight: 44,
  },
};

export const VisibleItems7: Story = {
  args: {
    items: Array.from({ length: 31 }, (_, i) => i + 1),
    value: 15,
    visibleItems: 7,
    itemHeight: 32,
  },
};

export const CustomRenderItem: Story = {
  render: () => {
    const CustomExample = () => {
      const [value, setValue] = useState('red');
      const colors = [
        { value: 'red', label: 'Red', hex: '#ef4444' },
        { value: 'orange', label: 'Orange', hex: '#f97316' },
        { value: 'yellow', label: 'Yellow', hex: '#eab308' },
        { value: 'green', label: 'Green', hex: '#22c55e' },
        { value: 'blue', label: 'Blue', hex: '#3b82f6' },
        { value: 'purple', label: 'Purple', hex: '#a855f7' },
      ];

      return (
        <YStack gap="$4" alignItems="center">
          <Text fontSize="$5" fontWeight="400">
            Selected: {value}
          </Text>
          <Wheel
            items={colors.map((c) => c.value)}
            value={value}
            onChange={setValue}
            visibleItems={5}
            itemHeight={48}
            renderItem={(item, _index, isSelected) => {
              const color = colors.find((c) => c.value === item)!;
              return (
                <XStack gap="$2" alignItems="center">
                  <YStack width={20} height={20} borderRadius="$2" backgroundColor={color.hex} />
                  <Text fontSize="$4" fontWeight="400" color={isSelected ? '$color12' : '$color11'}>
                    {color.label}
                  </Text>
                </XStack>
              );
            }}
          />
        </YStack>
      );
    };
    return <CustomExample />;
  },
};

export const Disabled: Story = {
  args: {
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    value: 5,
    disabled: true,
  },
};

export const Looping: Story = {
  args: {
    items: [1, 2, 3, 4, 5],
    value: 3,
    loop: true,
    visibleItems: 5,
    itemHeight: 40,
  },
};

export const DatePicker: Story = {
  render: () => {
    const DatePickerExample = () => {
      const [day, setDay] = useState(15);
      const [month, setMonth] = useState(6);
      const [year, setYear] = useState(2024);

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const days = Array.from({ length: 31 }, (_, i) => i + 1);
      const years = Array.from({ length: 100 }, (_, i) => 2024 - 50 + i);

      return (
        <YStack gap="$4" alignItems="center">
          <Text fontSize="$5" fontWeight="400">
            {months[month - 1]} {day}, {year}
          </Text>
          <XStack alignItems="center" backgroundColor="$color2" borderRadius="$4" paddingVertical="$2">
            <Wheel
              items={months.map((m, i) => ({ value: i + 1, label: m }))}
              value={month}
              onChange={setMonth}
              visibleItems={5}
              itemHeight={36}
              width={108}
              highlightEdges="start"
            />
            <Wheel
              items={days}
              value={day}
              onChange={setDay}
              visibleItems={5}
              itemHeight={36}
              width={64}
              highlightEdges="none"
            />
            <Wheel
              items={years}
              value={year}
              onChange={setYear}
              visibleItems={5}
              itemHeight={36}
              width={88}
              highlightEdges="end"
            />
          </XStack>
        </YStack>
      );
    };
    return <DatePickerExample />;
  },
};
