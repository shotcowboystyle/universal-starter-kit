import { CheckIcon, XIcon } from '@phosphor-icons/react';
import {
  FOCUS_VISIBLE_RING,
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  pressTargetHitSlop,
  radiusStopFromToken,
  resolveRadiusClass,
  sizeRecipeForToken,
  stackRadiusProps,
  useLegibleInkOn,
  useResolvedKnobs,
} from '@repo/theme';
import type { GroupOrientation, GroupPosition } from '@repo/theme';
import type { KeyboardEvent, ReactNode } from 'react';
import { useState } from 'react';
import type { ColorTokens, GetProps } from 'tamagui';
import { Text, View, isWeb, styled, useTheme } from 'tamagui';

import { t } from '../shared/t';

// ── Types ─────────────────────────────────────────────────────

export type ChipVariant = 'solid' | 'subtle' | 'outline';
export type ChipColor = 'gray' | 'red' | 'green' | 'blue' | 'yellow' | 'orange' | 'purple';
export type ChipSize = '$2' | '$3' | '$4' | '$5';

/** Public aliases (spec filled/outlined/ghost) map onto the Chip vocabulary. */
export type ChipVariantProp = ChipVariant | 'filled' | 'outlined' | 'ghost';

export interface ChipProps {
  children: ReactNode;
  size?: ChipSize;
  variant?: ChipVariantProp;
  color?: ChipColor;
  onDismiss?: () => void;
  disabled?: boolean;
  /** Selected = fill. Never a second outline or sibling border. */
  selected?: boolean;
  onPress?: () => void;
  /** Leading slot (Material filter/input). Defaults to a check when selected. */
  icon?: ReactNode;
  /** Opt-in stacked-group corners (gapped chips stay pills). */
  groupPosition?: GroupPosition;
  groupOrientation?: GroupOrientation;
}

// ── Color mappings ────────────────────────────────────────────

// Axiom 12 / WCAG 1.4.3 — chip text is small (12px) and must clear ≥4.5:1 on
// its own tint. Step-12 text is the only pairing that clears AA on the tint
// in BOTH schemes (9–12:1 light, higher in dark). Selected fill is a
// darker step of the same family so selection is fill, not a ring.
// `dismissHover`/`dismissPress` are the ✕ end-cap fill: two/three steps above
// the step-4 tint so the hover shift is actually visible (step 5 on step 4
// measured Δ≈7 RGB — imperceptible, the flagged "no real hover" defect).
const colorMap: Record<
  ChipColor,
  {
    bg: ColorTokens;
    fill: ColorTokens;
    text: ColorTokens;
    border: ColorTokens;
    dismissHover: ColorTokens;
    dismissPress: ColorTokens;
  }
> = {
  gray: {
    bg: '$color4',
    fill: '$color8',
    text: '$color12',
    border: '$color7',
    dismissHover: '$color6',
    dismissPress: '$color7',
  },
  red: {
    bg: '$red4',
    fill: '$red8',
    text: '$red12',
    border: '$red7',
    dismissHover: '$red6',
    dismissPress: '$red7',
  },
  green: {
    bg: '$green4',
    fill: '$green8',
    text: '$green12',
    border: '$green7',
    dismissHover: '$green6',
    dismissPress: '$green7',
  },
  blue: {
    bg: '$blue4',
    fill: '$blue8',
    text: '$blue12',
    border: '$blue7',
    dismissHover: '$blue6',
    dismissPress: '$blue7',
  },
  yellow: {
    bg: '$yellow4',
    fill: '$yellow8',
    text: '$yellow12',
    border: '$yellow7',
    dismissHover: '$yellow6',
    dismissPress: '$yellow7',
  },
  orange: {
    bg: '$orange4',
    fill: '$orange8',
    text: '$orange12',
    border: '$orange7',
    dismissHover: '$orange6',
    dismissPress: '$orange7',
  },
  purple: {
    bg: '$purple4',
    fill: '$purple8',
    text: '$purple12',
    border: '$purple7',
    dismissHover: '$purple6',
    dismissPress: '$purple7',
  },
};

type SizeVal = string | number | null | undefined;

