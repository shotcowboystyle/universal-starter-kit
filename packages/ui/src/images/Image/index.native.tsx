import type { UnionableNumber, UnionableString, Variable } from '@tamagui/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as TamaguiImage, type ViewProps, useStyle } from 'tamagui';

import { SvgUri } from '../SvgUri';

import { ImageFrame, mediaFillProps, type ImageStatus } from './ImageFrame';
import {
  isSvgUri,
  isThumbnailSize,
  objectFitToResizeMode,
  svgPreserveAspectRatio,
  useResolvedImageSource,
} from './shared';
import type { ImageProps } from './types';

export type { ImageProps } from './types';

function getDimensionFromStyle(
  styleDimension: string | number | UnionableNumber | UnionableString | Variable | undefined,
): number | undefined {
  if (typeof styleDimension === 'number') {
    return Math.max(0, styleDimension);
  }
  if (typeof styleDimension === 'string' && styleDimension.endsWith('px')) {
    return Math.max(0, Number.parseInt(styleDimension, 10));
  }
  if (styleDimension && typeof styleDimension === 'object') {
    const { val } = styleDimension;
    if (typeof val === 'number') {
      return Math.max(0, val);
    }
    if (typeof val === 'string' && val.endsWith('px')) {
      return Math.max(0, Number.parseInt(val, 10));
    }
  }
}

export function Image({
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
}: ImageProps) {
  const { source, imageUriSource, resolvedSrc } = useResolvedImageSource(sourceProp, src);
  const hasSource = Boolean(imageUriSource) || Boolean(resolvedSrc) || typeof source === 'number';
  const thumbnail = size != null && (isThumbnailSize(size) || typeof size === 'number');
  const isFramed = framed ?? thumbnail;
  const objectFit = objectFitProp ?? (fill || thumbnail ? 'cover' : undefined);
  const style = useStyle({ width, height, aspectRatio: aspectRatioProp, ...props } as ViewProps);

  const [status, setStatus] = useState<ImageStatus>(() => (hasSource ? 'loading' : 'error'));
  useEffect(() => {
    setStatus(hasSource ? 'loading' : 'error');
  }, [hasSource, resolvedSrc]);

  const handleLoad = useCallback(
    (event?: Parameters<NonNullable<ImageProps['onLoad']>>[0]) => {
      setStatus('loaded');
      onLoad?.(event);
    },
    [onLoad],
  );
  const handleError = useCallback(
    (error: Parameters<NonNullable<ImageProps['onError']>>[0]) => {
      setStatus('error');
      onError?.(error);
    },
    [onError],
  );

  const isSvg = useMemo(() => isSvgUri(resolvedSrc, svg), [resolvedSrc, svg]);

  const aspectRatio = useMemo(() => {
    if (typeof aspectRatioProp === 'number') {
      return aspectRatioProp;
    }
    let ratio: number | undefined;
    if (typeof style.aspectRatio === 'string') {
      const separator = style.aspectRatio.includes('/') ? '/' : ':';
      const [w, h] = style.aspectRatio.split(separator);
      ratio = Number.parseFloat(w || '0') / Number.parseFloat(h || '0');
    } else if (style.aspectRatio) {
      ratio = style.aspectRatio;
    } else if (typeof imageUriSource === 'object' && !Array.isArray(imageUriSource)) {
      const { width: sw, height: sh } = imageUriSource;
      if (typeof sw === 'number' && typeof sh === 'number' && sh > 0) {
        ratio = sw / sh;
      }
    }
    return Number.isFinite(ratio) ? ratio : undefined;
  }, [aspectRatioProp, style.aspectRatio, imageUriSource]);

  const calculatedHeight = useMemo(() => {
    const h = getDimensionFromStyle(style.height as never) ?? getDimensionFromStyle(height as never);
    const w = getDimensionFromStyle(style.width as never) ?? getDimensionFromStyle(width as never);
    if (typeof h !== 'undefined') {
      return h;
    }
    if (typeof w === 'number' && aspectRatio) {
      return Math.round(w / aspectRatio);
    }
  }, [style.height, style.width, height, width, aspectRatio]);

  const calculatedWidth = useMemo(() => {
    const w = getDimensionFromStyle(style.width as never) ?? getDimensionFromStyle(width as never);
    const h = getDimensionFromStyle(style.height as never) ?? getDimensionFromStyle(height as never);
    if (typeof w !== 'undefined') {
      return w;
    }
    if (typeof h === 'number' && aspectRatio) {
      return Math.round(h * aspectRatio);
    }
  }, [style.height, style.width, height, width, aspectRatio]);

  if (!hasSource && !isFramed && fallback == null && !fill && size == null) {
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
      {hasSource && status !== 'error' ? (
        isSvg && !Array.isArray(imageUriSource) && imageUriSource?.uri ? (
          <SvgUri
            accessibilityLabel={alt}
            height={fill || thumbnail ? undefined : calculatedHeight}
            onError={handleError}
            onLoad={handleLoad}
            preserveAspectRatio={svgPreserveAspectRatio(objectFit)}
            uri={imageUriSource.uri}
            width={fill || thumbnail ? undefined : calculatedWidth}
          />
        ) : (
          <TamaguiImage
            alt={alt}
            blurRadius={blurRadius}
            capInsets={capInsets}
            defaultSource={defaultSource}
            fadeDuration={fadeDuration}
            loadingIndicatorSource={loadingIndicatorSource}
            objectFit={objectFit}
            onError={handleError as never}
            onLoad={handleLoad as never}
            onLoadEnd={onLoadEnd}
            onLoadStart={onLoadStart}
            onPartialLoad={onPartialLoad}
            onProgress={onProgress}
            progressiveRenderingEnabled={progressiveRenderingEnabled}
            resizeMethod={resizeMethod}
            resizeMode={objectFitToResizeMode(objectFit)}
            source={imageUriSource}
            srcSet={srcSet}
            tintColor={tintColor}
            {...mediaProps}
            {...(fill || thumbnail
              ? null
              : {
                  width: calculatedWidth,
                  height: calculatedHeight,
                })}
          />
        )
      ) : null}
    </ImageFrame>
  );
}
