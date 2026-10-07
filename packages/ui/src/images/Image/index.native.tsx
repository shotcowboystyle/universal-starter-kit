import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Image as TamaguiImage, useStyle } from 'tamagui';
import type { ViewProps } from 'tamagui';

import { SvgUri } from '../SvgUri';

import { ImageFrame } from './ImageFrame';
import {
  hasThumbnailSize,
  isEmptyImage,
  hasImageSource,
  isNumber,
  isString,
  resolveObjectFit,
  isSvgUri,
  mediaFillProps,
  objectFitToResizeMode,
  svgPreserveAspectRatio,
  useImageStatus,
  useResolvedImageSource,
} from './shared';
import type { ImageProps } from './types';

export type { ImageProps } from './types';

type Dimension = ViewProps['width'];

// oxlint-disable-next-line unicorn/prefer-number-coercion -- "44px" carries a unit suffix; Number() would return NaN
const parsePx = (value: string): number => Math.max(0, Number.parseInt(value, 10));

const primitiveDimension = (value: Dimension): number | undefined => {
  if (isNumber(value)) {
    return Math.max(0, value);
  }
  return isString(value) && value.endsWith('px') ? parsePx(value) : undefined;
};

const hasVal = (value: Dimension): value is Dimension & { val: unknown } =>
  value != null && !isNumber(value) && !isString(value) && 'val' in value;

const getDimensionFromStyle = (styleDimension: Dimension): number | undefined => {
  const direct = primitiveDimension(styleDimension);
  if (direct !== undefined) {
    return direct;
  }
  return hasVal(styleDimension) ? primitiveDimension(styleDimension.val) : undefined;
};

const resolveDimension = (fromStyle: Dimension, fromProp: Dimension): number | undefined =>
  getDimensionFromStyle(fromStyle) ?? getDimensionFromStyle(fromProp);

const parseAspectRatioString = (value: string): number => {
  const separator = value.includes('/') ? '/' : ':';
  const [w, h] = value.split(separator);
  return Number(w === '' ? '0' : w) / Number(h === '' ? '0' : h);
};

const ratioFromSource = (imageUriSource: ReturnType<typeof useResolvedImageSource>['imageUriSource']) => {
  const dims = imageUriSource == null || Array.isArray(imageUriSource) ? undefined : imageUriSource;
  return isNumber(dims?.width) && isNumber(dims.height) && dims.height > 0 ? dims.width / dims.height : undefined;
};

const useAspectRatio = (
  aspectRatioProp: ViewProps['aspectRatio'],
  styleAspectRatio: ViewProps['aspectRatio'],
  imageUriSource: ReturnType<typeof useResolvedImageSource>['imageUriSource'],
) =>
  useMemo(() => {
    if (isNumber(aspectRatioProp)) {
      return aspectRatioProp;
    }
    let ratio: number | undefined;
    if (isString(styleAspectRatio)) {
      ratio = parseAspectRatioString(styleAspectRatio);
    } else if (styleAspectRatio !== undefined && styleAspectRatio !== 0) {
      ratio = styleAspectRatio;
    } else {
      ratio = ratioFromSource(imageUriSource);
    }
    return Number.isFinite(ratio) ? ratio : undefined;
  }, [aspectRatioProp, styleAspectRatio, imageUriSource]);

const hasRatio = (aspectRatio: number | undefined): aspectRatio is number =>
  aspectRatio !== undefined && aspectRatio !== 0;

const scaledDimension = (
  known: number | undefined,
  other: number | undefined,
  scale: (other: number, ratio: number) => number,
  aspectRatio: number | undefined,
) => {
  if (known !== undefined) {
    return known;
  }
  return other !== undefined && hasRatio(aspectRatio) ? Math.round(scale(other, aspectRatio)) : undefined;
};

