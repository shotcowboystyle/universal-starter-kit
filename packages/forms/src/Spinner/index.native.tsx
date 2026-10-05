import { useResolvedKnobs } from '@repo/theme';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { View } from 'tamagui';

import { t } from '../shared/t';

import { SpinnerGlyph, useSpinnerStroke } from './SpinnerGlyph';
import { spinnerSizePx, spinnerSizeToken, type SpinnerProps } from './spinnerSize';

export type { SpinnerProps, SpinnerSize } from './spinnerSize';

const SPIN_MS = 700;

/** Native Spinner. Size follows the shared size-token scale; spin gates on transition. */
export function Spinner({ size, color, ...props }: SpinnerProps) {
  const { knobProps } = useResolvedKnobs();
  const token = spinnerSizeToken(size, knobProps.sizeToken);
  const px = spinnerSizePx(token);
  const stroke = useSpinnerStroke(color);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) {
        setReduceMotion(value);
      }
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  const spinning = Boolean(knobProps.transition) && !reduceMotion;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spinning) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SPIN_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
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
      role="status"
      aria-label={t('Loading')}
      aria-live="polite"
      aria-busy
      pointerEvents="none"
      data-size={token}
      data-animation={spinning ? 'spin' : 'none'}
      {...props}>
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <SpinnerGlyph color={stroke} size={px} />
      </Animated.View>
    </View>
  );
}