const resolveVariant = (variant: ChipVariantProp | undefined): ChipVariant => {
  if (variant === 'filled') {
    return 'solid';
  }
  if (variant === 'outlined') {
    return 'outline';
  }
  if (variant === 'ghost') {
    return 'subtle';
  }
  return variant ?? 'subtle';
};

// ── Styled components ─────────────────────────────────────────

/**
 * Chip geometry rides the GENERATED `controlCompact` family:
 * padX / font / icon / inner gap come from the recipe table — no handwritten
 * per-size px map. The pill has no recipe height: it hugs its label, and the
 * vertical inset derives as a quarter of the recipe padX (preserves the
 * audited $3/$4 pill height). Module-eval objects so styled() can flatten
 * (pilot pattern: InputParts spreads `recipeFamilies.control.boxVariants`).
 */
const CHIP_RECIPE_FAMILY = 'controlCompact' as const;
const CHIP_SIZE_TOKENS = ['$2', '$3', '$4', '$5'] as const;

const chipPadY = (paddingHorizontal: number): number => Math.round(paddingHorizontal * 0.25);

const chipFrameGeometry = (token: string) => {
  const recipe = sizeRecipeForToken(token, { family: CHIP_RECIPE_FAMILY });
  return {
    paddingHorizontal: recipe.paddingHorizontal,
    paddingVertical: chipPadY(recipe.paddingHorizontal),
    gap: recipe.gap,
  };
};

const chipFrameVariants = Object.fromEntries(CHIP_SIZE_TOKENS.map((token) => [token, chipFrameGeometry(token)]));

const chipTextVariants = Object.fromEntries(
  CHIP_SIZE_TOKENS.map((token) => [
    token,
    { fontSize: sizeRecipeForToken(token, { family: CHIP_RECIPE_FAMILY }).fontSize },
  ]),
);

// Negative mirror of the frame pads: the dismiss end-cap cancels the pill's
// padding so `alignSelf: stretch` spans the full pill height (see below).
const chipDismissVariants = Object.fromEntries(
  CHIP_SIZE_TOKENS.map((token) => {
    const { paddingHorizontal, paddingVertical } = chipFrameGeometry(token);
    return [token, { marginVertical: -paddingVertical, marginInlineEnd: -paddingHorizontal }];
  }),
);

/**
 * Exported so chip-scale companions (e.g. the Tags "Add Tag" trigger) share
 * the exact same size variants — padding/font stay in lockstep with Chip for
 * every size token, all derived from `recipeFamilies.controlCompact`.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- chip-scale companions import the styled frame, text and size helpers alongside the Chip component
export const ChipFrame = styled(View, {
  name: 'Chip',
  flexDirection: 'row',
  alignItems: 'center',
  // Radius comes from the knob spread in Chip (knobProps.borderRadius) so the
  // borderRadius knob wins — no hardcoded base radius (same as Tags chips).
  ...chipFrameVariants.$3,
  overflow: 'visible',
  // Same box for every variant — see the components Chip: giving the border
  // to `outline` alone makes an outlined chip 2px taller than a solid or
  // subtle one at the same size token, which shows the moment the two sit in
  // one row.
  borderWidth: 1,
  borderColor: 'transparent',

  variants: {
    size: {
      ...chipFrameVariants,
      '...size': (val: SizeVal) => chipFrameGeometry(String(val ?? '$3')),
    },
    variant: {
      solid: {},
      subtle: {},
      outline: {},
    },
  } as const,

  defaultVariants: {
    variant: 'subtle',
    size: '$3',
  },
});

// oxlint-disable-next-line react-doctor/only-export-components -- chip-scale companions import the styled frame, text and size helpers alongside the Chip component
export const ChipText = styled(Text, {
  name: 'ChipText',
  fontWeight: '500',
  numberOfLines: 1,
  userSelect: 'none',
  ...chipTextVariants.$3,

  variants: {
    size: {
      ...chipTextVariants,
      '...size': (val: SizeVal) => ({
        fontSize: sizeRecipeForToken(String(val ?? '$3'), { family: CHIP_RECIPE_FAMILY }).fontSize,
      }),
    },
  } as const,
});

/** Keyboard stop for the pill. Chrome lives on ChipFrame, not here. */
const ChipBody = styled(View, {
  name: 'ChipBody',
  flexDirection: 'row',
  alignItems: 'center',
  gap: chipFrameVariants.$3.gap,
  minWidth: 0,
  flexShrink: 1,
  backgroundColor: 'transparent',
  outlineWidth: 0,
  cursor: 'pointer',
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
});

