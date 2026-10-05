import { CheckIcon, LightningIcon, TagIcon } from '@phosphor-icons/react';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Chip, type ChipColor, type ChipSize, type ChipVariant } from './index';

const meta: Meta<typeof Chip> = {
  title: 'Components/Chip',
  component: Chip,
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Catalog chip: filled / outlined / ghost (solid / outline / subtle aliases), semantic color, selected fill, leading icon, dismiss. Keyboard ring on the pill; dismiss ring on the glyph.',
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
    const variants: ChipVariant[] = ['filled', 'ghost', 'outlined'];
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
        {(['ghost', 'outlined', 'filled'] as ChipVariant[]).map((variant) => (
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
      <Chip variant="outlined" selected={false} onPress={() => action('press')('idle')}>
        Idle
      </Chip>
      <Chip variant="outlined" selected onPress={() => action('press')('on')}>
        Selected
      </Chip>
      <Chip variant="outlined" selected onPress={() => action('press')('blue')} color="blue">
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
            variant="outlined"
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
      <Chip icon=<LightningIcon /> color="yellow" variant="filled">
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

/**
 * Long labels beside the dismiss affordance: on hover the dismiss ring
 * paints at glyph scale INSIDE its reserved slot, so it never covers the
 * label's trailing glyphs (the pre-fix 44px press-target paint did). The
 * press target still measures the full 44px floor — it just stays
 * transparent.
 */
export const LongLabelDismiss: Story = {
  render: () => (
    <YStack gap="$3" maxWidth={480}>
      <XStack gap="$2" flexWrap="wrap">
        <Chip onDismiss={() => action('onDismiss')('characterization')}>Characterization requirements</Chip>
        <Chip onDismiss={() => action('onDismiss')('Tamagui')} color="purple">
          Tamagui
        </Chip>
      </XStack>
      <XStack gap="$2" flexWrap="wrap">
        <Chip onDismiss={() => action('onDismiss')('long-blue')} color="blue" size="$5" maxWidth={220}>
          Extraordinarily long chip label
        </Chip>
        <Chip onDismiss={() => action('onDismiss')('tiny')} size="$2">
          Minimum
        </Chip>
      </XStack>
    </YStack>
  ),
};

/**
 * Dismiss ✕ across every size token: the ✕ box is the pill's end-cap square,
 * so its gap to the chip's right edge equals its gap to top and bottom at
 * each size (the optical-centering regression pinned by the Chip spec).
 */
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

export const AllStates: Story = {
  render: () => (
    <YStack gap="$6">
      <YStack gap="$2">
        <Text fontWeight="400">Variants</Text>
        <XStack gap="$2" flexWrap="wrap">
          <Chip variant="filled">Filled</Chip>
          <Chip variant="ghost">Ghost</Chip>
          <Chip variant="outlined">Outlined</Chip>
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Colors (ghost)</Text>
        <XStack gap="$2" flexWrap="wrap">
          <Chip color="gray">Gray</Chip>
          <Chip color="red">Red</Chip>
          <Chip color="green">Green</Chip>
          <Chip color="blue">Blue</Chip>
          <Chip color="yellow">Yellow</Chip>
          <Chip color="orange">Orange</Chip>
          <Chip color="purple">Purple</Chip>
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Sizes</Text>
        <XStack gap="$2" alignItems="center">
          <Chip size="$2">$2</Chip>
          <Chip size="$3">$3</Chip>
          <Chip size="$4">$4</Chip>
          <Chip size="$5">$5</Chip>
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Selected</Text>
        <XStack gap="$2" flexWrap="wrap">
          <Chip variant="outlined" selected={false} onPress={() => {}}>
            Idle
          </Chip>
          <Chip variant="outlined" selected onPress={() => {}}>
            Selected
          </Chip>
          <Chip variant="outlined" selected onPress={() => {}} color="blue">
            Blue
          </Chip>
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontWeight="400">Icon</Text>
        <XStack gap="$2" flexWrap="wrap">
          <Chip icon=<TagIcon />>Tagged</Chip>
          <Chip icon=<LightningIcon /> color="yellow" variant="filled">
            Electric
          </Chip>
          <Chip icon=<TagIcon /> onDismiss={() => action('dismiss')()} color="purple">
            Removable
          </Chip>
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
