import type { FontSizeTokens, SizeTokens } from 'tamagui';
import { Paragraph, View, styled } from 'tamagui';

import { formCardColors, formCommonColors } from '../../shared/colorRamps';

/**
 * SELECTION-CARD anatomy: the control sits in a fixed leading slot,
 * top-aligned with the first label line; the bold label sits immediately to
 * its right; the muted description sits under the label sharing the label's
 * left edge. Compact padding, whole card interactive. Shared by the compound
 * `Checkboxes.Card`, `CheckboxGroup card`, and `RadioGroup card`.
 */
export const CheckboxCardFrame = styled(View, {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: '$3',
  cursor: 'pointer',
  width: '100%',
  paddingVertical: '$3',
  paddingHorizontal: '$3.5',
  backgroundColor: formCardColors.background.base,
  borderColor: formCardColors.border.base,
  borderWidth: 1,
  hoverStyle: {
    borderColor: formCardColors.border.hover,
  },
  variants: {
    active: {
      true: {
        // Selected = fill, not an extra border on the card.
        backgroundColor: formCardColors.background.active,
      },
    },
  } as const,
});

/** Text column right of the control: label line, then description. */
export const CheckboxCardContent = styled(View, {
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  gap: '$0.5',
});

/** Bold first line, right of the control. */
export const CheckboxCardLabel = styled(Paragraph, {
  fontWeight: '600',
  color: '$color12',
  lineHeight: 20,
});

/** Muted helper-tier line under the label, sharing its left edge. */
export const CheckboxCardDescription = styled(Paragraph, {
  color: formCommonColors.muted,
});

const helperSizeMap: Record<string, FontSizeTokens> = {
  $1: '$1',
  $2: '$1',
  $3: '$2',
  $4: '$3',
  $true: '$3',
  $5: '$4',
  $6: '$5',
};

/** T-HELPER tier for the description, one step under the field size. */
export function getCardDescriptionSize(size?: SizeTokens): FontSizeTokens {
  if (!size) {
    return '$2';
  }
  return helperSizeMap[String(size)] ?? '$2';
}

/**
 * Compact card metrics from the space knob (~$3/$3.5 vertical) — deliberately
 * tighter than `panelPadding`, which is panel-scale and reads as dead space
 * around a single row of text.
 */
export function getCheckboxCardLayout(space: string): {
  paddingVertical: string;
  paddingHorizontal: string;
  gap: string;
} {
  const map: Record<string, { paddingVertical: string; paddingHorizontal: string; gap: string }> = {
    none: { paddingVertical: '$2.5', paddingHorizontal: '$3', gap: '$2.5' },
    small: { paddingVertical: '$3', paddingHorizontal: '$3.5', gap: '$3' },
    medium: { paddingVertical: '$3', paddingHorizontal: '$3.5', gap: '$3' },
    large: { paddingVertical: '$3.5', paddingHorizontal: '$4', gap: '$3.5' },
  };
  return map[space] ?? map.medium;
}
