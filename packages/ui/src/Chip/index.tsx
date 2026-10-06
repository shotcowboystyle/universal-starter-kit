import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { pressSlopOutsetProps } from '@repo/forms';
import { isWeb } from '@repo/platform';
import {
  MIN_PRESS_TARGET,
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  pressTargetHitSlop,
  pressTargetStyle,
  radiusStopFromToken,
  resolveRadiusClass,
  sizeRecipeForToken,
  useAccentTintedSurface,
  useReadableTextOn,
  useResolvedKnobs,
} from '@repo/theme';
import { cloneElement, createElement, isValidElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorTokens, GetProps } from 'tamagui';
import { Text, View, getTokenValue, styled } from 'tamagui';

// ── Types ─────────────────────────────────────────────────────

/** Canonical tones. `solid`/`subtle`/`outline` stay as aliases (Tags, older call sites). */
export type ChipTone = 'filled' | 'outlined' | 'ghost';
export type ChipVariant = ChipTone | 'solid' | 'subtle' | 'outline';
export type ChipColor = 'gray' | 'red' | 'green' | 'blue' | 'yellow' | 'orange' | 'purple';
export type ChipSize = '$2' | '$3' | '$4' | '$5';

export interface ChipProps {
  children: ReactNode;
  size?: ChipSize;
  variant?: ChipVariant;
  color?: ChipColor;
  /** Leading glyph (assist / input). Sized to the chip; omit to get a check when selected. */
  icon?: ReactNode;
  /** Selected/filter-on. Fill, never a selection border. */
  selected?: boolean;
  /** Press the pill (filter / assist). Makes the pill a keyboard stop. */
  onPress?: () => void;
  onDismiss?: () => void;
  disabled?: boolean;
  /** Cap the pill; the label ellipsizes. */
  maxWidth?: number | string;
}

// ── Color mappings ────────────────────────────────────────────

// Ghost/outlined text is small (12px) and must clear ≥4.5:1 on its own tint.
// Step-12 on step-4 is the pairing that clears AA in both schemes.
// Filled uses the Badge pairing: step-11 surface + `$color1` (≥4.5:1).
interface ChipSwatch {
  tint: ColorTokens;
  hoverTint: ColorTokens;
  fill: ColorTokens;
  fillText: ColorTokens;
  text: ColorTokens;
  border: ColorTokens;
}

const colorMap: Record<ChipColor, ChipSwatch> = {
  gray: {
    tint: '$color4',
    hoverTint: '$color5',
    fill: '$color11',
    fillText: '$color1',
    text: '$color12',
    border: '$color7',
  },
  red: {
    tint: '$red4',
    hoverTint: '$red5',
    fill: '$red11',
    fillText: '$color1',
    text: '$red12',
    border: '$red7',
  },
  green: {
    tint: '$green4',
    hoverTint: '$green5',
    fill: '$green11',
    fillText: '$color1',
    text: '$green12',
    border: '$green7',
  },
  blue: {
    tint: '$blue4',
    hoverTint: '$blue5',
    fill: '$blue11',
    fillText: '$color1',
    text: '$blue12',
    border: '$blue7',
  },
  yellow: {
    tint: '$yellow4',
    hoverTint: '$yellow5',
    fill: '$yellow11',
    fillText: '$color1',
    text: '$yellow12',
    border: '$yellow7',
  },
  orange: {
    tint: '$orange4',
    hoverTint: '$orange5',
    fill: '$orange11',
    fillText: '$color1',
    text: '$orange12',
    border: '$orange7',
  },
  purple: {
    tint: '$purple4',
    hoverTint: '$purple5',
    fill: '$purple11',
    fillText: '$color1',
    text: '$purple12',
    border: '$purple7',
  },
};

const TONE_BY_VARIANT = {
  filled: 'filled',
  solid: 'filled',
  outlined: 'outlined',
  outline: 'outlined',
  ghost: 'ghost',
  subtle: 'ghost',
} as const satisfies Record<ChipVariant, ChipTone>;

// oxlint-disable-next-line react-doctor/only-export-components -- shared tone resolver co-located with the component; consumers import both from this module
export const chipTone = (variant?: ChipVariant): ChipTone =>
  variant === undefined ? 'ghost' : TONE_BY_VARIANT[variant];

type SizeVal = string | number | null | undefined;

// ── Styled components ─────────────────────────────────────────

/**
 * Chip geometry rides the GENERATED `controlCompact` family:
 * padX / font / icon / inner gap come from the recipe table — no handwritten
 * per-size px map. The pill has no recipe height: it hugs its label, and the
 * vertical inset derives as a quarter of the recipe padX (preserves the
 * audited $3/$4 pill height). Module-eval objects so styled() can flatten
 * (pilot pattern: InputParts spreads `recipeFamilies.control.boxVariants`).
 * Kept in lockstep with the forms Chip.
 */
