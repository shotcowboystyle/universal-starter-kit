import { createAnimations } from '@tamagui/animations-react-native';

/**
 * Canonical spring vocabulary. Exported so native gesture code can drive
 * RN `Animated.spring` (which provides completion callbacks) with the exact
 * same physics as Tamagui's `transition` tokens — one closed vocabulary.
 */
export const animationConfig = {
  bouncy: {
    type: 'spring',
    damping: 9,
    mass: 0.9,
    stiffness: 150,
  },
  lazy: {
    type: 'spring',
    damping: 18,
    stiffness: 50,
  },
  slow: {
    type: 'spring',
    damping: 15,
    stiffness: 40,
  },
  medium: {
    type: 'spring',
    damping: 15,
    mass: 1,
    stiffness: 120,
  },
  quick: {
    type: 'spring',
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  tooltip: {
    type: 'spring',
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  snappy: {
    type: 'spring',
    damping: 28,
    mass: 0.8,
    stiffness: 350,
  },
  gentle: {
    type: 'spring',
    damping: 12,
    mass: 1.4,
    stiffness: 60,
  },
} as const;

export type AnimationName = keyof typeof animationConfig;
export const animationNames = Object.keys(animationConfig) as AnimationName[];
export const animations = createAnimations(animationConfig);
