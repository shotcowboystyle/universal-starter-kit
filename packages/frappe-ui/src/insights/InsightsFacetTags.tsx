import {
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { Tags, Text, XStack, isWeb } from '@repo/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { InsightsCount } from './insights-data';

const chipFocusRing = ensureFocusVisibleRing(keyboardFocusRingProps);

interface FacetTagChipProps {
  value: string;
  count: number;
  label: string;
  tint?: string;
  onPress: () => void;
  testID?: string;
}

/**
 * A pressable facet value painted from its tint's ramp (DF-04), at the
 * compact nestedControl height with the press target restored by hitSlop
 * (LC-54, LC-73); the keyboard ring rides the whole chip (LC-71).
 */
const FacetTagChip = ({ value, count, label, tint = 'gray', onPress, testID }: FacetTagChipProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact: true });
  const nested = knobProps.nestedControl;
  const [kbFocus, setKbFocus] = useState(false);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  // SAFETY: every tint names a theme palette, so `$<tint><step>` is a defined color token
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const tone = (step: number) => `$${tint}${step}` as never;
  return (
    <XStack
      {...knobProps.borderRadius}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack renders a div; role/tabIndex/Enter+Space give it button semantics
      role="button"
      tabIndex={0}
      aria-label={t('{{value}}, {{count}} records', { value: label, count })}
      cursor="pointer"
      alignItems="center"
      gap="$1.5"
      paddingHorizontal="$2"
      minHeight={nested.px}
      height={nested.px}
      hitSlop={nested.hitSlop}
      data-nested-px={nested.px}
      backgroundColor={tone(3)}
      hoverStyle={{ backgroundColor: tone(4) }}
      pressStyle={{ backgroundColor: tone(5) }}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={chipFocusRing}
      {...(isWeb
        ? {
            onFocus: () => {
              if (wasKeyboardFocus()) {
                setKbFocus(true);
              }
            },
            onBlur: () => {
              setKbFocus(false);
            },
            onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault?.();
                onPress();
              }
            },
          }
        : undefined)}
      {...(kbFocus ? keyboardFocusRingProps : undefined)}
      onPress={onPress}
      testID={testID !== undefined && testID !== '' ? `${testID}-${value}` : undefined}>
      <XStack
        width="$1"
        height="$1"
        borderRadius={1000}
        backgroundColor={tone(9)}
        flexShrink={0}
      />
      <Text
        {...knobProps.label}
        fontWeight="600"
        color={tone(11)}
        textTransform="capitalize"
        userSelect="none">
        {label}
      </Text>
      <Text
        {...knobProps.label}
        color={tone(11)}
        opacity={0.7}
        userSelect="none">
        {count}
      </Text>
    </XStack>
  );
};

export interface InsightsFacetTagsProps {
  distribution: readonly InsightsCount[];
  label: (value: string) => string;
  tint?: (value: string) => string | undefined;
  onSelect: (value: string) => void;
  testID?: string;
}

/** A facet's values with their record counts, each opening the list narrowed to it. */
export const InsightsFacetTags = ({ distribution, label, tint, onSelect, testID }: InsightsFacetTagsProps) => {
  const { t } = useTranslation();
  return (
    <Tags
      tags={distribution.map((entry) => ({ id: entry.value, label: label(entry.value) }))}
      enableAdd={false}
      enableRemove={false}
      labels={{ noTags: t('No values yet') }}
      renderTag={(tag) => (
        <FacetTagChip
          value={tag.id}
          count={distribution.find((entry) => entry.value === tag.id)?.count ?? 0}
          label={tag.label}
          tint={tint?.(tag.id)}
          onPress={() => {
            onSelect(tag.id);
          }}
          testID={testID}
        />
      )}
    />
  );
};
