import { ImageIcon } from '@phosphor-icons/react';
import {
  MIN_PRESS_TARGET,
  pressTargetHitSlop,
  pressTargetStyle,
  stackRadiusProps,
  useGroupPosition,
  useResolvedKnobs,
  type GroupOrientation,
  type GroupPosition,
} from '@repo/theme';
import type { ReactNode } from 'react';
import { Image as TamaguiImage, View, isWeb } from 'tamagui';

import { Skeleton } from '../../Skeleton';

import { isThumbnailSize, thumbnailPx as resolveThumbnailPx } from './shared';
import type { ImagePlaceholder, ImageProps } from './types';

export type ImageStatus = 'loading' | 'loaded' | 'error';

export interface ImageFrameProps {
  children?: ReactNode;
  alt: string;
  fill?: boolean;
  framed?: boolean;
  compact?: boolean;
  groupPosition?: GroupPosition;
  groupOrientation?: GroupOrientation;
  thumbnailPx?: number;
  size?: ImageProps['size'];
  width?: unknown;
  height?: unknown;
  aspectRatio?: unknown;
  borderRadius?: unknown;
  objectFit?: string;
  objectPosition?: string;
  // Accept the RN/Tamagui `onPress` shape ((event) => void | null | undefined);
  // the frame only ever calls it with zero args, so a bottom-arg type fits.
  onPress?: ((...args: never[]) => void) | null;
  disabled?: boolean;
  hasSource: boolean;
  status: ImageStatus;
  placeholder?: ImagePlaceholder;
  placeholderSrc?: string;
  fallback?: ReactNode;
  [key: string]: unknown;
}

function glyphSize(px: number): number {
  return Math.max(14, Math.min(28, Math.round(px * 0.42)));
}

function DefaultFallback({ px }: { px: number }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <View
      data-image-fallback=""
      width="100%"
      height="100%"
      minHeight={px}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$color3">
      <ImageIcon size={glyphSize(px)} color={knobProps.textAccentColor} />
    </View>
  );
}

