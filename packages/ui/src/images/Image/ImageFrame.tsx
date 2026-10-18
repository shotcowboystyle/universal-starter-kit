import { ImageIcon } from '@phosphor-icons/react';
import {
  MIN_PRESS_TARGET,
  pressTargetHitSlop,
  pressTargetStyle,
  stackRadiusProps,
  useGroupPosition,
  useResolvedKnobs,
} from '@repo/theme';
import type { GroupOrientation, GroupPosition } from '@repo/theme';
import type { ReactNode } from 'react';
import { Image as TamaguiImage, View, isWeb } from 'tamagui';
import type { ViewProps } from 'tamagui';

import { Skeleton } from '../../Skeleton';

import { hasThumbnailSize, isNumber, isString, thumbnailPx as resolveThumbnailPx } from './shared';
import type { ImagePlaceholder, ImageProps, ImageStatus } from './types';

export type { ImageStatus } from './types';

export type ImageFrameProps = Omit<ViewProps, 'children' | 'onPress' | 'disabled'> & {
  children?: ReactNode;
  alt: string;
  fill?: boolean;
  framed?: boolean;
  compact?: boolean;
  groupPosition?: GroupPosition;
  groupOrientation?: GroupOrientation;
  thumbnailPx?: number;
  size?: ImageProps['size'];
  objectFit?: ImageProps['objectFit'];
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
};

const glyphSize = (px: number): number => Math.max(14, Math.min(28, Math.round(px * 0.42)));

const DefaultFallback = ({ px }: { px: number }) => {
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
      <ImageIcon
        size={glyphSize(px)}
        color={knobProps.textAccentColor}
      />
    </View>
  );
};

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const resolveVisualPx = (
  thumbnailPx: number | undefined,
  width: ViewProps['width'],
  height: ViewProps['height'],
): number | undefined => {
  if (thumbnailPx !== undefined) {
    return thumbnailPx;
  }
  return isNumber(width) && isNumber(height) ? Math.min(width, height) : undefined;
};

const isHeightOnly = (opts: {
  width: ViewProps['width'];
  height: ViewProps['height'];
  aspectRatio: ViewProps['aspectRatio'];
  square: boolean;
  fill: boolean;
}): boolean => {
  const onlyHeightGiven = opts.height !== undefined && opts.width === undefined && opts.aspectRatio === undefined;
  return onlyHeightGiven && !opts.square && !opts.fill;
};

const resolveRadiusValue = (borderRadius: ViewProps['borderRadius'], fallback: string | number | undefined) =>
  isString(borderRadius) || isNumber(borderRadius) ? borderRadius : fallback;

const pressA11yProps = (opts: {
  hasPress: boolean;
  disabled: boolean;
  alt: string;
  onKeyDown: (e: { key?: string; preventDefault?: () => void }) => void;
}) => {
  if (!opts.hasPress) {
    return isWeb ? null : { accessible: false };
  }
  if (isWeb) {
    return {
      role: 'button' as const,
      tabIndex: opts.disabled ? -1 : 0,
      'aria-label': opts.alt || undefined,
      'aria-disabled': opts.disabled || undefined,
      onKeyDown: opts.onKeyDown,
    };
  }
  return {
    accessibilityRole: 'button' as const,
    accessibilityLabel: opts.alt || undefined,
    accessibilityState: { disabled: opts.disabled },
  };
};

const ImagePlaceholderLayer = ({
  placeholder,
  placeholderSrc,
  objectFit,
}: {
  placeholder: ImagePlaceholder;
  placeholderSrc?: string;
  objectFit: ImageProps['objectFit'];
}) => {
  let content: ReactNode = placeholder;
  if (placeholder === 'blur' && hasText(placeholderSrc)) {
    content = (
      <TamaguiImage
        src={placeholderSrc}
        alt=""
        width="100%"
        height="100%"
        objectFit={objectFit ?? 'cover'}
        {...(isWeb ? { style: { filter: 'blur(12px)' } } : { blurRadius: 12 })}
      />
    );
  } else if (placeholder === 'blur' || placeholder === 'skeleton') {
    content = (
      <Skeleton
        width="100%"
        height="100%"
        variant="rounded"
      />
    );
  }
  return (
    <View
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      pointerEvents="none">
      {content}
    </View>
  );
};

type KnobControl = ReturnType<typeof useResolvedKnobs>['control'];

const frameSizing = (opts: {
  fill: boolean;
  thumbnailPx: number | undefined;
  width: ViewProps['width'];
  height: ViewProps['height'];
  aspectRatio: ViewProps['aspectRatio'];
}) => {
  const { fill, thumbnailPx, width, height, aspectRatio } = opts;
  const square = thumbnailPx != null;
  const dimensions = square
    ? { width: thumbnailPx, height: thumbnailPx, aspectRatio: 1 }
    : { width, height, aspectRatio };
  const heightOnly = isHeightOnly({ width, height, aspectRatio, square, fill });
  return {
    dimensionProps: fill ? null : dimensions,
    heightOnlyProps: heightOnly ? ({ width: 'auto', alignSelf: 'flex-start' } as const) : null,
  };
};