/** Icon size that pairs with each chip size — the generated recipe's icon channel. */
// oxlint-disable-next-line react-doctor/only-export-components -- chip-scale companions import the styled frame, text and size helpers alongside the Chip component
export const chipIconSize = (size: string): number => sizeRecipeForToken(size, { family: CHIP_RECIPE_FAMILY }).iconSize;

/**
 * Fine-pointer floor for the dismiss target. The 44px coarse
 * floor is reached via `hitSlop` (native touch), NOT by growing the box: the
 * old 44×44 real box spilled ~9px past the pill and stole clicks from the
 * row above (audit).
 */
export const CHIP_DISMISS_MIN_TARGET_FINE = 24;

/**
 * Symmetric outset that brings an end-cap square below the fine-pointer
 * floor up to ≥24 effective (applied as an absolute, unpainted overlay).
 * Exported for the Chip spec, which pins the hit-area decision.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- chip-scale companions import the styled frame, text and size helpers alongside the Chip component
export const chipDismissFloorOutset = (side: number): number => Math.max(0, (CHIP_DISMISS_MIN_TARGET_FINE - side) / 2);

/**
 * The dismiss ✕ occupies the pill's END CAP: `alignSelf: stretch` spans the
 * full pill height (the per-size negative margins cancel ChipFrame's
 * padding) and the component mirrors the measured height into `width` via
 * onLayout, so the box is a square exactly as tall as the pill hugging the
 * rounded end. Centering the glyph in that square puts its center on the
 * end-cap center line — the ✕'s gap to the chip's right edge equals its gap
 * to top and bottom BY CONSTRUCTION, at every size token and knob.
 *
 * This box stays UNPAINTED — hover/press paint lives on DismissRing
 * (glyph-scale) so a grown floor can never cover the label. The ≥24
 * fine-pointer floor is an absolute, unpainted overlay inside the button.
 */
const DismissButton = styled(View, {
  name: 'ChipDismiss',
  cursor: 'pointer',
  opacity: 0.7,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  alignSelf: 'stretch',
  // Containing block for the absolute hit-area overlay below.
  position: 'relative',
  outlineWidth: 0,
  hoverStyle: {
    opacity: 1,
  },
  pressStyle: {
    opacity: 0.9,
  },
  focusStyle: { outlineWidth: 0 },
  // Shared house ring recipe (2px solid $outlineColor, −2 inset) — the
  // inset ring hugs the circular end-cap target.
  focusVisibleStyle: {
    opacity: 1,
    ...FOCUS_VISIBLE_RING,
  },

  variants: {
    // Mirrors the ChipFrame size variants NEGATED (derived from the same
    // generated recipe geometry): the vertical margins cancel paddingVertical
    // (stretch then spans the full pill height) and the inline-end margin
    // cancels paddingHorizontal (the square hugs the pill's right edge).
    size: {
      ...chipDismissVariants,
      '...size': (val: SizeVal) => {
        const { paddingHorizontal, paddingVertical } = chipFrameGeometry(String(val ?? '$3'));
        return { marginVertical: -paddingVertical, marginInlineEnd: -paddingHorizontal };
      },
    },
  } as const,

  defaultVariants: {
    size: '$3',
  },
});

// The glyph-scale ring: all painted dismiss chrome lives here, inside the
// transparent press target, so the hover ring can never reach the label —
// its painted box is exactly the box the chip row reserves (icon + $0.5
// inset; the ChipFrame gap token keeps it clear of the text).
const DismissRing = styled(View, {
  name: 'ChipDismissRing',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '$0.5',
  outlineWidth: 0,
  hoverStyle: {
    backgroundColor: '$color5',
  },
});

const CHIP_RING_STYLE_ID = 'mp-chip-focus-ring';

