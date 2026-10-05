import { BellIcon, EnvelopeIcon, ShoppingCartIcon, UserIcon } from '@phosphor-icons/react';
// Catalog Button (story honesty): stories compose catalog controls, never raw tamagui ones.
import { Button } from '@repo/forms';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import type { ReactNode } from 'react';
import { XStack, YStack, Text } from 'tamagui';

import { Badge, type BadgeColor, type BadgePosition } from './index';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'A notification badge component that wraps any element and displays a count or dot indicator. Commonly used on icons and buttons to show notification counts.',
      },
    },
  },
  argTypes: {
    count: { control: 'number', description: 'Count to display' },
    max: { control: 'number', description: 'Maximum count before showing max+' },
    showZero: { control: 'boolean', description: 'Show badge when count is 0' },
    dot: { control: 'boolean', description: 'Show as a dot instead of count' },
    visible: { control: 'boolean', description: 'Whether the badge is visible' },
    compact: { control: 'boolean', description: 'Compact density (steps size down)' },
    color: { control: 'select', options: ['red', 'blue', 'green', 'orange', 'gray'] },
    position: {
      control: 'select',
      options: ['top-right', 'top-left', 'bottom-right', 'bottom-left'],
    },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

const IconButton = ({ children }: { children: ReactNode }) => (
  <Button circular aria-label="Notifications">
    {children}
  </Button>
);

export const Default: Story = {
  name: 'Main',
  args: { count: 5 },
  render: (args) => (
    <Badge {...args}>
      <IconButton>
        <BellIcon size={24} />
      </IconButton>
    </Badge>
  ),
};

export const DotWithCount: Story = {
  args: { dot: true, count: 7 },
  render: (args) => (
    <Badge {...args}>
      <IconButton>
        <BellIcon size={24} />
      </IconButton>
    </Badge>
  ),
};

export const NoCountNoDot: Story = {
  args: {},
  render: (args) => (
    <Badge {...args}>
      <IconButton>
        <BellIcon size={24} />
      </IconButton>
    </Badge>
  ),
};

export const WithCount: Story = {
  render: () => (
    <XStack gap="$4">
      <Badge count={1}>
        <IconButton>
          <EnvelopeIcon size={24} />
        </IconButton>
      </Badge>
      <Badge count={12}>
        <IconButton>
          <BellIcon size={24} />
        </IconButton>
      </Badge>
      <Badge count={99}>
        <IconButton>
          <ShoppingCartIcon size={24} />
        </IconButton>
      </Badge>
      <Badge count={150}>
        <IconButton>
          <UserIcon size={24} />
        </IconButton>
      </Badge>
    </XStack>
  ),
};

export const MaxCount: Story = {
  render: () => (
    <XStack gap="$4">
      <Badge count={100} max={99}>
        <IconButton>
          <BellIcon size={24} />
        </IconButton>
      </Badge>
      <Badge count={1000} max={999}>
        <IconButton>
          <EnvelopeIcon size={24} />
        </IconButton>
      </Badge>
    </XStack>
  ),
};

export const Standalone: Story = {
  name: 'Standalone (CounterLabel)',
  render: () => (
    <XStack gap="$3" alignItems="center">
      <Badge count={3} />
      <Badge count={12} color="blue" />
      <Badge count={150} max={99} color="orange" />
      <Badge dot color="green" />
      <Badge count={0} showZero color="gray" />
    </XStack>
  ),
};

export const DotVariant: Story = {
  render: () => (
    <XStack gap="$4">
      <Badge dot>
        <IconButton>
          <BellIcon size={24} />
        </IconButton>
      </Badge>
      <Badge dot color="blue">
        <IconButton>
          <EnvelopeIcon size={24} />
        </IconButton>
      </Badge>
      <Badge dot color="green">
        <IconButton>
          <UserIcon size={24} />
        </IconButton>
      </Badge>
    </XStack>
  ),
};

export const Colors: Story = {
  render: () => {
    const colors: BadgeColor[] = ['red', 'blue', 'green', 'orange', 'gray'];
    return (
      <YStack gap="$4">
        <YStack gap="$2">
          <Text fontWeight="700">Count badges</Text>
          <XStack gap="$4">
            {colors.map((color) => (
              <Badge key={color} count={5} color={color}>
                <IconButton>
                  <BellIcon size={24} />
                </IconButton>
              </Badge>
            ))}
          </XStack>
        </YStack>
        <YStack gap="$2">
          <Text fontWeight="700">Dot badges</Text>
          <XStack gap="$4">
            {colors.map((color) => (
              <Badge key={color} dot color={color}>
                <IconButton>
                  <BellIcon size={24} />
                </IconButton>
              </Badge>
            ))}
          </XStack>
        </YStack>
      </YStack>
    );
  },
};

export const Positions: Story = {
  render: () => {
    const positions: BadgePosition[] = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
    return (
      <XStack gap="$6">
        {positions.map((position) => (
          <YStack key={position} alignItems="center" gap="$2">
            <Badge count={5} position={position}>
              <IconButton>
                <BellIcon size={24} />
              </IconButton>
            </Badge>
            <Text fontSize="$1" color="$color10">
              {position}
            </Text>
          </YStack>
        ))}
      </XStack>
    );
  },
};

export const WithOffset: Story = {
  render: () => (
    <XStack gap="$6">
      <YStack alignItems="center" gap="$2">
        <Badge count={5} offset={[0, 0]}>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          No offset
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$2">
        <Badge count={5} offset={[4, 4]}>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          Offset [4, 4]
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$2">
        <Badge count={5} offset={[-4, -4]}>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          Offset [-4, -4]
        </Text>
      </YStack>
    </XStack>
  ),
};

export const ShowZero: Story = {
  render: () => (
    <XStack gap="$4">
      <YStack alignItems="center" gap="$2">
        <Badge count={0}>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          count=0 (hidden)
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$2">
        <Badge count={0} showZero>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          count=0, showZero
        </Text>
      </YStack>
    </XStack>
  ),
};

export const Visibility: Story = {
  render: () => (
    <XStack gap="$4">
      <YStack alignItems="center" gap="$2">
        <Badge count={5} visible>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          visible=true
        </Text>
      </YStack>
      <YStack alignItems="center" gap="$2">
        <Badge count={5} visible={false}>
          <IconButton>
            <BellIcon size={24} />
          </IconButton>
        </Badge>
        <Text fontSize="$1" color="$color10">
          visible=false
        </Text>
      </YStack>
    </XStack>
  ),
};

export const OnButtons: Story = {
  render: () => (
    <XStack gap="$4">
      <Badge count={3}>
        <Button>Messages</Button>
      </Badge>
      <Badge dot color="green">
        <Button>Status</Button>
      </Badge>
    </XStack>
  ),
};

export const AllStates: Story = {
  render: () => (
    <YStack gap="$6" padding="$3">
      <YStack gap="$2">
        <Text fontWeight="700">Counts</Text>
        <XStack gap="$4">
          <Badge count={1}>
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge count={10}>
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge count={99}>
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge count={100}>
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="700">Dots</Text>
        <XStack gap="$4">
          <Badge dot color="red">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge dot color="blue">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge dot color="green">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="700">Positions</Text>
        <XStack gap="$4">
          <Badge count={1} position="top-right">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge count={1} position="top-left">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge count={1} position="bottom-right">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
          <Badge count={1} position="bottom-left">
            <IconButton>
              <BellIcon size={24} />
            </IconButton>
          </Badge>
        </XStack>
      </YStack>
    </YStack>
  ),
};
