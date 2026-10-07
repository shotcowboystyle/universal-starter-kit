import { Text, XStack, YStack } from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';
import { Suspense, lazy } from 'react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

export interface RangeFilterProps {
  label: string;
  /** Current minimum; 0 is no minimum. */
  value: number;
  /** Upper bound of the slider. */
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

const readoutWidth = 44;
const trackMinWidth = 100;

// The forms Slider is not in the curated GNOME forms shim, so the row
// resolves lazily and checks the barrel: a target without a Slider renders
// no row (a label without its control is worse than nothing).
const RangeRowLazy = lazy(async () => {
  const forms = await import('@repo/forms');
  const MaybeSlider = (forms as Partial<typeof forms>).Slider;
  if (!MaybeSlider) {
    const Absent: ComponentType<RangeFilterProps> = () => null;
    return { default: Absent };
  }
  const Slider = MaybeSlider;

  function RangeRow({ label, value, max, step = 5, onChange }: RangeFilterProps) {
    const { t } = useTranslation();
    const { knobProps } = useResolvedKnobs();
    return (
      <XStack
        {...knobProps.gap}
        alignItems="center"
        flexGrow={1}
        minWidth={0}>
        <Text
          fontSize="$2"
          color="$color11"
          flexShrink={0}
          userSelect="none">
          {label}
        </Text>
        {/* A column on purpose: the Slider's %-width chain collapses to 0
            inside a row; a column's cross-axis stretch hands the track the
            flexed width. */}
        <YStack
          flexGrow={1}
          flexShrink={1}
          minWidth={trackMinWidth}
          justifyContent="center">
          <Slider
            value={[value]}
            min={0}
            max={max}
            step={step}
            onChange={(values) => {
              if (typeof values[0] === 'number') {
                onChange(values[0]);
              }
            }}
            aria-label={label}
            compact
          />
        </YStack>
        <Text
          fontSize="$2"
          fontWeight="600"
          color={value > 0 ? '$color12' : '$color10'}
          minWidth={readoutWidth}
          textAlign="right"
          userSelect="none">
          {value > 0 ? `${value}+` : t('Any')}
        </Text>
      </XStack>
    );
  }
  return { default: RangeRow };
});

/** A "minimum value" filter for a numeric field: label, slider, readout. */
export function RangeFilter(props: RangeFilterProps) {
  return (
    <Suspense fallback={null}>
      <RangeRowLazy {...props} />
    </Suspense>
  );
}

/** A slider ceiling that follows the data, rounded up to a tidy stop. */
export function rangeCeiling(highest: number, stop = 25, floor = 50): number {
  return Math.max(floor, Math.ceil(Math.max(0, highest) / stop) * stop);
}
