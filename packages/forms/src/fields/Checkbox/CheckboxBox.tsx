import { ensureFocusVisibleRing, ensureKeyboardModalityTracking, wasKeyboardFocus, transitionProps } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import type { ReactNode } from 'react';
import type { SizeTokens, TransitionProp } from 'tamagui';
import { View, getVariableValue, isWeb } from 'tamagui';

import { formControlColors, formSelectedColors } from '../../shared/colorRamps';
import { clampRadiusForControl } from '../../shared/utils';

/** WCAG 2.5.5 pressable floor. The painted box is smaller and sits inside. */
export const CHECKBOX_TARGET_PX = 44;

/**
 * The glyph rides the linear scale but NEVER `h/2`.
 * `$2` = 5px, which stays square on the ~20px box. `$4` (9) already paints
 * as a circle on that box; `$12` is a radio.
 */
export const CHECKBOX_GLYPH_MAX_RADIUS_TOKEN = 2;

/**
 * Per-component override for the checkbox glyph.
 * `pointy` / `$0` → 0; every other stop caps at `$2`. Never `$12`, never h/2.
 */
export function clampCheckboxGlyphRadius(radiusToken: string | undefined, options?: { pointy?: boolean }): string | 0 {
  if (options?.pointy) {
    return 0;
  }
  return clampRadiusForControl(radiusToken, CHECKBOX_GLYPH_MAX_RADIUS_TOKEN);
}

/** Painted radius ≥ half the side reads as a circle (a radio, not a check). */
export function isCircularCheckboxRadius(radiusPx: number, sidePx: number): boolean {
  if (sidePx <= 0) {
    return false;
  }
  return radiusPx >= sidePx / 2;
}

export function getCheckboxGlyphSize(size: SizeTokens): number {
  return Math.round(getVariableValue(getSize(size)) * 0.45);
}

/** Spectrum / Primer: the empty box's edge is the shape (≥2px). */
export function getCheckboxBoxBorderWidth(knobBorderWidth: number | undefined): number {
  return Math.max(Number(knobBorderWidth) || 1, 2);
}

export function getCheckboxIconSize(glyphSize: number): number {
  return Math.max(10, Math.round(glyphSize * 0.7));
}

/**
 * The 44px role=checkbox is a hit target, never a painted control.
 * Hover/press/focus washes and rings stay off this node so they cannot wrap
 * the label+box group. The visible box carries both channels.
 */
export const checkboxTargetFrameProps = {
  width: CHECKBOX_TARGET_PX,
  height: CHECKBOX_TARGET_PX,
  minWidth: CHECKBOX_TARGET_PX,
  minHeight: CHECKBOX_TARGET_PX,
  padding: 0,
  borderWidth: 0,
  // Tamagui's size variant sets borderRadius = size/8 on the role=checkbox
  // frame. Override it: this node is an unpainted 44px target, never a disc.
  borderRadius: 0,
  backgroundColor: 'transparent' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  outlineWidth: 0,
  hoverStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
  pressStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
  focusStyle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    outlineWidth: 0,
  },
  focusVisibleStyle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    outlineWidth: 0,
  },
  activeStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
} as const;

interface FocusRest {
  onFocus?: (...args: any[]) => void;
  onBlur?: (...args: any[]) => void;
  onHoverIn?: (...args: any[]) => void;
  onHoverOut?: (...args: any[]) => void;
}

export function checkboxKbFocusHandlers(
  setKbFocus: (next: boolean) => void,
  setHovered: (next: boolean) => void,
  rest?: FocusRest,
) {
  // Native: a focus handler on any styled layer over tamagui's
  // Checkbox makes that layer pass `onPress: undefined` down, and
  // createCheckbox spreads it over its own toggle, so a tap on the box does
  // nothing. RN never fires focus or hover on this frame anyway.
  if (!isWeb) {
    return {};
  }
  return {
    onFocus: (e: any) => {
      if (wasKeyboardFocus()) {
        setKbFocus(true);
      }
      rest?.onFocus?.(e);
    },
    onBlur: (e: any) => {
      setKbFocus(false);
      rest?.onBlur?.(e);
    },
    onHoverIn: (e: any) => {
      setHovered(true);
      rest?.onHoverIn?.(e);
    },
    onHoverOut: (e: any) => {
      setHovered(false);
      rest?.onHoverOut?.(e);
    },
  };
}

export function CheckboxGlyphBox({
  glyphSize,
  isMarked,
  kbFocus,
  hovered,
  borderWidth,
  borderRadius,
  transition,
  children,
}: {
  glyphSize: number;
  isMarked: boolean;
  kbFocus: boolean;
  hovered?: boolean;
  borderWidth: number;
  borderRadius: number | string;
  transition?: TransitionProp;
  children?: ReactNode;
}) {
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  return (
    <View
      data-checkbox-box="true"
      data-focus-ring={kbFocus ? 'true' : undefined}
      width={glyphSize}
      height={glyphSize}
      borderWidth={borderWidth}
      borderRadius={borderRadius}
      // Polaris / Primer / Spectrum / Apple: idle = empty square whose shape
      // is the boundary; checked = accent fill + check (same border width,
      // border color = fill — not a second outline).
      backgroundColor={isMarked ? formSelectedColors.mark : 'transparent'}
      borderColor={
        isMarked ? formSelectedColors.mark : hovered ? formControlColors.thumb.press : formControlColors.boundary
      }
      alignItems="center"
      justifyContent="center"
      overflow="visible"
      // Paint-only: on RN a nested View / Phosphor SVG steals the responder
      // from the 44px role=checkbox frame, so the box itself never toggles
      // (the Label Pressable still works). `none` lets the press fall through.
      pointerEvents="none"
      {...transitionProps(transition)}
      {...(kbFocus ? ensureFocusVisibleRing() : { outlineWidth: 0 as const })}>
      {children}
    </View>
  );
}