const pressChromeProps = (opts: {
  interactive: boolean;
  disabled: boolean;
  framed: boolean;
  control: KnobControl;
  onPress: ImageFrameProps['onPress'];
  hitSlopPx: number | undefined;
  minTarget: ReturnType<typeof pressTargetStyle> | undefined;
}) => {
  const { interactive, framed, control } = opts;
  const stateStyle = (framedStyle: ViewProps['hoverStyle'], plainStyle: ViewProps['hoverStyle']) => {
    const style = framed ? framedStyle : plainStyle;
    return interactive ? style : undefined;
  };
  return {
    cursor: opts.disabled ? 'not-allowed' : 'pointer',
    outlineWidth: 0,
    hoverStyle: stateStyle(control.hoverKnobProps, { opacity: 0.92 }),
    pressStyle: stateStyle(control.pressKnobProps, { opacity: 0.85 }),
    focusVisibleStyle: interactive ? control.focusVisibleKnobProps : undefined,
    // onPress rides in loose (zero-or-event) so callers can forward the
    // RN/Tamagui handler; re-emit it to the View as an event handler.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the frame invokes onPress with zero args, and RN/Tamagui press handlers treat the event as optional
    onPress: interactive ? (opts.onPress as ViewProps['onPress']) : undefined,
    ...(opts.hitSlopPx === undefined ? null : { hitSlop: pressTargetHitSlop(opts.hitSlopPx) }),
    ...opts.minTarget,
  } as const;
};

// oxlint-disable-next-line eslint/complexity -- one frame resolves size, radius, group position, press target and the placeholder/fallback states from the same props; the branches are mostly prop defaults
export const ImageFrame = ({
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the complexity note above the component
}: ImageFrameProps) => {
  const { knobProps, control, disabledState } = useResolvedKnobs({
    component: 'Image',
    compact,
  });
  const ctxPosition = useGroupPosition();
  const position = groupPosition ?? ctxPosition;
  const nestedPx = knobProps.nestedControl.px;
  const thumbnailPx =
    thumbnailPxProp ?? (hasThumbnailSize(size) ? resolveThumbnailPx(size, nestedPx, compact) : undefined);
  const hasPress = Boolean(onPress);
  const interactive = hasPress && !disabled;
  const visualPx = resolveVisualPx(thumbnailPx, width, height);
  const needsHitSlop = hasPress && visualPx != null && visualPx < MIN_PRESS_TARGET;
  const minTarget = hasPress && visualPx == null ? pressTargetStyle() : undefined;

  // Live-media tile: unclamped scale radius. Never `containerRadius` /
  // `cardSurface` — those carry CONTAINER-CAP padding a tile does not have.
  const radiusToken = knobProps.borderRadius.borderRadius;
  const radiusValue = resolveRadiusValue(borderRadiusProp, radiusToken);
  const radiusFragment = position
    ? stackRadiusProps(position, radiusValue, groupOrientation)
    : { ...knobProps.borderRadius, borderRadius: radiusValue };

  const { dimensionProps, heightOnlyProps } = frameSizing({ fill, thumbnailPx, width, height, aspectRatio });
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

  const pressA11y = pressA11yProps({ hasPress, disabled, alt, onKeyDown: handleKeyDown });
  const painted = (
    <View
      data-image-frame=""
      data-media-tile="image"
      data-nested-px={thumbnailPx === nestedPx ? nestedPx : undefined}
      data-group-position={position}
      overflow="hidden"
      position={fill ? 'absolute' : 'relative'}
      {...(fill ? { top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' } : null)}
      {...dimensionProps}
      {...heightOnlyProps}
      {...radiusFragment}
      {...(framed ? knobProps.surface : { borderWidth: 0 })}
      {...(hasPress
        ? {
            ...pressChromeProps({
              interactive,
              disabled,
              framed,
              control,
              onPress,
              hitSlopPx: !isWeb && needsHitSlop ? (visualPx ?? nestedPx) : undefined,
              minTarget,
            }),
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
            <ImagePlaceholderLayer
              placeholder={placeholder}
              placeholderSrc={placeholderSrc}
              objectFit={objectFit}
            />
          ) : null}
        </>
      )}
    </View>
  );

  if (isWeb && needsHitSlop) {
    return (
      <View
        alignItems="center"
        justifyContent="center"
        backgroundColor="transparent"
        {...pressTargetStyle()}>
        {painted}
      </View>
    );
  }

  return painted;
};
