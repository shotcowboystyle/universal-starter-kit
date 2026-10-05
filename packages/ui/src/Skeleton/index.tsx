import { radiusClassProps, sizeRecipeForToken, useResolvedKnobs } from '@repo/theme';
import { createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetProps } from 'tamagui';
import { View, styled, isWeb } from 'tamagui';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';
export type SkeletonTextSize = 'body' | 'display';

const AnnounceCtx = createContext(true);

// Primer: the bone tracks type size, not the 44px control floor.
// DERIVED from the generated size recipe: a body bone is the token's
// recipe fontSize − 2 (the ink box inside the line box), display is 2× body,
// and the circle bone is the medallion one height step above the control
// ramp. $3/$4 are lossless vs the old handwritten map; $5 moves with the
// recipe's larger lg type (body 14→16, display 28→32).
const SKELETON_SIZE_TOKENS = ['$3', '$4', '$5'] as const;
const skeletonCircleTokenUp: Record<string, string> = { $3: '$4', $4: '$5', $5: '$6' };

function skeletonCircleSize(sizeToken: string): number {
  return sizeRecipeForToken(skeletonCircleTokenUp[sizeToken] ?? '$5').height;
}

const SHIMMER_STYLE_ID = '__mp-skeleton-shimmer';
function ensureShimmerStyles() {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(SHIMMER_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = SHIMMER_STYLE_ID;
  style.textContent = [
    '@keyframes mp-skeleton-shimmer{from{mask-position:200%}to{mask-position:0%}}',
    '.mp-skeleton-pulse{mask-image:linear-gradient(75deg,#000 30%,rgb(0,0,0,.65) 80%);mask-size:200%;animation:mp-skeleton-shimmer 1.2s ease-in-out infinite}',
    '.mp-skeleton-static{animation:none!important;mask-image:none}',
    '@media (prefers-reduced-motion:reduce){.mp-skeleton-pulse{animation:none!important;mask-image:none}}',
    '@media (forced-colors:active){.mp-skeleton-bone{outline:1px solid transparent;outline-offset:-1px}}',
  ].join('');
  document.head.appendChild(style);
}

const SkeletonFrame = styled(View, {
  name: 'Skeleton',
  backgroundColor: '$color5',
  overflow: 'hidden',
  pointerEvents: 'none',
  flexShrink: 0,

  variants: {
    variant: {
      text: {},
      circular: {},
      rectangular: {
        borderRadius: 0,
      },
      rounded: {},
    },
  } as const,

  defaultVariants: {
    variant: 'text',
  },
});

export interface SkeletonProps extends Omit<GetProps<typeof SkeletonFrame>, 'variant'> {
  variant?: SkeletonVariant;
  /** Width of the skeleton. Can be a number (pixels) or string (e.g., "100%") */
  width?: number | string;
  /** Height of the skeleton. Can be a number (pixels) or string */
  height?: number | string;
  /** Whether to animate the skeleton */
  animate?: boolean;
  /** Accessible name for a root loading region. Ignored on decorative bones. */
  label?: string;
}

function resolveTextHeight(sizeToken: string, textSize: SkeletonTextSize) {
  const known = (SKELETON_SIZE_TOKENS as readonly string[]).includes(sizeToken) ? sizeToken : '$4';
  const body = sizeRecipeForToken(known).fontSize - 2;
  return textSize === 'display' ? body * 2 : body;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  animate = true,
  style,
  label,
  className,
  ...props
}: SkeletonProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'Skeleton' });
  const shouldAnnounce = useContext(AnnounceCtx);
  const pulsing = Boolean(animate && knobProps.transition);
  if (isWeb) {
    ensureShimmerStyles();
  }

  const decorative = props['aria-hidden'] === true || !shouldAnnounce;
  // Corner-smoothing is an R-SCALE arc. Circular is R-PILL (a
  // squircle would break 1:1); rectangular is square by variant.
  const smoothingClass = variant === 'text' || variant === 'rounded' ? knobProps.borderRadius.className : undefined;
  const boneClass = [
    'mp-skeleton-bone',
    pulsing ? 'mp-skeleton-pulse' : 'mp-skeleton-static',
    smoothingClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const radiusProps =
    variant === 'circular'
      ? { borderRadius: 1000, ...radiusClassProps('R-PILL', 'SkeletonCircle') }
      : variant === 'rectangular'
        ? { borderRadius: 0 }
        : { borderRadius: knobProps.borderRadius.borderRadius };

  return (
    <SkeletonFrame
      variant={variant}
      width={width}
      height={height ?? (variant === 'text' ? resolveTextHeight(knobProps.sizeToken, 'body') : undefined)}
      {...radiusProps}
      {...props}
      {...(isWeb ? { className: boneClass } : undefined)}
      {...(style ? { style } : undefined)}
      pointerEvents="none"
      data-skeleton=""
      data-skeleton-variant={variant}
      data-animate={pulsing ? 'true' : 'false'}
      data-width={width != null ? String(width) : undefined}
      data-height={
        height != null
          ? String(height)
          : variant === 'text'
            ? String(resolveTextHeight(knobProps.sizeToken, 'body'))
            : undefined
      }
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'status'}
      aria-busy={decorative ? undefined : true}
      aria-live={decorative ? undefined : 'polite'}
      aria-label={decorative ? undefined : (label ?? t('Loading'))}
      accessibilityElementsHidden={decorative}
    />
  );
}

