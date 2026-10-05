import { createAnimations } from '@tamagui/animations-css';

/**
 * The CSS driver's named durations.
 *
 * `bouncy`, `lazy`, `slow`, `medium` and `quick` are Tamagui's own names and
 * carry Tamagui's own values — a shared name that means something different
 * here is worse than no name, because every consumer reading `animation="medium"`
 * against the upstream docs gets a different answer than the one it renders.
 * `medium` was `ease-in-out 250ms` against stock `ease-in 300ms`,
 * with no improvement argument written down anywhere.
 *
 * `tooltip`, `snappy` and `gentle` are additive — names Tamagui does not use,
 * so they are ours to set and are not a contradiction.
 */
export const animationConfig = {
  bouncy: 'ease-in 200ms',
  lazy: 'ease-in 600ms',
  slow: 'ease-in 500ms',
  medium: 'ease-in 300ms',
  quick: 'ease-in 100ms',
  tooltip: 'ease-in 400ms',
  snappy: 'ease-out 80ms',
  gentle: 'ease-in-out 450ms',
} as const;

export type AnimationName = keyof typeof animationConfig;
export const animationNames = Object.keys(animationConfig) as AnimationName[];
export const animations = createAnimations(animationConfig);

function parseDurationMs(timing: string): number {
  const match = timing.match(/(\d+)\s*ms/);
  return match ? Number.parseInt(match[1], 10) : 200;
}

export const animationDurations: Record<AnimationName, number> = Object.fromEntries(
  Object.entries(animationConfig).map(([k, v]) => [k, parseDurationMs(v)]),
) as Record<AnimationName, number>;
