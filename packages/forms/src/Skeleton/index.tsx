import { radiusClassProps, sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import type { GetProps } from 'tamagui';
import { View, styled, isWeb } from 'tamagui';

// ── Types ─────────────────────────────────────────────────────

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

export interface SkeletonProps extends Omit<GetProps<typeof SkeletonFrame>, 'variant'> {
  variant?: SkeletonVariant;
  /** Width of the skeleton. Can be a number (pixels) or string (e.g., "100%") */
  width?: number | string;
  /** Height of the skeleton. Can be a number (pixels) or string */
  height?: number | string;
  /** Whether to animate the skeleton */
  animate?: boolean;
}

// ── Styled component ──────────────────────────────────────────

const SkeletonFrame = styled(View, {
  name: 'Skeleton',
  backgroundColor: '$color5',

  variants: {
    variant: {
      text: {
        borderRadius: '$2',
        height: 16,
      },
      circular: {
        borderRadius: 1000,
      },
      rectangular: {
        borderRadius: 0,
      },
      rounded: {
        borderRadius: '$3',
      },
    },
  } as const,

  defaultVariants: {
    variant: 'text',
  },
});

// Size-knob geometry (spec: Skeleton block/text/circle scale with
// `sizeToken`), DERIVED from the generated size recipe: a text bone
// is the token's recipe fontSize + 2px of line-box rounding (medium keeps
// the previous 16px line), and a circle bone is the medallion one height
// step above the control ramp (medium keeps the previous 40px circle).
const SKELETON_SIZE_TOKENS = ['$3', '$4', '$5'] as const;
const skeletonCircleTokenUp: Record<string, string> = { $3: '$4', $4: '$5', $5: '$6' };

function skeletonTextHeight(sizeToken: string): number | undefined {
  if (!(SKELETON_SIZE_TOKENS as readonly string[]).includes(sizeToken)) {
    return undefined;
  }
  return sizeRecipeForToken(sizeToken).fontSize + 2;
}

function skeletonCircleSize(sizeToken: string): number {
  return sizeRecipeForToken(skeletonCircleTokenUp[sizeToken] ?? '$5').height;
}
// SP-GAP: text-line gap follows the space knob; medium keeps $2.
const skeletonGapMap: Record<string, string> = { small: '$1', medium: '$2', large: '$3' };

// Self-contained pulse keyframes: the app root layout injects the same rule,
// but Skeleton must not depend on a particular host (Storybook, tests, docs).
const PULSE_STYLE_ID = '__mp-skeleton-pulse';
function ensurePulseKeyframes() {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(PULSE_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = '@keyframes skeleton-pulse{0%{opacity:1}50%{opacity:0.4}100%{opacity:1}}';
  document.head.appendChild(style);
}

// ── Skeleton Component ────────────────────────────────────────

export function Skeleton({ variant = 'text', width, height, animate = true, style, ...props }: SkeletonProps) {
  const { knobProps } = useResolvedKnobs();
  // Pulse only when animating is on AND the animation knob is not "none"
  // (knobProps.transition resolves to undefined at animation:none).
  const pulsing = animate && knobProps.transition !== undefined;
  if (pulsing) {
    ensurePulseKeyframes();
  }

  // Merge pulse last into `style` so a consumer style prop cannot kill the
  // animation (animation:none stops the pulse via the knob; otherwise
  // it must run).
  const mergedStyle =
    isWeb && pulsing ? { ...(style as object), animation: 'skeleton-pulse 1.5s ease-in-out infinite' } : style;

  return (
    <SkeletonFrame
      variant={variant}
      width={width}
      // Text lines follow the size knob; explicit height ejects.
      height={height ?? (variant === 'text' ? skeletonTextHeight(knobProps.sizeToken) : undefined)}
      // Radius only — a skeleton is a flat blob, it never draws the knob's border.
      // Consumers that clamp (Checkbox/Radio/Switch) pass an explicit borderRadius
      // which wins via ...props below.
      // Text lines and rounded blocks ride DEFAULT: the token at every stop, the paint capping at h/2.
      {...(variant === 'rounded' || variant === 'text'
        ? { borderRadius: knobProps.borderRadius.borderRadius }
        : undefined)}
      // R-PILL (spec Skeleton "circle"): the circular variant stays 1:1 and
      // round at every radius value, so it declares the class the
      // `radius:none` sweep licenses it under.
      {...(variant === 'circular' ? radiusClassProps('R-PILL', 'SkeletonCircle') : undefined)}
      {...props}
      {...(mergedStyle ? { style: mergedStyle } : undefined)}
    />
  );
}

// ── Skeleton.Text - for text placeholder ──────────────────────

export function SkeletonText({
  lines = 1,
  gap: gapProp,
  lastLineWidth = '70%',
  ...props
}: SkeletonProps & {
  lines?: number;
  gap?: string | number;
  lastLineWidth?: string | number;
}) {
  const { knobProps } = useResolvedKnobs();
  const gap = gapProp ?? skeletonGapMap[knobProps.space] ?? '$2';
  if (lines === 1) {
    return <Skeleton variant="text" width={lastLineWidth} {...props} />;
  }

  return (
    <View gap={gap}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? lastLineWidth : '100%'} {...props} />
      ))}
    </View>
  );
}

// ── Skeleton.Circle - for avatar placeholder ──────────────────

export function SkeletonCircle({ size: sizeProp, ...props }: SkeletonProps & { size?: number }) {
  const { knobProps } = useResolvedKnobs();
  const size = sizeProp ?? skeletonCircleSize(knobProps.sizeToken);
  return <Skeleton variant="circular" width={size} height={size} {...props} />;
}

// ── Attach sub-components ─────────────────────────────────────

Skeleton.Text = SkeletonText;
Skeleton.Circle = SkeletonCircle;

export type SkeletonFrameProps = GetProps<typeof SkeletonFrame>;