/**
 * Two focusables, two rings. Body focus paints the pill (ChipFrame
 * shape); dismiss focus paints the glyph (CSS in compositeFocusRingCss).
 * `:has(.mp-chip-body:focus-visible)` does not match when the ✕ is focused,
 * so the pill never rings for the wrong stop.
 */
const chipFocusRingCss = `/* LC-71: Chip body → pill ring; dismiss → glyph (see mp-chip-dismiss-ring). */
.mp-chip:has(.mp-chip-body:focus-visible),
[data-mp-chip]:has(.mp-chip-body:focus-visible) {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText)) !important;
  outline-offset: 2px !important;
}
.mp-chip-body,
.mp-chip-body:focus,
.mp-chip-body:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}`;

const isStringNode = (node: ReactNode): node is string => typeof node === 'string';

const isTextNode = (node: ReactNode): node is string | number => isStringNode(node) || typeof node === 'number';

const chipBackground = (
  selected: boolean,
  variant: ChipVariant,
  colors: (typeof colorMap)[ChipColor],
): ColorTokens | 'transparent' => {
  if (selected) {
    return colors.fill;
  }
  return variant === 'outline' ? 'transparent' : colors.bg;
};

const resolveDismissRadius = (radius: string | number): string | number => {
  const stop = radiusStopFromToken(radius);
  if (stop === 'full') {
    return 1000;
  }
  return stop ? resolveRadiusClass('CIRCULAR-AT-FULL', stop) : radius;
};

// The DOM hands the key handler its event, but tamagui types `onKeyDown` as `() => void`.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- SAFETY: the DOM always invokes onKeyDown with a KeyboardEvent; only tamagui's prop type omits the parameter
const asKeyDownProp = (handler: (e: KeyboardEvent) => void): (() => void) => handler as unknown as () => void;

const ensureChipFocusRing = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  ensureCompositeFocusRing();
  if (document.querySelector(`#${CHIP_RING_STYLE_ID}`)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = CHIP_RING_STYLE_ID;
  tag.textContent = chipFocusRingCss;
  document.head.append(tag);
};

const useGlyphInk = (ink: string): string => {
  const theme = useTheme();
  // SAFETY: tamagui's theme proxy is keyed by token name at runtime; its typed keys are only the declared tokens
  const themeInks = theme as Record<string, { val?: string } | undefined>;
  return ink.startsWith('$') ? (themeInks[ink.slice(1)]?.val ?? 'currentColor') : ink;
};

const chipLeading = (icon: ReactNode, selected: boolean, iconSize: number, glyphInk: string): ReactNode => {
  if (icon !== undefined) {
    return icon;
  }
  return selected ? (
    <CheckIcon
      size={iconSize}
      color={glyphInk}
    />
  ) : null;
};

interface ChipFramePropsInput {
  groupPosition: GroupPosition | undefined;
  groupOrientation: GroupOrientation;
  radius: Parameters<typeof stackRadiusProps>[1];
  disabled: boolean | undefined;
  disabledState: ReturnType<typeof useResolvedKnobs>['disabledState'];
  onPress: (() => void) | undefined;
  interactive: boolean;
}

/** Group corners, disabled chrome and frame press wiring, each spread onto ChipFrame only when it applies. */
const chipFrameProps = ({
  groupPosition,
  groupOrientation,
  radius,
  disabled,
  disabledState,
  onPress,
  interactive,
}: ChipFramePropsInput) => ({
  platform: isWeb ? { className: 'mp-chip', tabIndex: -1 } : { focusable: interactive },
  cursor: interactive ? ('pointer' as const) : undefined,
  focusVisibleStyle: isWeb || !interactive ? { outlineWidth: 0 } : ensureFocusVisibleRing(),
  text: disabled ? disabledState.textKnobProps : undefined,
  group: groupPosition ? { borderRadius: 0, ...stackRadiusProps(groupPosition, radius, groupOrientation) } : undefined,
  disabled: disabled
    ? {
        'aria-disabled': true,
        ...disabledState.surfaceKnobProps,
        ...disabledState.assemblyKnobProps,
      }
    : undefined,
  press:
    onPress && !disabled
      ? {
          onPress: () => {
            onPress();
          },
          pressStyle: { opacity: 0.88 },
        }
      : undefined,
});

