import { useResolvedKnobs } from '@repo/theme';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { View } from 'tamagui';

import { t } from '../shared/t';

import { spinnerSizePx, spinnerSizeToken } from './spinner-size';
import type { SpinnerProps } from './spinner-size';
import { SpinnerGlyph, useSpinnerStroke } from './SpinnerGlyph';

export type { SpinnerProps, SpinnerSize } from './spinner-size';

const SPIN_MS = 700;

/** Native Spinner. Size follows the shared size-token scale; spin gates on transition. */
export const Spinner = ({ size, color, ...props }: SpinnerProps) => {
  const { knobProps } = useResolvedKnobs();
  const token = spinnerSizeToken(size, knobProps.sizeToken);
  const px = spinnerSizePx(token);
  const stroke = useSpinnerStroke(color);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const syncReduceMotion = async () => {
      const value = await AccessibilityInfo.isReduceMotionEnabled();
      if (!cancelled) {
        setReduceMotion(value);
      }
    };
    void syncReduceMotion();
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  const spinning = knobProps.transition != null && !reduceMotion;
  const spin = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = spinning
      ? Animated.loop(
          Animated.timing(spin, {
            toValue: 1,
            duration: SPIN_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        )
      : undefined;
    loop?.start();
    return () => {
      loop?.stop();
      spin.setValue(0);
    };
  }, [spinning, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      width={px}
      height={px}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- React Native View has no <output> element
      role="status"
      aria-label={t('Loading')}
      aria-live="polite"
      aria-busy
      pointerEvents="none"
      data-size={token}
      data-animation={spinning ? 'spin' : 'none'}
      {...props}>
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <SpinnerGlyph
          color={stroke}
          size={px}
        />
      </Animated.View>
    </View>
  );
};