export function ImageFrame({
  children,
  alt,
  fill = false,
  framed = false,
  compact = false,
  groupPosition,
  groupOrientation = 'horizontal',
  thumbnailPx: thumbnailPxProp,
  size,
  width,
  height,
  aspectRatio,
  borderRadius: borderRadiusProp,
  objectFit,
  objectPosition: _objectPosition,
  onPress,
  disabled = false,
  hasSource,
  status,
  placeholder = 'empty',
  placeholderSrc,
  fallback,
  ...props
}: ImageFrameProps) {
  const { knobProps, control, disabledState } = useResolvedKnobs({
    component: 'Image',
    compact,
  });
  const ctxPosition = useGroupPosition();
  const position = groupPosition ?? ctxPosition;
  const nestedPx = knobProps.nestedControl.px;
  const thumbnailPx =
    thumbnailPxProp ??
    (size != null && (isThumbnailSize(size) || typeof size === 'number')
      ? resolveThumbnailPx(size, nestedPx, compact)
      : undefined);
  const hasPress = Boolean(onPress);
  const interactive = hasPress && !disabled;
  const visualPx =
    thumbnailPx ?? (typeof width === 'number' && typeof height === 'number' ? Math.min(width, height) : undefined);
  const needsHitSlop = hasPress && visualPx != null && visualPx < MIN_PRESS_TARGET;
  const minTarget = hasPress && visualPx == null ? pressTargetStyle() : undefined;

  // Live-media tile: unclamped scale radius. Never `containerRadius` /
  // `cardSurface` — those carry CONTAINER-CAP padding a tile does not have.
  const radiusToken = knobProps.borderRadius.borderRadius;
  const radiusValue = (borderRadiusProp as string | number | undefined) ?? radiusToken;
  const radiusFragment = position
    ? stackRadiusProps(position, radiusValue, groupOrientation)
    : { ...knobProps.borderRadius, borderRadius: radiusValue };

  const heightOnly =
    typeof height !== 'undefined' &&
    typeof width === 'undefined' &&
    typeof aspectRatio === 'undefined' &&
    thumbnailPx == null &&
    !fill;

  const square = thumbnailPx != null;
  const frameWidth = square ? thumbnailPx : width;
  const frameHeight = square ? thumbnailPx : height;
  const frameAspect = square ? 1 : aspectRatio;
  const fallbackPx = visualPx ?? nestedPx;

  const showPlaceholder = status === 'loading' && placeholder != null && placeholder !== 'empty' && hasSource;
  const showFallback = status === 'error' || !hasSource;

  const handleKeyDown = (e: { key?: string; preventDefault?: () => void }) => {
    if (!interactive) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault?.();
      onPress?.();
    }
  };

  const pressA11y = hasPress
    ? isWeb
      ? {
          role: 'button' as const,
          tabIndex: disabled ? -1 : 0,
          'aria-label': alt || undefined,
          'aria-disabled': disabled || undefined,
          onKeyDown: handleKeyDown,
        }
      : {
          accessibilityRole: 'button' as const,
          accessibilityLabel: alt || undefined,
          accessibilityState: { disabled },
        }
    : isWeb
      ? null
      : { accessible: false };

  const painted = (
    <View
      data-image-frame=""
      data-media-tile="image"
      data-nested-px={thumbnailPx === nestedPx ? nestedPx : undefined}
      data-group-position={position}
      overflow="hidden"
      position={fill ? 'absolute' : 'relative'}
      {...(fill ? { top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' } : null)}
      {...(!fill && frameWidth != null ? { width: frameWidth as never } : null)}
      {...(!fill && frameHeight != null ? { height: frameHeight as never } : null)}
      {...(!fill && frameAspect != null ? { aspectRatio: frameAspect as never } : null)}
      {...(heightOnly ? { width: 'auto', alignSelf: 'flex-start' } : null)}
      {...radiusFragment}
      {...(framed ? knobProps.surface : { borderWidth: 0 })}
      {...(hasPress
        ? {
            cursor: disabled ? 'not-allowed' : 'pointer',
            outlineWidth: 0,
            hoverStyle: interactive ? (framed ? control.hoverKnobProps : { opacity: 0.92 }) : undefined,
            pressStyle: interactive ? (framed ? control.pressKnobProps : { opacity: 0.85 }) : undefined,
            focusVisibleStyle: interactive ? control.focusVisibleKnobProps : undefined,
            // onPress rides in loose (zero-or-event) so callers can forward the
            // RN/Tamagui handler; re-emit it to the View as an event handler.
            onPress: interactive ? (onPress as ((...args: unknown[]) => void) | undefined) : undefined,
            ...(!isWeb && needsHitSlop ? { hitSlop: pressTargetHitSlop(visualPx ?? nestedPx) } : null),
            ...minTarget,
            ...pressA11y,
          }
        : pressA11y)}
      {...(disabled && hasPress ? disabledState.chromeKnobProps : null)}
      {...props}>
      {showFallback ? (
        (fallback ?? <DefaultFallback px={fallbackPx} />)
      ) : (
        <>
          {children}
          {showPlaceholder ? (
            <View position="absolute" top={0} left={0} right={0} bottom={0} pointerEvents="none">
              {placeholder === 'blur' && placeholderSrc ? (
                <TamaguiImage
                  src={placeholderSrc}
                  alt=""
                  width="100%"
                  height="100%"
                  objectFit={(objectFit as never) ?? 'cover'}
                  {...(isWeb ? { style: { filter: 'blur(12px)' } } : { blurRadius: 12 })}
                />
              ) : placeholder === 'blur' || placeholder === 'skeleton' ? (
                <Skeleton width="100%" height="100%" variant="rounded" />
              ) : (
                placeholder
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  if (isWeb && needsHitSlop) {
    return (
      <View alignItems="center" justifyContent="center" backgroundColor="transparent" {...pressTargetStyle()}>
        {painted}
      </View>
    );
  }

  return painted;
}

export function mediaFillProps(opts: {
  fill: boolean;
  thumbnail: boolean;
  width?: unknown;
  height?: unknown;
  aspectRatio?: unknown;
  objectFit?: string;
  objectPosition?: string;
}): Record<string, unknown> {
  const constrained =
    opts.fill ||
    opts.thumbnail ||
    (opts.width != null && opts.height != null) ||
    (opts.width != null && opts.aspectRatio != null) ||
    (opts.height != null && opts.aspectRatio != null);
  const heightOnly =
    opts.height != null && opts.width == null && opts.aspectRatio == null && !opts.fill && !opts.thumbnail;
  return {
    width: constrained ? '100%' : heightOnly ? 'auto' : opts.width != null ? '100%' : undefined,
    height: constrained ? '100%' : heightOnly ? '100%' : undefined,
    objectFit: opts.objectFit,
    ...(opts.objectPosition ? { objectPosition: opts.objectPosition } : null),
    display: 'block',
  };
}