export const Image = ({
  alt = '',
  blurRadius,
  capInsets,
  crossOrigin: _crossOrigin,
  defaultSource,
  fadeDuration,
  loadingIndicatorSource,
  objectFit: objectFitProp,
  objectPosition,
  onError,
  onLoad,
  onLoadEnd,
  onLoadStart,
  onPartialLoad,
  onProgress,
  progressiveRenderingEnabled,
  referrerPolicy: _referrerPolicy,
  resizeMethod,
  // oxlint-disable-next-line typescript/no-deprecated -- `source` is still a supported input (RN-style assets); useResolvedImageSource normalizes it with `src`
  source: sourceProp,
  src,
  srcSet,
  svg,
  tintColor,
  fill = false,
  sizes: _sizes,
  loading: _loading,
  priority: _priority,
  placeholder = 'empty',
  placeholderSrc,
  fallback,
  framed,
  size,
  compact = false,
  groupPosition,
  groupOrientation,
  decoding: _decoding,
  onPress,
  disabled,
  width,
  height,
  aspectRatio: aspectRatioProp,
  borderRadius,
  ...props
}: ImageProps) => {
  const { source, imageUriSource, resolvedSrc } = useResolvedImageSource(sourceProp, src);
  const hasSource = hasImageSource(imageUriSource, resolvedSrc, source);
  const thumbnail = hasThumbnailSize(size);
  const isFramed = framed ?? thumbnail;
  const objectFit = resolveObjectFit(objectFitProp, fill || thumbnail);
  // SAFETY: only ViewProps-compatible style keys (width/height/aspectRatio and the rest-props) are read back via `style`.
  const style = useStyle({ width, height, aspectRatio: aspectRatioProp, ...props } as ViewProps);

  const [status, setStatus] = useImageStatus(hasSource, resolvedSrc);

  const handleLoad = useCallback(
    (event?: Parameters<NonNullable<ImageProps['onLoad']>>[0]) => {
      setStatus('loaded');
      onLoad?.(event);
    },
    [onLoad, setStatus],
  );
  const handleError = useCallback(
    (error: Parameters<NonNullable<ImageProps['onError']>>[0]) => {
      setStatus('error');
      onError?.(error);
    },
    [onError, setStatus],
  );

  const isSvg = useMemo(() => isSvgUri(resolvedSrc, svg), [resolvedSrc, svg]);

  const aspectRatio = useAspectRatio(aspectRatioProp, style.aspectRatio, imageUriSource);

  const calculatedHeight = useMemo(
    () =>
      scaledDimension(
        resolveDimension(style.height, height),
        resolveDimension(style.width, width),
        (w, ratio) => w / ratio,
        aspectRatio,
      ),
    [style.height, style.width, height, width, aspectRatio],
  );

  const calculatedWidth = useMemo(
    () =>
      scaledDimension(
        resolveDimension(style.width, width),
        resolveDimension(style.height, height),
        (h, ratio) => h * ratio,
        aspectRatio,
      ),
    [style.height, style.width, height, width, aspectRatio],
  );

  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening -- handlers are RN-shaped (ImageProps) but the underlying RN Image events differ; no shared event type exists to key this by
  const loadHandlers: Record<string, unknown> = { onError: handleError, onLoad: handleLoad };

  if (isEmptyImage({ hasSource, isFramed, fallback, fill, size })) {
    return null;
  }

  const mediaProps = mediaFillProps({
    fill,
    thumbnail,
    width,
    height,
    aspectRatio: aspectRatioProp ?? aspectRatio,
    objectFit,
    objectPosition,
  });

  const svgUri = isSvg && !Array.isArray(imageUriSource) ? imageUriSource?.uri : undefined;
  const hasSvgUri = svgUri !== undefined && svgUri !== '';
  const dimensionsFree = fill || thumbnail;
  const freeSize = dimensionsFree ? null : { width: calculatedWidth, height: calculatedHeight };

  let media: ReactNode = null;
  if (hasSource && status !== 'error') {
    media = hasSvgUri ? (
      <SvgUri
        accessibilityLabel={alt}
        height={freeSize?.height}
        onError={handleError}
        onLoad={handleLoad}
        preserveAspectRatio={svgPreserveAspectRatio(objectFit)}
        uri={svgUri}
        width={freeSize?.width}
      />
    ) : (
      <TamaguiImage
        alt={alt}
        blurRadius={blurRadius}
        capInsets={capInsets}
        defaultSource={defaultSource}
        fadeDuration={fadeDuration}
        loadingIndicatorSource={loadingIndicatorSource}

        {...loadHandlers}
        onLoadEnd={onLoadEnd}
        onLoadStart={onLoadStart}
        onPartialLoad={onPartialLoad}
        onProgress={onProgress}
        progressiveRenderingEnabled={progressiveRenderingEnabled}
        resizeMethod={resizeMethod}
        // oxlint-disable-next-line typescript/no-deprecated -- RN Image still needs resizeMode; objectFit is not honored on native
        resizeMode={objectFitToResizeMode(objectFit)}
        // oxlint-disable-next-line typescript/no-deprecated -- RN Image requires `source`; Tamagui's `src` is web-only
        source={imageUriSource}
        srcSet={srcSet}
        tintColor={tintColor}
        {...mediaProps}
        {...freeSize}
      />
    );
  }

  return (
    <ImageFrame
      alt={alt}
      fill={fill}
      framed={isFramed}
      compact={compact}
      groupPosition={groupPosition}
      groupOrientation={groupOrientation}
      size={size}
      width={width}
      height={height}
      aspectRatio={aspectRatioProp ?? aspectRatio}
      borderRadius={borderRadius}
      objectFit={objectFit}
      objectPosition={objectPosition}
      onPress={onPress}
      disabled={disabled}
      hasSource={hasSource}
      status={status}
      placeholder={placeholder}
      placeholderSrc={placeholderSrc}
      fallback={fallback}
      {...props}>
      {media}
    </ImageFrame>
  );
};
