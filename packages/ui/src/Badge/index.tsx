import { radiusClassProps, useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorTokens, FontSizeTokens, GetProps } from 'tamagui';
import { Text, View, isWeb, styled } from 'tamagui';

import { componentColors } from '../componentColors';
import { useDirection } from '../hooks/useDirection';
import { useAsyncBoundary } from '../layouts/AsyncBoundary';
import { bidiIsolate } from '../shared/t';

// ── Types ─────────────────────────────────────────────────────

export type BadgeVariant = 'dot' | 'count';
export type BadgeColor = 'red' | 'blue' | 'green' | 'orange' | 'gray';
export type BadgePosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface BadgeProps {
  /** Host to overlay. Omit for a Primer CounterLabel-style standalone pill. */
  children?: ReactNode;
  /** Count to display. Hidden when 0/undefined unless `showZero` or `dot`. */
  count?: number;
  /** Overflow cap. Counts above this render as `max+` (Primer/Carbon). */
  max?: number;
  /** Show the pill when `count` is 0. */
  showZero?: boolean;
  /** Ambient presence mark (Ant/Carbon: low-weight signal, not a precise count). */
  dot?: boolean;
  /** Badge color */
  color?: BadgeColor;
  /** Corner the overlay hangs from. Logicalized in RTL (end/start). */
  position?: BadgePosition;
  /** Extra outward offset from the hung corner `[x, y]` in pixels. */
  offset?: [number, number];
  /** Whether the badge is visible */
  visible?: boolean;
  /** Compact density override (wins over the density knob). */
  compact?: boolean;
  /**
   * Accessible name. Overflowed counts default to the exact number (Carbon
   * tooltip / Primer accessible name), not the visible `max+` string.
   */
  accessibilityLabel?: string;
}

// ── Color mappings ────────────────────────────────────────────

// $color1 flips with the scheme (near-white in light, near-black in dark),
// pairing with the step-11 badge surfaces for >=4.5:1 count text (SB-R-02).
const colorMap: Record<BadgeColor, { bg: ColorTokens; text: ColorTokens }> = {
  red: { bg: componentColors.badge.red, text: '$color1' },
  blue: { bg: componentColors.badge.blue, text: '$color1' },
  green: { bg: componentColors.badge.green, text: '$color1' },
  orange: { bg: componentColors.badge.orange, text: '$color1' },
  gray: { bg: componentColors.badge.gray, text: '$color1' },
};

// ── Size mappings ─────────────────────────────────────────────

// R-PILL: size knob moves diameter, padding, and type — never shape.
// Capsule stays well below the 44px control floor (ornamental overlay, not a
// press target — same contract as DotIndicator). Compact/density steps
// `sizeToken` down via useResolvedKnobs, so this table only ever shrinks.
const badgeGeometryMap: Record<string, { capsule: number; font: FontSizeTokens; pad: number; dot: number }> = {
  $3: { capsule: 16, font: '$1', pad: 4, dot: 6 },
  $4: { capsule: 18, font: '$1', pad: 5, dot: 8 },
  $5: { capsule: 22, font: '$2', pad: 6, dot: 10 },
};

/** Primer Counter / Carbon notification: canvas hairline so the fill separates from any host. */
const CONTRAST_RING = 2;

// ── Styled components ─────────────────────────────────────────

const BadgeWrapper = styled(View, {
  name: 'BadgeWrapper',
  position: 'relative',
  display: 'inline-flex',
  alignSelf: 'flex-start',
  overflow: 'visible',
});

const BadgeIndicator = styled(View, {
  name: 'BadgeIndicator',
  // R-PILL: the count/dot is a pill at every radius value;
  // the knob moves its size and padding, never its shape.
  ...radiusClassProps('R-PILL', 'Badge count/dot'),
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 1000,
  borderWidth: CONTRAST_RING,
  borderColor: '$color1',
  borderStyle: 'solid',
  zIndex: 1,
  // Orbit/Primer: badges are not actionable — clicks hit the host.
  pointerEvents: 'none',
});

const BadgeText = styled(Text, {
  name: 'BadgeText',
  // SB-M-101: Badge owns weight 600. bodyFont may restyle family; fontWeight
  // is re-pinned after `{...knobProps.body}` so the knob cannot leak.
  fontWeight: '600',
  textAlign: 'center',
  pointerEvents: 'none',
});

// ── Helpers ───────────────────────────────────────────────────

