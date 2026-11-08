/**
 * Toolbar button primitives for the rich text editor.
 *
 * ToolbarButton: square icon button; ToolbarDropdownButton: button with a
 * trailing caret (variable width).
 *
 * Axiom 12 LEGIBLE FLOOR: the pressable/focusable element is a 44x44
 * transparent target (same split as the forms RadioGroup/Checkbox fix);
 * the visible chrome (hover/press/active surface) is the inner glyph box,
 * so visual density survives while the touch target is floored.
 *
 * Toggle semantics: when `active` is provided the button reports
 * `aria-pressed` so assistive tech reads format state.
 */

import { CaretDownIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { Tooltip } from '@repo/ui';
import type { ReactNode } from 'react';
import { XStack, View, styled } from 'tamagui';

import { RichEditorContext } from '../context';

/** WCAG / Axiom 12 pressable floor */
const TARGET_SIZE = 44;
/** Visible chrome box inside the target */
const VISUAL_SIZE = 30;

// ===========================================================================
// Types
// ===========================================================================

export interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
  'aria-label': string;
  /** Marks the button as a toggle; reflects the pressed state to AT */
  'aria-pressed'?: boolean;
  tooltip?: string;
}

export interface ToolbarDropdownButtonProps {
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
  'aria-label': string;
}

// ===========================================================================
// Inner chrome box (the visible button surface)
// ===========================================================================

const ChromeBox = styled(View, {
  name: 'ToolbarButtonChrome',
  alignItems: 'center',
  justifyContent: 'center',
  width: VISUAL_SIZE,
  height: VISUAL_SIZE,

  hoverStyle: {
    backgroundColor: '$color4',
  },

  variants: {
    active: {
      true: {
        backgroundColor: '$color5',
      },
    },
    stretch: {
      true: {
        width: 'auto',
        paddingHorizontal: '$2',
      },
    },
    // An aria-disabled control must not light up on hover like a pressable
    // one (DG-ST-03 / LC-40 washed chrome).
    unavailable: {
      true: {
        hoverStyle: { backgroundColor: 'transparent' },
      },
    },
  } as const,
});

// ===========================================================================
// ToolbarButton (square)
// ===========================================================================

export const ToolbarButton = ({
  active,
  disabled,
  onPress,
  children,
  tooltip,
  'aria-pressed': ariaPressed,
  ...props
}: ToolbarButtonProps) => {
  const ctx = RichEditorContext.useStyledContext();
  const { knobProps } = useResolvedKnobs();
  const isDisabled = disabled ?? ctx.disabled;
  const pressed = ariaPressed ?? active;

  const button = (
    <Button
      chromeless
      // DG-ST-03: an unavailable action (undo with no history, …) is never
      // bare-`disabled` — it stays focusable, reports `aria-disabled`,
      // swallows presses, and dims. The icon strip has no room for Button's
      // visible `disabledReason` text, so aria state + washed chrome is the
      // toolbar-idiom explain.
      aria-disabled={isDisabled || undefined}
      onPress={isDisabled ? undefined : onPress}
      cursor={isDisabled ? 'not-allowed' : undefined}
      opacity={isDisabled ? 0.5 : 1}
      width={TARGET_SIZE}
      height={TARGET_SIZE}
      minWidth={TARGET_SIZE}
      minHeight={TARGET_SIZE}
      padding={0}
      borderWidth={0}
      backgroundColor="transparent"
      hoverStyle={{ backgroundColor: 'transparent' }}
      pressStyle={{ backgroundColor: 'transparent' }}
      {...(pressed === undefined ? undefined : { 'aria-pressed': pressed })}
      {...(active ? { theme: 'active' } : undefined)}
      {...props}>
      <ChromeBox
        {...knobProps.borderRadius}
        borderWidth={0}
        active={!!active}
        unavailable={isDisabled}>
        {children}
      </ChromeBox>
    </Button>
  );

  // DG-OVL-05: no hover tooltip on a disabled control — the shortcut hint
  // returns with availability.
  if (tooltip !== undefined && tooltip !== '' && !isDisabled) {
    return (
      <Tooltip
        content={tooltip}
        placement="bottom"
        delay={400}>
        {button}
      </Tooltip>
    );
  }

  return button;
};

// ===========================================================================
// ToolbarDropdownButton (fixed height, variable width)
// ===========================================================================

export const ToolbarDropdownButton = ({
  active,
  disabled,
  onPress,
  children,
  ...props
}: ToolbarDropdownButtonProps) => {
  const ctx = RichEditorContext.useStyledContext();
  const { knobProps } = useResolvedKnobs();
  const isDisabled = disabled ?? ctx.disabled;

  return (
    <Button
      chromeless
      // DG-ST-03: aria-disabled explain (see ToolbarButton above).
      aria-disabled={isDisabled || undefined}
      onPress={isDisabled ? undefined : onPress}
      cursor={isDisabled ? 'not-allowed' : undefined}
      opacity={isDisabled ? 0.5 : 1}
      height={TARGET_SIZE}
      minHeight={TARGET_SIZE}
      paddingHorizontal={0}
      paddingVertical={0}
      borderWidth={0}
      backgroundColor="transparent"
      hoverStyle={{ backgroundColor: 'transparent' }}
      pressStyle={{ backgroundColor: 'transparent' }}
      {...(active ? { theme: 'active' } : undefined)}
      {...props}>
      <ChromeBox
        {...knobProps.borderRadius}
        borderWidth={0}
        active={!!active}
        stretch
        unavailable={isDisabled}>
        <XStack
          alignItems="center"
          gap="$1">
          {children}
          <CaretDownIcon size={10} />
        </XStack>
      </ChromeBox>
    </Button>
  );
};
