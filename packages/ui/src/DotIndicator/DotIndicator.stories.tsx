import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { XStack, YStack, Text } from 'tamagui';

import { DotIndicator, type DotVariant } from './index';

const meta: Meta<typeof DotIndicator> = {
  title: 'Components/DotIndicator',
  component: DotIndicator,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A dot-based indicator for showing position in a sequence. Used by Carousel and Pagination components. Supports multiple visual variants.',
      },
    },
  },
  argTypes: {
    total: { control: 'number', description: 'Total number of dots' },
    activeIndex: { control: 'number', description: 'Current active index (0-based)' },
    variant: { control: 'select', options: ['dots', 'bars', 'pills'] },
    gap: { control: 'number', description: 'Gap between dots' },
    disabled: { control: 'boolean', description: 'Disable interaction' },
  },
};
export default meta;

type Story = StoryObj<typeof DotIndicator>;

function ControlledDotIndicator(props: Omit<React.ComponentProps<typeof DotIndicator>, 'activeIndex'>) {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <DotIndicator
      {...props}
      activeIndex={activeIndex}
      onChange={(index) => {
        setActiveIndex(index);
        props.onChange?.(index);
      }}
    />
  );
}

function WindowedDotIndicator() {
  const [activeIndex, setActiveIndex] = useState(4);
  return (
    <DotIndicator
      total={10}
      activeIndex={activeIndex}
      onChange={(index) => {
        setActiveIndex(index);
        action('onChange')(index);
      }}
    />
  );
}

export const Default: Story = {
  name: 'Main',
  render: () => <ControlledDotIndicator total={5} onChange={action('onChange')} />,
};

export const Playground: Story = {
  args: { total: 5, activeIndex: 0 },
  render: (args) => <DotIndicator onChange={action('onChange')} {...args} />,
};

export const Variants: Story = {
  render: () => {
    const variants: DotVariant[] = ['dots', 'bars', 'pills'];
    return (
      <YStack gap="$4">
        {variants.map((variant) => (
          <XStack key={variant} gap="$4" alignItems="center">
            <Text width={60} fontSize="$2" color="$color10">
              {variant}
            </Text>
            <ControlledDotIndicator total={5} variant={variant} onChange={action('onChange')} />
          </XStack>
        ))}
      </YStack>
    );
  },
};

export const DifferentCounts: Story = {
  render: () => (
    <YStack gap="$4">
      <XStack gap="$4" alignItems="center">
        <Text width={80} fontSize="$2" color="$color10">
          3 items
        </Text>
        <ControlledDotIndicator total={3} onChange={action('onChange')} />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Text width={80} fontSize="$2" color="$color10">
          5 items
        </Text>
        <ControlledDotIndicator total={5} onChange={action('onChange')} />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Text width={80} fontSize="$2" color="$color10">
          10 items
        </Text>
        <ControlledDotIndicator total={10} onChange={action('onChange')} />
      </XStack>
    </YStack>
  ),
};

export const CustomGap: Story = {
  render: () => (
    <YStack gap="$4">
      <XStack gap="$4" alignItems="center">
        <Text width={80} fontSize="$2" color="$color10">
          gap="$1"
        </Text>
        <ControlledDotIndicator total={5} gap="$1" onChange={action('onChange')} />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Text width={80} fontSize="$2" color="$color10">
          gap="$2"
        </Text>
        <ControlledDotIndicator total={5} gap="$2" onChange={action('onChange')} />
      </XStack>
      <XStack gap="$4" alignItems="center">
        <Text width={80} fontSize="$2" color="$color10">
          gap="$4"
        </Text>
        <ControlledDotIndicator total={5} gap="$4" onChange={action('onChange')} />
      </XStack>
    </YStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <YStack gap="$4">
      <YStack gap="$2">
        <Text fontWeight="600">Interactive</Text>
        <ControlledDotIndicator total={5} onChange={action('onChange')} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Disabled</Text>
        <ControlledDotIndicator total={5} disabled onChange={action('onChange')} />
      </YStack>
    </YStack>
  ),
};

export const ReadOnly: Story = {
  render: () => {
    const [index, setIndex] = useState(2);
    return (
      <YStack gap="$4" alignItems="center">
        <DotIndicator total={5} activeIndex={index} />
        <Text fontSize="$2" color="$color10">
          Item {index + 1} of 5 (no onChange - read only)
        </Text>
        <XStack gap="$2">
          <Text
            fontSize="$2"
            color="$blue10"
            cursor="pointer"
            onPress={() => {
              setIndex((i) => Math.max(0, i - 1));
            }}>
            Prev
          </Text>
          <Text
            fontSize="$2"
            color="$blue10"
            cursor="pointer"
            onPress={() => {
              setIndex((i) => Math.min(4, i + 1));
            }}>
            Next
          </Text>
        </XStack>
      </YStack>
    );
  },
};

export const AllStates: Story = {
  render: () => (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text fontWeight="600">Dots variant (default)</Text>
        <ControlledDotIndicator total={5} variant="dots" onChange={action('onChange')} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Bars variant</Text>
        <ControlledDotIndicator total={5} variant="bars" onChange={action('onChange')} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Pills variant</Text>
        <ControlledDotIndicator total={5} variant="pills" onChange={action('onChange')} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Disabled</Text>
        <ControlledDotIndicator total={5} disabled onChange={action('onChange')} />
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="600">Many items</Text>
        <WindowedDotIndicator />
      </YStack>
    </YStack>
  ),
};
