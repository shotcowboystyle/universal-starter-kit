import { CheckIcon, LightningIcon, TagIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Chip, type ChipColor, type ChipSize, type ChipVariantProp } from './index';

const meta: Meta<typeof Chip> = {
  title: 'Forms/Chip',
  component: Chip,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Forms chip (`data-mp-chip`): solid / subtle / outline (filled / outlined / ghost aliases), semantic color, selected fill, leading icon, dismiss, optional stacked-group corners. Distinct from Components/Chip.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  name: 'Main',
  render: () => <Chip>Default Chip</Chip>,
};

export const Variants: Story = {
  render: () => {
    const variants: ChipVariantProp[] = ['subtle', 'solid', 'outline'];
    return (
      <YStack gap="$3">
        {variants.map((variant) => (
          <XStack key={variant} gap="$2" alignItems="center">
            <Text width={80} fontSize="$2" color="$color10">
              {variant}
            </Text>
            <Chip variant={variant}>Chip</Chip>
            <Chip variant={variant} color="blue">
              Blue
            </Chip>
          </XStack>
        ))}
      </YStack>
    );
  },
};

export const Colors: Story = {
  render: () => {
    const colors: ChipColor[] = ['gray', 'red', 'green', 'blue', 'yellow', 'orange', 'purple'];
    return (
      <YStack gap="$4">
        {(['subtle', 'outline', 'solid'] as ChipVariantProp[]).map((variant) => (
          <YStack key={variant} gap="$2">
            <Text fontWeight="400" fontSize="$2">
              {variant}
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {colors.map((color) => (
                <Chip key={color} variant={variant} color={color}>
                  {color}
                </Chip>
              ))}
            </XStack>
          </YStack>
        ))}
      </YStack>
    );
  },
};

export const Sizes: Story = {
  render: () => {
    const sizes: ChipSize[] = ['$2', '$3', '$4', '$5'];
    return (
      <XStack gap="$2" alignItems="center">
        {sizes.map((size) => (
          <Chip key={size} size={size}>
            Size {size}
          </Chip>
        ))}
      </XStack>
    );
  },
};

export const Selected: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap" alignItems="center">
      <Chip variant="outline" selected={false} onPress={() => action('press')('idle')}>
        Idle
      </Chip>
      <Chip variant="outline" selected onPress={() => action('press')('on')}>
        Selected
      </Chip>
      <Chip variant="outline" selected onPress={() => action('press')('blue')} color="blue">
        Blue selected
      </Chip>
    </XStack>
  ),
};

export const Filter: Story = {
  render: function FilterDemo() {
    const [on, setOn] = useState<Record<string, boolean>>({
      Fire: true,
      Water: false,
      Grass: true,
      Electric: false,
    });
    return (
      <XStack gap="$2" flexWrap="wrap">
        {Object.keys(on).map((label) => (
          <Chip
            key={label}
            variant="outline"
            selected={on[label]}
            onPress={() => {
              setOn((s) => ({ ...s, [label]: !s[label] }));
            }}>
            {label}
          </Chip>
        ))}
      </XStack>
    );
  },
};

export const WithIcon: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap" alignItems="center">
      <Chip icon=<TagIcon />>Tagged</Chip>
      <Chip icon=<LightningIcon /> color="yellow" variant="solid">
        Electric
      </Chip>
      <Chip icon=<CheckIcon /> color="green" selected onPress={() => {}}>
        Ready
      </Chip>
      <Chip icon=<TagIcon /> onDismiss={() => action('onDismiss')('Tagged')} color="purple">
        Removable
      </Chip>
    </XStack>
  ),
};

export const Dismissible: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap">
      <Chip onDismiss={() => action('onDismiss')('React')}>React</Chip>
      <Chip onDismiss={() => action('onDismiss')('TypeScript')} color="blue">
        TypeScript
      </Chip>
      <Chip onDismiss={() => action('onDismiss')('Tamagui')} color="purple">
        Tamagui
      </Chip>
    </XStack>
  ),
};

export const DismissibleSizes: Story = {
  render: () => (
    <XStack gap="$2" flexWrap="wrap" alignItems="center">
      <Chip size="$2" onDismiss={() => action('onDismiss')('$2')}>
        Size $2
      </Chip>
      <Chip size="$3" onDismiss={() => action('onDismiss')('$3')} color="blue">
        Size $3
      </Chip>
      <Chip size="$4" onDismiss={() => action('onDismiss')('$4')} color="green">
        Size $4
      </Chip>
      <Chip size="$5" onDismiss={() => action('onDismiss')('$5')} color="purple">
        Size $5
      </Chip>
    </XStack>
  ),
};

export const Disabled: Story = {
  render: () => (
    <XStack gap="$2">
      <Chip disabled>Disabled</Chip>
      <Chip disabled onDismiss={() => {}}>
        Disabled Dismissible
      </Chip>
      <Chip disabled selected onPress={() => {}}>
        Disabled selected
      </Chip>
    </XStack>
  ),
};

/** stacked-group corners — forms Chip only; Components/Chip has no groupPosition. */
export const Grouped: Story = {
  render: () => (
    <XStack>
      <Chip groupPosition="first" variant="outline">
        First
      </Chip>
      <Chip groupPosition="middle" variant="outline">
        Middle
      </Chip>
      <Chip groupPosition="last" variant="outline">
        Last
      </Chip>
    </XStack>
  ),
};

export const AllStates: Story = {
  render: () => (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text fontWeight="400">Variants</Text>
        <XStack gap="$2" flexWrap="wrap">
          <Chip variant="solid">Solid</Chip>
          <Chip variant="subtle">Subtle</Chip>
          <Chip variant="outline">Outline</Chip>
        </XStack>
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="400">Aliases</Text>
        <XStack gap="$2" flexWrap="wrap">
          <Chip variant="filled">Filled</Chip>
          <Chip variant="ghost">Ghost</Chip>
          <Chip variant="outlined">Outlined</Chip>
        </XStack>
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="400">Dismissible</Text>
        <XStack gap="$2">
          <Chip onDismiss={() => action('dismiss')()}>Dismissible</Chip>
          <Chip onDismiss={() => action('dismiss')()} color="blue">
            Blue Dismissible
          </Chip>
        </XStack>
      </YStack>
      <YStack gap="$2">
        <Text fontWeight="400">Disabled</Text>
        <XStack gap="$2">
          <Chip disabled>Disabled</Chip>
          <Chip disabled onDismiss={() => {}}>
            Disabled with dismiss
          </Chip>
        </XStack>
      </YStack>
    </YStack>
  ),
};
