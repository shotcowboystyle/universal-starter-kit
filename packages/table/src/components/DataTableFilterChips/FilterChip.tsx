/**
 * FilterChip — one active filter as a pill (Polaris Index Filters / Linear).
 *
 * LC-71 RING-ANATOMY: two focusables, two rings. Chip press (edit) rings the
 * pill; dismiss rings the glyph, never the 44px hit box. Selected state is
 * the chip fill; no extra border on the row of siblings.
 */

import { XIcon } from '@phosphor-icons/react';
import { ChipFrame, ChipText, chipIconSize } from '@repo/forms';
import type { ChipSize } from '@repo/forms';
import {
  MIN_PRESS_TARGET,
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  pressTargetHitSlop,
  pressTargetStyle,
  useResolvedKnobs,
} from '@repo/theme';
import { View, styled, useTheme } from 'tamagui';

import { t } from '../../shared/t';

export interface FilterChipProps {
  label: string;
  onRemove: () => void;
  /** Chip press reopens the editor (Linear / Polaris tag click). */
  onPress?: () => void;
}

const DismissButton = styled(View, {
  name: 'FilterChipDismiss',
  cursor: 'pointer',
  opacity: 0.7,
  alignItems: 'center',
  justifyContent: 'center',
  outlineWidth: 0,
  hoverStyle: { opacity: 1 },
  pressStyle: { opacity: 0.9 },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { opacity: 1, outlineWidth: 0 },
});

const DismissRing = styled(View, {
  name: 'FilterChipDismissRing',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '$0.5',
  hoverStyle: { backgroundColor: '$color5' },
});

export const FilterChip = ({ label, onRemove, onPress }: FilterChipProps) => {
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  if (typeof document !== 'undefined') {
    ensureCompositeFocusRing();
  }

  // SAFETY: the knob size token is drawn from the same $1–$6 size scale Chip accepts; an empty token falls back to $3
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- knobs type the token as a generic size token, Chip narrows it to its own scale
  const resolvedSize = (knobProps.sizeToken as ChipSize) || '$3';
  const iconSize = chipIconSize(resolvedSize);
  const RING_INSET = 2;
  const dismissVisual = iconSize + RING_INSET * 2;
  const dismissOutset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - dismissVisual) / 2));
  const editable = onPress != null;

  return (
    <ChipFrame
      size={resolvedSize}
      variant="subtle"
      backgroundColor="$color4"
      {...knobProps.borderRadius}
      overflow="visible"
      data-filter-chip=""
      cursor={editable ? 'pointer' : 'default'}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      aria-label={editable ? t('Edit filter {{label}}', { label }) : undefined}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={editable ? ensureFocusVisibleRing() : undefined}
      hoverStyle={editable ? { backgroundColor: '$color5' } : undefined}
      onPress={onPress}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPress();
              }
            }
          : undefined
      }>
      <ChipText
        size={resolvedSize}
        color="$color12"
        {...knobProps.body}>
        {label}
      </ChipText>
      <DismissButton
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View renders on native too, where role is the only button semantic
        role="button"
        aria-label={t('Remove')}
        tabIndex={0}
        className="mp-chip-dismiss"
        borderRadius={knobProps.pointy ? 0 : 1000}
        {...pressTargetStyle()}
        marginVertical={-dismissOutset}
        marginHorizontal={-dismissOutset}
        hitSlop={pressTargetHitSlop(dismissVisual)}
        onPress={(e) => {
          e.stopPropagation?.();
          onRemove();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }
        }}>
        <DismissRing
          className="mp-chip-dismiss-ring"
          borderRadius={knobProps.pointy ? 0 : 1000}>
          <XIcon
            size={iconSize}
            color={String(theme.color12?.val ?? 'currentColor')}
          />
        </DismissRing>
      </DismissButton>
    </ChipFrame>
  );
};
