import { action } from '@repo/storybook';
import { FOCUS_RING_CLIPPED_OFFSET, FOCUS_RING_MIN_CONTRAST, ensureFocusVisibleRing } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Activity, Airplay, Download, Trash } from '@tamagui/lucide-icons-2';
import { useState } from 'react';
import { Button as TamaguiButton, Paragraph, XStack, YStack, useTheme } from 'tamagui';

import { Button, type ButtonProps } from './index';

const pressed = (name: string) => () => action(name)();

const iconOptions = ['none', 'Activity', 'Airplay', 'Download', 'Trash'] as const;
const icons: Record<string, any> = {
  none: undefined,
  Activity,
  Airplay,
  Download,
  Trash,
};

const meta: Meta<typeof Button> = {
  title: 'Forms/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'A semantic button that uses the Semantic Component Theming System. ' +
          'Use boolean intent props (`accent`, `error`, `warning`, `success`) for ' +
          'semantic styling or `theme` for direct Tamagui theme control. Structural ' +
          'knobs (border radius, fill style, interaction) are resolved automatically ' +
          'from the nearest `<Preset>`.',
      },
    },
  },
  argTypes: {
    icon: { control: false },
    iconAfter: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

function ContrastExample({ children = 'Save', ...props }: ButtonProps) {
  const [presses, setPresses] = useState(0);
  return (
    <YStack data-lc-clicks={presses}>
      <Button
        {...props}
        onPress={() => {
          setPresses((value) => value + 1);
        }}>
        {children}
      </Button>
    </YStack>
  );
}

export const DestructiveEnabled: Story = {
  render: () => <ContrastExample error>Delete</ContrastExample>,
};

export const DestructiveDisabled: Story = {
  render: () => (
    <ContrastExample error disabled>
      Delete
    </ContrastExample>
  ),
};

/** Disabled-visible: sweeps each intent through args, enabled and disabled. */
export const IntentContrast: Story = {
  argTypes: {
    accent: { control: 'boolean' },
    warning: { control: 'boolean' },
    success: { control: 'boolean' },
    theme: { control: 'text' },
    disabled: { control: 'boolean' },
  },
  render: (args) => <ContrastExample {...args} />,
};

export const Basic: Story = {
  name: 'Main',
  args: {
    children: 'Button',
    onPress: pressed('onPress'),
  },
  argTypes: {
    children: { control: 'text', description: 'Button label' },
    accent: { control: 'boolean', description: 'Accent intent' },
    error: { control: 'boolean', description: 'Error intent' },
    warning: { control: 'boolean', description: 'Warning intent' },
    success: { control: 'boolean', description: 'Success intent' },
    theme: { control: 'text', description: 'Direct Tamagui theme name override' },
    size: {
      control: 'select',
      options: ['$2', '$3', '$4', '$5', '$6'],
      description: 'Tamagui size token',
    },
    // The house fill channel is the `outlined` boolean. `variant="outlined"`
    // is raw-tamagui API this component does not read (only the
    // `@repo/ui` shim maps it), so a `variant` control
    // here drove nothing — the board's own "Outlined"
    // specimen measured as a filled button with a transparent edge.
    outlined: { control: 'boolean', description: 'Outlined fill style' },
    chromeless: { control: 'boolean', description: 'Transparent, text-only style' },
    disabled: { control: 'boolean', description: 'Disable the button' },
    skeleton: { control: 'boolean', description: 'Show skeleton placeholder' },
    icon: {
      control: 'select',
      options: iconOptions,
      description: 'Leading icon',
    },
    iconAfter: {
      control: 'select',
      options: iconOptions,
      description: 'Trailing icon',
    },
  },
  render: ({ icon, iconAfter, ...args }) => (
    <Button
      {...args}
      icon={icon ? icons[icon as unknown as string] : undefined}
      iconAfter={iconAfter ? icons[iconAfter as unknown as string] : undefined}
    />
  ),
};

export const Intents: Story = {
  name: 'Intent variants',
  render: () => (
    <YStack gap="$3" padding="$4">
      <XStack gap="$3" flexWrap="wrap">
        <Button onPress={pressed('default')}>Default</Button>
        <Button accent onPress={pressed('accent')}>
          Accent
        </Button>
        <Button success onPress={pressed('success')}>
          Success
        </Button>
        <Button warning onPress={pressed('warning')}>
          Warning
        </Button>
        <Button error onPress={pressed('error')}>
          Error
        </Button>
      </XStack>
      {/* Outlined intents keep the label on the hue's readable text
          tier ($color11), never the solid sub-theme's on-fill foreground. */}
      <XStack gap="$3" flexWrap="wrap">
        <Button outlined onPress={pressed('outlined.default')}>
          Default
        </Button>
        <Button outlined success onPress={pressed('outlined.success')}>
          Success
        </Button>
        <Button outlined warning onPress={pressed('outlined.warning')}>
          Warning
        </Button>
        <Button outlined error onPress={pressed('outlined.error')}>
          Error
        </Button>
      </XStack>
    </YStack>
  ),
};

export const CompoundPattern: Story = {
  render: () => (
    <XStack gap="$3" padding="$4">
      <Button accent size="$4">
        <Button.Icon>
          <Activity />
        </Button.Icon>
        <Button.Text>Compound</Button.Text>
      </Button>
    </XStack>
  ),
};

/**
 * Size recipes (Polaris/Primer/Linear 28/32/40), density ≠ size, selected =
 * fill, nested scale-down, 44px via slop not painted chrome.
 */
export const SizeLadder: Story = {
  name: 'Size ladder $2–$6',
  render: () => (
    <YStack gap="$4" padding="$4">
      <XStack gap="$3" alignItems="flex-end" flexWrap="wrap">
        <Button size="$2">Restart</Button>
        <Button size="$3">Restart</Button>
        <Button size="$4">Restart</Button>
        <Button size="$6">Restart</Button>
      </XStack>
    </YStack>
  ),
};

export const Anatomy: Story = {
  name: 'Anatomy (size / density / selected / nested)',
  render: () => (
    <YStack gap="$4" padding="$4">
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button size="$3">Small</Button>
        <Button size="$4">Medium</Button>
        <Button size="$5">Large</Button>
        <Button size="$4" compact>
          Compact pad
        </Button>
      </XStack>
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button outlined>Rest</Button>
        <Button outlined selected>
          Selected
        </Button>
        <Button accent selected>
          Accent selected
        </Button>
        <Button chromeless selected>
          Ghost selected
        </Button>
      </XStack>
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button>Page</Button>
        <Button nested>Nested</Button>
        <Button nested circular aria-label="day">
          12
        </Button>
        <Button circular icon={Activity} aria-label="toolbar well" />
      </XStack>
    </YStack>
  ),
};

/**
 * FOREIGN CONTRAST SPECIMEN (STORY-HONESTY): the right column renders the
 * RAW tamagui Button beside the house Button strictly so the difference stays
 * visible. Raw primitives here are by design and labeled — knob/contrast probes
 * skip this story via `parameters.foreignContrastSpecimen`.
 */
export const Comparison: Story = {
  name: 'Foreign contrast specimen (raw tamagui)',
  parameters: {
    // Machine-readable exemption for knob/contrast probes and the linter arm.
    foreignContrastSpecimen: true,
    docs: {
      description: {
        story:
          'FOREIGN CONTRAST SPECIMEN (LC-56 STORY-HONESTY). The right column is the raw ' +
          'tamagui Button, rendered for contrast only: it ignores house knobs and intent ' +
          'recipes by design. Probes asserting house rendering must skip this story.',
      },
    },
  },
  render: () => (
    <XStack gap="$6" alignItems="flex-start" padding="$4" flexWrap="wrap">
      <YStack gap="$3" width={200}>
        <Paragraph size="$2" color="$placeholderColor">
          Custom Button
        </Paragraph>
        <Button onPress={pressed('custom.default')}>Default</Button>
        <Button accent onPress={pressed('custom.accent')}>
          Accent
        </Button>
        <Button icon={Activity} onPress={pressed('custom.icon')}>
          With Icon
        </Button>
        <Button outlined onPress={pressed('custom.outlined')}>
          Outlined
        </Button>
        <Button disabled disabledReason="Needs a completed draft">
          Disabled
        </Button>
        <Button size="$3">Small</Button>
        <Button size="$5">Large</Button>
      </YStack>

      <YStack gap="$3" width={200}>
        <Paragraph size="$2" color="$placeholderColor">
          Tamagui Button
        </Paragraph>
        <TamaguiButton onPress={pressed('tamagui.default')}>Default</TamaguiButton>
        <TamaguiButton theme="accent" onPress={pressed('tamagui.accent')}>
          Accent
        </TamaguiButton>
        <TamaguiButton icon={Activity} onPress={pressed('tamagui.icon')}>
          With Icon
        </TamaguiButton>
        <TamaguiButton variant="outlined" onPress={pressed('tamagui.outlined')}>
          Outlined
        </TamaguiButton>
        <TamaguiButton disabled>Disabled</TamaguiButton>
        <TamaguiButton size="$3">Small</TamaguiButton>
        <TamaguiButton size="$5">Large</TamaguiButton>
      </YStack>
    </XStack>
  ),
};

/**
 * FOCUS-RING BOARD. Mirrors design-mockups-v3
 * gallery/html/action-and-feedback/button-state-focus.html so the board is
 * re-shot from the repo instead of the retired scratchpad harness
 * (mpo-main-wt @ 8bd3a90da, which no longer exists).
 *
 * `forceStyle="focusVisible"` paints the REAL focus-visible ring. Button reads
 * `pageOutlineColor` outside the intent Theme and spreads it into
 * focusVisibleStyle, so the ring stays neutral on an accent or error fill.
 * Never spread FOCUS_VISIBLE_RING onto an intent Button here: inside the
 * sub-theme `$outlineColor` re-resolves to the fill and measures 1.00:1.
 *
 * Row 3 is the deliberate FOCUS_VISIBLE_RING_INSET specimen (offset -2, the
 * clipped-composite carve-out). On an intent fill it is EXPECTED to miss the
 * 3:1 floor, which `parameters.focusRingBoard.expectedBelowFloor` tells the
 * shooter; the old board reported those as severe findings because the
 * specimen was built from a bare ensureFocusVisibleRing() that now returns 0.
 * The shooter measures the painted composition (computed outline colour and
 * offset, then the surface the band actually lands on), never the declaration.
 */
/**
 * The clipping carve-out at page scope. A consumer `focusVisibleStyle`
 * REPLACES Button's own ring (it rides the `{...props}` spread), so the inset
 * row has to carry the whole ring itself, and it resolves `$outlineColor` at
 * PAGE scope the way Button does: inside the intent sub-theme the
 * token derives a ring for the inverted surface, which is the 1.00:1 trap.
 */
function InsetRow() {
  const pageOutlineColor = useTheme().outlineColor?.val as string | undefined;
  const inset = ensureFocusVisibleRing({
    outlineOffset: FOCUS_RING_CLIPPED_OFFSET,
    ...(pageOutlineColor ? { outlineColor: pageOutlineColor } : undefined),
  });
  return (
    <XStack gap="$3" alignItems="center" flexWrap="wrap">
      <Button testID="inset-accent" accent forceStyle="focusVisible" focusVisibleStyle={inset}>
        Accent, offset -2
      </Button>
      <Button testID="inset-error" error forceStyle="focusVisible" focusVisibleStyle={inset}>
        Error, offset -2
      </Button>
    </XStack>
  );
}

export const StateFocus: Story = {
  name: 'State: focus',
  parameters: {
    focusRingBoard: {
      floor: FOCUS_RING_MIN_CONTRAST,
      specimens: ['focus-default', 'focus-accent', 'focus-error', 'inset-accent', 'inset-error'],
      expectedBelowFloor: ['inset-accent', 'inset-error'],
    },
    docs: {
      description: {
        story:
          'MPO-41 board. Rings forced on with forceStyle="focusVisible" so light and dark ' +
          'shoot in one pass. Rows: rest vs focus on the neutral fill; focus on accent and ' +
          'error (offset 0, band on the page ground, must be >= 3:1); the inset carve-out ' +
          "(offset -2, band on the control's own fill, expected below the floor on intent).",
      },
    },
  },
  render: () => (
    <YStack testID="focus-ring-board" gap="$4" padding="$4" backgroundColor="$background">
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button testID="rest">Rest</Button>
        <Button testID="focus-default" forceStyle="focusVisible">
          Focus
        </Button>
      </XStack>
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button testID="focus-accent" accent forceStyle="focusVisible">
          Accent focus
        </Button>
        <Button testID="focus-error" error forceStyle="focusVisible">
          Error focus
        </Button>
      </XStack>
      <InsetRow />
    </YStack>
  ),
};