function normalizeCount(count: number | undefined): number | undefined {
  if (count === undefined || !Number.isFinite(count)) {
    return undefined;
  }
  return Math.max(0, Math.floor(count));
}

function normalizeMax(max: number): number {
  if (!Number.isFinite(max) || max < 0) {
    return 99;
  }
  return Math.floor(max);
}

function indicatorPlacement(position: BadgePosition, isRTL: boolean, overlap: number, offset: [number, number]) {
  const atEnd = position.includes('right');
  const atTop = position.includes('top');
  const [ox, oy] = offset;
  const inlineProp = atEnd === !isRTL ? 'right' : 'left';
  const dirX = inlineProp === 'right' ? 1 : -1;
  const dirY = atTop ? -1 : 1;
  return {
    position: 'absolute' as const,
    [atTop ? 'top' : 'bottom']: 0,
    [inlineProp]: 0,
    transform: [{ translateX: dirX * (overlap + ox) }, { translateY: dirY * (overlap + oy) }],
  };
}

// ── Badge Component ───────────────────────────────────────────

export function Badge({
  children,
  count,
  max = 99,
  showZero = false,
  dot = false,
  color = 'red',
  position = 'top-right',
  offset = [0, 0],
  visible = true,
  compact,
  accessibilityLabel,
}: BadgeProps) {
  const { t } = useTranslation();
  const isRTL = useDirection() === 'rtl';
  const { knobProps } = useResolvedKnobs({ component: 'Badge', compact });
  const colors = colorMap[color];
  const geometry = badgeGeometryMap[knobProps.sizeToken] ?? badgeGeometryMap.$4;
  // Degrade — hide counts/badges when a parent AsyncBoundary failed.
  const asyncCtx = useAsyncBoundary();
  const effectiveVisible = visible && !asyncCtx?.hideBadges;
  const effectiveCount = asyncCtx?.hideBadges ? undefined : normalizeCount(count);
  const cap = normalizeMax(max);
  const standalone = children == null;

  const shouldShow = effectiveVisible && (dot || (effectiveCount !== undefined && (effectiveCount > 0 || showZero)));

  const overflowed = effectiveCount !== undefined && effectiveCount > cap;
  const displayValue = overflowed ? `${cap}+` : effectiveCount;
  const painted = dot ? geometry.dot : geometry.capsule;
  // Material/Ant overlay: hang 50% off the corner. Standalone CounterLabel sits in flow.
  const overlap = standalone ? 0 : painted / 2;

  const a11yLabel =
    accessibilityLabel ??
    (dot ? t('New activity') : overflowed && effectiveCount !== undefined ? String(effectiveCount) : undefined);

  if (!shouldShow) {
    return standalone ? null : <BadgeWrapper>{children}</BadgeWrapper>;
  }

  const indicator = (
    <BadgeIndicator
      backgroundColor={colors.bg}
      minWidth={painted}
      height={painted}
      {...(dot ? { width: painted, paddingHorizontal: 0 } : { paddingHorizontal: geometry.pad })}
      {...(standalone ? undefined : indicatorPlacement(position, isRTL, overlap, offset))}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={a11yLabel}
      {...(isWeb && overflowed && effectiveCount !== undefined ? { title: String(effectiveCount) } : undefined)}
      {...({
        'data-badge': dot ? 'dot' : 'count',
        ...(overflowed ? { 'data-overflow': 'true' } : {}),
      } as Record<string, string>)}>
      {/* T-BODY family from the body knob; weight re-pinned at 600 so the
          fontWeight knob cannot leak over the badge-owned weight (SB-M-101).
          Size token still owns fontSize; the badge palette owns color. */}
      {!dot && effectiveCount !== undefined && (
        <BadgeText
          fontSize={geometry.font}
          lineHeight={Math.max(1, painted - CONTRAST_RING * 2)}
          {...knobProps.body}
          fontWeight="600"
          color={colors.text}
          {...({ 'data-body-font': knobProps.body.fontFamily } as Record<string, string>)}>
          {bidiIsolate(String(displayValue))}
        </BadgeText>
      )}
    </BadgeIndicator>
  );

  if (standalone) {
    return indicator;
  }

  return (
    <BadgeWrapper>
      {children}
      {indicator}
    </BadgeWrapper>
  );
}

export type BadgeWrapperProps = GetProps<typeof BadgeWrapper>;
export type BadgeIndicatorProps = GetProps<typeof BadgeIndicator>;