const chipBodyKeyDown = (onPress: (() => void) | undefined, onDismiss: (() => void) | undefined) =>
  asKeyDownProp((e) => {
    if ((e.key === 'Enter' || e.key === ' ') && onPress) {
      e.preventDefault();
      e.stopPropagation();
      onPress();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && onDismiss) {
      e.preventDefault();
      e.stopPropagation();
      onDismiss();
    }
  });

interface ChipPressBodyProps {
  label: string | undefined;
  selected: boolean;
  onPress: (() => void) | undefined;
  onDismiss: (() => void) | undefined;
  children: ReactNode;
}

/** Web keyboard stop for the pill: Enter/Space presses, Backspace/Delete dismisses. */
const ChipPressBody = ({ label, selected, onPress, onDismiss, children }: ChipPressBodyProps) => {
  const bodyPressProps = onPress
    ? {
        onPress: (e: { stopPropagation?: () => void }) => {
          e.stopPropagation?.();
          onPress();
        },
      }
    : undefined;
  return (
    <ChipBody
      className="mp-chip-body"
      data-mp-chip-body=""
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- ChipBody is a tamagui View; role carries the button semantics without changing the rendered element
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={onPress ? selected : undefined}
      onKeyDown={chipBodyKeyDown(onPress, onDismiss)}
      {...bodyPressProps}>
      {children}
    </ChipBody>
  );
};

interface ChipDismissButtonProps {
  onDismiss: () => void;
  label: string;
  size: string;
  radius: string | number;
  iconSize: number;
  glyphInk: string;
  hoverFill: ColorTokens;
  pressFill: ColorTokens;
}

const ChipDismissButton = ({
  onDismiss,
  label,
  size,
  radius,
  iconSize,
  glyphInk,
  hoverFill,
  pressFill,
}: ChipDismissButtonProps) => {
  // End-cap square: width mirrors the stretched height (see DismissButton).
  const [dismissSide, setDismissSide] = useState<number | null>(null);
  // Fine-pointer floor: when the end-cap square is under 24px, spill the hit
  // area past it symmetrically (≈1.75px/side at $2 — inside the half-row-gap
  // cap) via an absolute overlay that cannot affect layout.
  const dismissFloorOutset = dismissSide !== null && dismissSide !== 0 ? chipDismissFloorOutset(dismissSide) : 0;
  return (
    <DismissButton
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- DismissButton is a tamagui View; role carries the button semantics without changing the rendered element
      role="button"
      aria-label={label}
      tabIndex={0}
      className="mp-chip-dismiss"
      size={size}
      borderRadius={radius}
      // Coarse-pointer floor: expand the touch area to 44×44 via hitSlop
      // (unpainted, no layout) instead of growing the box.
      hitSlop={pressTargetHitSlop(CHIP_DISMISS_MIN_TARGET_FINE)}
      width={dismissSide ?? undefined}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs((dismissSide ?? 0) - h) > 0.5) {
          setDismissSide(h);
        }
      }}
      onPress={(e) => {
        e.stopPropagation?.();
        onDismiss();
      }}
      onKeyDown={asKeyDownProp((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }
      })}>
      {dismissFloorOutset > 0 && (
        <View
          position="absolute"
          top={-dismissFloorOutset}
          bottom={-dismissFloorOutset}
          left={-dismissFloorOutset}
          right={-dismissFloorOutset}
        />
      )}
      <DismissRing
        className="mp-chip-dismiss-ring"
        borderRadius={radius}
        hoverStyle={{ backgroundColor: hoverFill }}
        pressStyle={{ backgroundColor: pressFill }}>
        <XIcon
          size={iconSize}
          color={glyphInk}
        />
      </DismissRing>
    </DismissButton>
  );
};

// ── Chip Component ────────────────────────────────────────────