const CHIP_RECIPE_FAMILY = 'controlCompact' as const;
const CHIP_SIZE_TOKENS = ['$2', '$3', '$4', '$5'] as const;

const chipFrameGeometry = (token: string) => {
  const recipe = sizeRecipeForToken(token, { family: CHIP_RECIPE_FAMILY });
  return {
    paddingHorizontal: recipe.paddingHorizontal,
    paddingVertical: Math.round(recipe.paddingHorizontal * 0.25),
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

/**
 * Exported so chip-scale companions (e.g. the Tags "Add Tag" trigger) share
 * the exact same size variants — padding/font stay in lockstep with Chip for
 * every size token, all derived from `recipeFamilies.controlCompact`.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- styled() frame is shared with chip-scale companions (Tags); consumers import it with Chip from this module
export const ChipFrame = styled(View, {
  name: 'Chip',
  flexDirection: 'row',
  alignItems: 'center',
  ...chipFrameVariants.$3,
  // Every variant carries the same 1px border and only the colour changes.
  // Giving the border to `outline` alone made an outlined chip 2px taller
  // than a solid/subtle one at the same size token, so the moment the two
  // were composed side by side -- the Tags field puts its outlined "add"
  // trigger in the same row as its subtle tag chips -- their heights and
  // baselines came apart. The chip hugs its label, so nothing else pins the
  // box height back.
  borderWidth: 1,
  borderColor: 'transparent',
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },

  variants: {
    size: {
      ...chipFrameVariants,
      '...size': (val: SizeVal) => chipFrameGeometry(String(val ?? '$3')),
    },
    variant: {
      solid: {},
      filled: {},
      subtle: {},
      ghost: {},
      outline: {},
      outlined: {},
    },
  } as const,

  defaultVariants: {
    variant: 'ghost',
    size: '$3',
  },
});

// oxlint-disable-next-line react-doctor/only-export-components -- styled() label is shared with chip-scale companions (Tags); consumers import it with Chip from this module
export const ChipText = styled(Text, {
  name: 'ChipText',
  // Label weight is 400. Never 500, never 600.
  fontWeight: '400',
  numberOfLines: 1,
  userSelect: 'none',
  flexShrink: 1,
  minWidth: 0,
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

const IconSlot = styled(View, {
  name: 'ChipIcon',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

/** Icon size that pairs with each chip size — the generated recipe's icon channel. */
// oxlint-disable-next-line react-doctor/only-export-components -- size helper shared with chip-scale companions; consumers import it with Chip from this module
export const chipIconSize = (size: string): number => sizeRecipeForToken(size, { family: CHIP_RECIPE_FAMILY }).iconSize;

/**
 * Label size that pairs with each chip size — the generated recipe's font
 * channel, the same one `ChipText` rides.
 *
 * Exported for chip-scale companions that are not chips: the Tags field puts
 * a bare text input in the same row as its chips, and typing into it has to
 * land on the same optical line as the chip labels beside it.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- size helper shared with chip-scale companions; consumers import it with Chip from this module
export const chipTextSize = (size: string): number => sizeRecipeForToken(size, { family: CHIP_RECIPE_FAMILY }).fontSize;

// This box is the grown transparent press target (pressTargetStyle +
// compensating negative outsets + hitSlop at the call site). It stays
// UNPAINTED — hover/press feedback here is subtree opacity only.
const DismissButton = styled(View, {
  name: 'ChipDismiss',
  cursor: 'pointer',
  opacity: 0.7,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  outlineWidth: 0,
  hoverStyle: {
    opacity: 1,
  },
  pressStyle: {
    opacity: 0.9,
  },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: {
    opacity: 1,
    outlineWidth: 0,
  },
});

// The painted dismiss ring is glyph-scale. Keyboard outline rides
// `.mp-chip-dismiss-ring` (theme composite sheet), never the 44px floor.
const DismissRing = styled(View, {
  name: 'ChipDismissRing',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '$0.5',
  hoverStyle: {
    backgroundColor: '$color5',
  },
});

// Pitch-limited: wrapped chip rows sit `$2` apart, so each row's
// press target may reach half that gap before it meets the next row's. The
// outset stops there rather than at 44; no chip size paints tall enough for
// the half-gap to overshoot the floor. The slop pseudo-element is placed from
// the padding box, so the frame's own border width is added back.
const CHIP_ROW_GAP = '$2';

const chipBodySlop = (borderWidth: number): number => {
  // SAFETY: '$2' is a registered space token; getTokenValue's Token union is only a type-level subset of them
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the literal is not part of the generated Token union
  const gap: unknown = getTokenValue(CHIP_ROW_GAP as Parameters<typeof getTokenValue>[0], 'space');
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- getTokenValue resolves to a number or a raw string; only numbers are px
  return typeof gap === 'number' ? Math.floor(gap / 2) + Math.ceil(borderWidth) : 0;
};

const normalizeIcon = (icon: ReactNode, size: number): ReactNode => {
  if (icon == null || icon === false) {
    return null;
  }
  if (isValidElement<{ size?: number }>(icon)) {
    // oxlint-disable-next-line react/no-clone-element -- caller-supplied icon element must keep its own props, key and ref while gaining a default size
    return cloneElement(icon, { size: icon.props.size ?? size });
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant for icon components passed as a bare function
  if (typeof icon === 'function') {
    // SAFETY: a function-typed icon is a React component accepting an optional numeric size
    return createElement(icon as ComponentType<{ size?: number }>, { size });
  }
  return icon;
};

interface ChipPalette {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
}

const chipPalette = (
  isSelected: boolean,
  tone: ChipTone,
  colors: ChipSwatch,
  selectedFill: string,
  onSelectedLabel: string | undefined,
): ChipPalette => {
  if (isSelected) {
    return { backgroundColor: selectedFill, textColor: onSelectedLabel ?? colors.text, borderColor: 'transparent' };
  }
  if (tone === 'filled') {
    return { backgroundColor: colors.fill, textColor: colors.fillText, borderColor: 'transparent' };
  }
  if (tone === 'outlined') {
    return { backgroundColor: 'transparent', textColor: colors.text, borderColor: colors.border };
  }
  return { backgroundColor: colors.tint, textColor: colors.text, borderColor: 'transparent' };
};

const chipHoverBackground = (
  interactive: boolean,
  isSelected: boolean,
  tone: ChipTone,
  colors: ChipSwatch,
  selectedFill: string,
): string | null => {
  if (!interactive) {
    return null;
  }
  if (isSelected) {
    return selectedFill;
  }
  if (tone === 'outlined') {
    return colors.tint;
  }
  return tone === 'filled' ? colors.fill : colors.hoverTint;
};

const chipLeading = (icon: ReactNode, isSelected: boolean, iconSize: number): ReactNode => {
  if (icon != null) {
    return normalizeIcon(icon, iconSize);
  }
  return isSelected ? createElement(CheckIcon, { size: iconSize, weight: 'bold' }) : null;
};

const chipCursor = (disabled: boolean, interactive: boolean): 'not-allowed' | 'pointer' | 'default' => {
  if (disabled) {
    return 'not-allowed';
  }
  return interactive ? 'pointer' : 'default';
};

// CIRCULAR-AT-FULL. At full, 1000 paints the same h/2 circle
// and stays a token the constraint audit reads as a pill.
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

type ResolvedKnobs = ReturnType<typeof useResolvedKnobs>;

const interactiveAttrs = (hasSelection: boolean, isSelected: boolean, borderWidth: number) => ({
  role: 'button' as const,
  tabIndex: 0,
  ...(hasSelection ? { 'aria-pressed': isSelected } : undefined),
  ...pressSlopOutsetProps(chipBodySlop(borderWidth), 'vertical'),
});

const disabledAttrs = (isSelected: boolean, disabledState: ResolvedKnobs['disabledState']) => ({
  'aria-disabled': true,
  ...(isSelected ? disabledState.selectedSurfaceKnobProps : disabledState.surfaceKnobProps),
  ...disabledState.assemblyKnobProps,
});

const interactionStyleProps = (
  interactive: boolean,
  control: ResolvedKnobs['control'],
  hoverBackground: string | null,
  activate: () => void,
  onKeyDown: () => void,
) => {
  if (!interactive) {
    return { focusVisibleStyle: { outlineWidth: 0 } };
  }
  const hoverPaint = hoverBackground == null ? undefined : { backgroundColor: hoverBackground };
  return {
    hoverStyle: { ...control.hoverKnobProps, ...hoverPaint },
    pressStyle: { ...control.pressKnobProps, ...hoverPaint },
    focusVisibleStyle: ensureFocusVisibleRing(control.focusVisibleKnobProps),
    onPress: activate,
    ...(isWeb ? { onKeyDown } : undefined),
  };
};

const DISMISS_RING_INSET = 2;

interface ChipDismissProps {
  label: string;
  iconSize: number;
  borderRadius: string | number;
  onDismiss: () => void;
}

const ChipDismiss = ({ label, iconSize, borderRadius, onDismiss }: ChipDismissProps) => {
  const dismissVisual = iconSize + DISMISS_RING_INSET * 2;
  const dismissOutset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - dismissVisual) / 2));
  return (
    <DismissButton
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- DismissButton is a tamagui View; role carries the button semantics without changing the rendered element
      role="button"
      aria-label={label}
      tabIndex={0}
      className="mp-chip-dismiss"
      borderRadius={borderRadius}
      {...pressTargetStyle()}
      marginVertical={-dismissOutset}
      marginHorizontal={-dismissOutset}
      hitSlop={pressTargetHitSlop(dismissVisual)}
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
      <DismissRing
        className="mp-chip-dismiss-ring"
        borderRadius={borderRadius}>
        <XIcon size={iconSize} />
      </DismissRing>
    </DismissButton>
  );
};

// ── Chip Component ────────────────────────────────────────────

export const Chip = ({
  children,
  size,
  variant = 'ghost',
  color = 'gray',
  icon,
  selected,
  onPress,
  onDismiss,
  disabled = false,
  maxWidth,
}: ChipProps) => {
  const { t } = useTranslation();
  const { knobProps, control, disabledState } = useResolvedKnobs({ component: 'Chip' });
  const colors = colorMap[color] ?? colorMap.gray;
  const tone = chipTone(variant);
  const resolvedSize = size ?? knobProps.sizeToken;
  const selectedTint = useAccentTintedSurface();
  const selectedFill = selectedTint ?? colors.tint;
  const onSelectedLabel = useReadableTextOn(selectedFill);
  if (typeof document !== 'undefined') {
    ensureCompositeFocusRing();
  }

  const isSelected = Boolean(selected);
  const interactive = Boolean(onPress) && !disabled;
  const iconSize = chipIconSize(resolvedSize);
  const dismissRadius = resolveDismissRadius(knobProps.borderRadius.borderRadius);
  const { backgroundColor, textColor, borderColor } = chipPalette(
    isSelected,
    tone,
    colors,
    selectedFill,
    onSelectedLabel,
  );
  const hoverBackground = chipHoverBackground(interactive, isSelected, tone, colors, selectedFill);
  const leading = chipLeading(icon, isSelected, iconSize);
  const hasLeading = Boolean(leading);
  // IconSlot (styled View) has no `color`; Tamagui forwards it to set the
  // icon's inherited color at runtime.
  const iconSlotProps = { color: textColor };

  const activate = () => {
    if (!interactive) {
      return;
    }
    onPress?.();
  };

  const handleKeyDown = asKeyDownProp((e) => {
    if (e.defaultPrevented || e.repeat) {
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    e.preventDefault();
    activate();
  });

  return (
    <ChipFrame
      size={resolvedSize}
      variant={variant}
      backgroundColor={backgroundColor}
      {...knobProps.borderRadius}
      // Icon↔label gap is control-INTERNAL: it rides the recipe's gap
      // channel via the size variants above, not the layout space knob.
      borderColor={borderColor}
      // One box for every tone: the border is always painted and only its
      // colour changes. Giving the width to outlined chips alone made them
      // 2px taller than filled/subtle ones at the same size token, which is
      // visible the moment two tones share a row -- the Tags field puts its
      // outlined "add" trigger beside subtle tag chips.
      borderWidth={knobProps.borderRadius.borderWidth}
      transition={knobProps.transition}
      maxWidth={maxWidth}
      overflow="visible"
      cursor={chipCursor(disabled, interactive)}
      data-chip=""
      data-selected={isSelected ? 'true' : undefined}
      {...(interactive
        ? interactiveAttrs(selected != null, isSelected, knobProps.borderRadius.borderWidth)
        : undefined)}
      {...(disabled ? disabledAttrs(isSelected, disabledState) : undefined)}
      {...interactionStyleProps(interactive, control, hoverBackground, activate, handleKeyDown)}>
      {hasLeading ? <IconSlot {...iconSlotProps}>{leading}</IconSlot> : null}
      <ChipText
        size={resolvedSize}
        {...knobProps.body}
        // Boards measure ink.weight on the TEXT NODE. Label is 400.
        fontWeight="400"
        color={textColor}
        {...(disabled ? disabledState.textKnobProps : undefined)}>
        {children}
      </ChipText>
      {onDismiss != null && !disabled ? (
        <ChipDismiss
          label={t('Remove')}
          iconSize={iconSize}
          borderRadius={dismissRadius}
          onDismiss={onDismiss}
        />
      ) : null}
    </ChipFrame>
  );
};

export type ChipFrameProps = GetProps<typeof ChipFrame>;