export function SkeletonText({
  lines = 1,
  gap: gapProp,
  lastLineWidth = '70%',
  size: textSize = 'body',
  label,
  width,
  height,
  animate,
  style,
  variant: _variant,
  ...props
}: SkeletonProps & {
  lines?: number;
  gap?: string | number;
  lastLineWidth?: string | number;
  size?: SkeletonTextSize;
}) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'Skeleton' });
  const shouldAnnounce = useContext(AnnounceCtx);
  const count = Math.max(0, Math.floor(Number(lines) || 0));
  const lineHeight = height ?? resolveTextHeight(knobProps.sizeToken, textSize);
  const gap = gapProp ?? knobProps.gap.gap;
  const decorative = !shouldAnnounce;

  if (count === 0) {
    return null;
  }

  return (
    <AnnounceCtx.Provider value={false}>
      <View
        {...props}
        width={width ?? '100%'}
        gap={gap}
        data-skeleton-text=""
        data-lines={String(count)}
        aria-hidden={decorative ? true : undefined}
        role={decorative ? undefined : 'status'}
        aria-busy={decorative ? undefined : true}
        aria-live={decorative ? undefined : 'polite'}
        aria-label={decorative ? undefined : (label ?? t('Loading'))}>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton
            key={i}
            variant="text"
            animate={animate}
            style={style}
            height={lineHeight}
            width={count === 1 ? (width ?? lastLineWidth) : i === count - 1 ? lastLineWidth : '100%'}
          />
        ))}
      </View>
    </AnnounceCtx.Provider>
  );
}

export function SkeletonCircle({ size: sizeProp, label, ...props }: SkeletonProps & { size?: number }) {
  const { knobProps } = useResolvedKnobs({ component: 'Skeleton' });
  const diameter = Math.max(0, sizeProp ?? skeletonCircleSize(knobProps.sizeToken));
  return (
    <Skeleton
      variant="circular"
      label={label}
      {...props}
      width="100%"
      maxWidth={diameter}
      aspectRatio={1}
      alignSelf="flex-start"
      data-diameter={String(diameter)}
    />
  );
}

export function SkeletonGroup({
  children,
  label,
  ...props
}: GetProps<typeof View> & { children?: ReactNode; label?: string }) {
  const { t } = useTranslation();
  return (
    <AnnounceCtx.Provider value={false}>
      <View
        {...props}
        role="status"
        aria-busy={true}
        aria-live="polite"
        aria-label={label ?? t('Loading')}
        data-skeleton-group="">
        {children}
      </View>
    </AnnounceCtx.Provider>
  );
}

Skeleton.Text = SkeletonText;
Skeleton.Circle = SkeletonCircle;
Skeleton.Group = SkeletonGroup;

export type SkeletonFrameProps = GetProps<typeof SkeletonFrame>;
