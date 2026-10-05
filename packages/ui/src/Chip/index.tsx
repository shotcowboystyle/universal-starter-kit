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
import { cloneElement, createElement, isValidElement, type ComponentType, type ReactNode } from 'react';
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

export function chipTone(variant: ChipVariant | undefined): ChipTone {
  switch (variant) {
    case 'filled':
    case 'solid':
      return 'filled';
    case 'outlined':
    case 'outline':
      return 'outlined';
    default:
      return 'ghost';
  }
}

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

function chipFrameGeometry(token: string) {
  const recipe = sizeRecipeForToken(token, { family: CHIP_RECIPE_FAMILY });
  return {
    paddingHorizontal: recipe.paddingHorizontal,
    paddingVertical: Math.round(recipe.paddingHorizontal * 0.25),
    gap: recipe.gap,
  };
}

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
      '...size': (val: unknown) => chipFrameGeometry(String(val ?? '$3')),
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
      '...size': (val: unknown) => ({
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
export function chipIconSize(size: ChipSize): number {
  return sizeRecipeForToken(size, { family: CHIP_RECIPE_FAMILY }).iconSize;
}

/**
 * Label size that pairs with each chip size — the generated recipe's font
 * channel, the same one `ChipText` rides.
 *
 * Exported for chip-scale companions that are not chips: the Tags field puts
 * a bare text input in the same row as its chips, and typing into it has to
 * land on the same optical line as the chip labels beside it.
 */
export function chipTextSize(size: ChipSize): number {
  return sizeRecipeForToken(size, { family: CHIP_RECIPE_FAMILY }).fontSize;
}

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

function chipBodySlop(borderWidth: number): number {
  const gap = getTokenValue(CHIP_ROW_GAP as Parameters<typeof getTokenValue>[0], 'space');
  return typeof gap === 'number' ? Math.floor(gap / 2) + Math.ceil(borderWidth) : 0;
}

function normalizeIcon(icon: ReactNode, size: number): ReactNode {
  if (icon == null || icon === false) {
    return null;
  }
  if (isValidElement(icon)) {
    const props = icon.props as { size?: number };
    return cloneElement(icon, { size: props.size ?? size } as object);
  }
  if (typeof icon === 'function') {
    return createElement(icon as ComponentType<{ size?: number }>, { size });
  }
  return icon;
}

// ── Chip Component ────────────────────────────────────────────

export function Chip({
  children,
  size,
  variant = 'ghost',
  color = 'gray',
  icon,
  selected,
  onPress,
  onDismiss,
  disabled,
  maxWidth,
}: ChipProps) {
  const { t } = useTranslation();
  const { knobProps, control, disabledState } = useResolvedKnobs({ component: 'Chip' });
  const colors = colorMap[color] ?? colorMap.gray;
  const tone = chipTone(variant);
  const resolvedSize = size ?? (knobProps.sizeToken as ChipSize);
  const selectedTint = useAccentTintedSurface();
  const selectedFill = selectedTint ?? colors.tint;
  const onSelectedLabel = useReadableTextOn(selectedFill);
  if (typeof document !== 'undefined') {
    ensureCompositeFocusRing();
  }

  const isSelected = Boolean(selected);
  const interactive = Boolean(onPress) && !disabled;
  const showDismiss = Boolean(onDismiss) && !disabled;
  const iconSize = chipIconSize(resolvedSize);
  const RING_INSET = 2;
  const dismissVisual = iconSize + RING_INSET * 2;
  const dismissOutset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - dismissVisual) / 2));
  // CIRCULAR-AT-FULL. At full, 1000 paints the same h/2 circle
  // and stays a token the constraint audit reads as a pill.
  const dismissStop = radiusStopFromToken(knobProps.borderRadius.borderRadius);
  let dismissRadius: string | number = knobProps.borderRadius.borderRadius;
  if (dismissStop === 'full') {
    dismissRadius = 1000;
  } else if (dismissStop) {
    dismissRadius = resolveRadiusClass('CIRCULAR-AT-FULL', dismissStop);
  }

  let backgroundColor: ColorTokens | 'transparent' | string = colors.tint;
  let textColor: ColorTokens | string = colors.text;
  let borderColor: ColorTokens | 'transparent' = 'transparent';

  if (isSelected) {
    backgroundColor = selectedFill;
    textColor = onSelectedLabel ?? colors.text;
    borderColor = 'transparent';
  } else if (tone === 'filled') {
    backgroundColor = colors.fill;
    textColor = colors.fillText;
    borderColor = 'transparent';
  } else if (tone === 'outlined') {
    backgroundColor = 'transparent';
    textColor = colors.text;
    borderColor = colors.border;
  }

  const hoverBackground = interactive
    ? isSelected
      ? selectedFill
      : tone === 'outlined'
        ? colors.tint
        : tone === 'filled'
          ? colors.fill
          : colors.hoverTint
    : undefined;

  const leading =
    icon != null
      ? normalizeIcon(icon, iconSize)
      : isSelected
        ? createElement(CheckIcon, { size: iconSize, weight: 'bold' })
        : null;

  const activate = () => {
    if (!interactive) {
      return;
    }
    onPress?.();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat) {
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    e.preventDefault();
    activate();
  };

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
      cursor={disabled ? 'not-allowed' : interactive ? 'pointer' : 'default'}
      data-chip=""
      data-selected={isSelected ? 'true' : undefined}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            ...(selected != null ? { 'aria-pressed': isSelected } : undefined),
            ...pressSlopOutsetProps(chipBodySlop(knobProps.borderRadius.borderWidth), 'vertical'),
          }
        : undefined)}
      {...(disabled
        ? {
            'aria-disabled': true,
            ...(isSelected ? disabledState.selectedSurfaceKnobProps : disabledState.surfaceKnobProps),
            ...disabledState.assemblyKnobProps,
          }
        : undefined)}
      hoverStyle={
        interactive
          ? {
              ...control.hoverKnobProps,
              ...(hoverBackground != null ? { backgroundColor: hoverBackground } : undefined),
            }
          : undefined
      }
      pressStyle={
        interactive
          ? {
              ...control.pressKnobProps,
              ...(hoverBackground != null ? { backgroundColor: hoverBackground } : undefined),
            }
          : undefined
      }
      focusVisibleStyle={interactive ? ensureFocusVisibleRing(control.focusVisibleKnobProps) : { outlineWidth: 0 }}
      onPress={interactive ? activate : undefined}
      {...(interactive && isWeb ? { onKeyDown: handleKeyDown as unknown as () => void } : undefined)}>
      {leading ? (
        // IconSlot (styled View) has no `color`; Tamagui forwards it to set the
        // icon's inherited color at runtime (house Record cast).
        <IconSlot {...({ color: textColor } as Record<string, unknown>)}>{leading}</IconSlot>
      ) : null}
      <ChipText
        size={resolvedSize}
        {...knobProps.body}
        // Boards measure ink.weight on the TEXT NODE. Label is 400.
        fontWeight="400"
        color={textColor as ColorTokens}
        {...(disabled ? disabledState.textKnobProps : undefined)}>
        {children}
      </ChipText>
      {showDismiss ? (
        <DismissButton
          role="button"
          aria-label={t('Remove')}
          tabIndex={0}
          className="mp-chip-dismiss"
          borderRadius={dismissRadius}
          {...pressTargetStyle()}
          marginVertical={-dismissOutset}
          marginHorizontal={-dismissOutset}
          hitSlop={pressTargetHitSlop(dismissVisual)}
          onPress={(e) => {
            e.stopPropagation?.();
            onDismiss?.();
          }}
          onKeyDown={
            ((e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onDismiss?.();
              }
            }) as unknown as () => void
          }>
          <DismissRing className="mp-chip-dismiss-ring" borderRadius={dismissRadius}>
            <XIcon size={iconSize} />
          </DismissRing>
        </DismissButton>
      ) : null}
    </ChipFrame>
  );
}

export type ChipFrameProps = GetProps<typeof ChipFrame>;