export const Chip = ({
  children,
  size,
  variant: variantProp = 'subtle',
  color = 'gray',
  onDismiss,
  disabled,
  selected = false,
  onPress,
  icon,
  groupPosition,
  groupOrientation = 'horizontal',
}: ChipProps) => {
  const { knobProps, disabledState } = useResolvedKnobs();
  const variant = resolveVariant(variantProp);
  const colors = colorMap[color];
  // Chip geometry (padding/font/icon) follows the size knob through the
  // shared size variants (Tags precedent); an explicit size prop
  // ejects. Control padding is size-derived (SP-PAD), so the space knob
  // has no separate chip target.
  const resolvedSize = size ?? knobProps.sizeToken;
  if (isWeb) {
    ensureChipFocusRing();
  }

  const interactive = Boolean(!disabled && (onPress || onDismiss));
  const label = isStringNode(children) ? children : undefined;

  // Selected paints the family's step 8, where step-12 ink misses AA in dark
  // (#c2e6ff on #2870bd, 3.88:1); the fill keeps its ink only while it reads.
  const selectedInk = useLegibleInkOn(colors.fill, colors.text);
  const textColor = selected ? selectedInk : colors.text;
  const iconSize = chipIconSize(resolvedSize);
  // CIRCULAR-AT-FULL. The end-cap stretches to the pill's height,
  // so full is a circle of whatever box it lays out to (1000 paints h/2).
  const dismissRadius = resolveDismissRadius(knobProps.borderRadius.borderRadius);
  // The ✕ glyph ink must be a RESOLVED color: the raw token string passed as
  // the SVG `fill` attribute never resolved (invalid CSS ⇒ initial black ⇒
  // 1.32:1 on the dark tint — the "invisible ✕" regression). useTheme gives
  // the scheme-aware value for the same step-12 ink the label uses.
  const glyphInk = useGlyphInk(textColor);
  // Undifferentiated "Remove" fails when a row holds many chips (UX-019);
  // interpolate the label whenever it is a plain string.
  const dismissLabel = isTextNode(children) ? t('Remove {{label}}', { label: String(children) }) : t('Remove');
  const leading = chipLeading(icon, selected, iconSize, glyphInk);

  const frameProps = chipFrameProps({
    groupPosition,
    groupOrientation,
    radius: knobProps.borderRadius.borderRadius,
    disabled,
    disabledState,
    onPress,
    interactive,
  });
  const labelRow = (
    <>
      {leading}
      <ChipText
        size={resolvedSize}
        color={textColor}
        {...knobProps.body}
        {...frameProps.text}>
        {children}
      </ChipText>
    </>
  );

  return (
    <ChipFrame
      size={resolvedSize}
      variant={variant}
      backgroundColor={chipBackground(selected, variant, colors)}
      {...knobProps.borderRadius}
      {...frameProps.group}
      borderColor={!selected && variant === 'outline' ? colors.border : 'transparent'}
      // Chip-frame law: borderWidth is pinned at 1 (ignore the knob). The
      // radius fragment also carries borderWidth, so this must land AFTER
      // `{...knobProps.borderRadius}` or large would paint 2 and grow the
      // box. Selected fill drops the stroke.
      borderWidth={selected ? 0 : 1}
      // DISABLED-VISIBLE: hue tint washes to the muted neutral tiers
      // while the label pins to the lowest AA step (keepLabel); dimWhole
      // dims the chip as its own assembly.
      // Axiom 6 HONEST STATE: the disabled state must also live in
      // the a11y tree, not just the pixels — cross-platform `aria-disabled`
      // (RN maps it to accessibilityState.disabled; no RN-prop DOM leak).
      {...frameProps.disabled}
      overflow="visible"
      cursor={frameProps.cursor}
      data-mp-chip=""
      data-selected={selected ? 'true' : undefined}
      data-group-position={groupPosition}
      {...frameProps.platform}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={frameProps.focusVisibleStyle}
      {...frameProps.press}>
      {isWeb && interactive ? (
        <ChipPressBody
          label={label}
          selected={selected}
          onPress={onPress}
          onDismiss={onDismiss}>
          {labelRow}
        </ChipPressBody>
      ) : (
        labelRow
      )}
      {onDismiss && !disabled && (
        <ChipDismissButton
          onDismiss={onDismiss}
          label={dismissLabel}
          size={resolvedSize}
          radius={dismissRadius}
          iconSize={iconSize}
          glyphInk={glyphInk}
          hoverFill={colors.dismissHover}
          pressFill={colors.dismissPress}
        />
      )}
    </ChipFrame>
  );
};

export type ChipFrameProps = GetProps<typeof ChipFrame>;
