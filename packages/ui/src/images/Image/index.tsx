import { useCallback } from 'react';
import { Image as TamaguiImage } from 'tamagui';

import { ImageFrame } from './ImageFrame';
import {
  hasThumbnailSize,
  isEmptyImage,
  isNumber,
  resolveObjectFit,
  mediaFillProps,
  useImageStatus,
  useResolvedImageSource,
} from './shared';
import type { ImageProps } from './types';

export type { ImageProps } from './types';

export const Image = ({
  alt = '',
  blurRadius: _blurRadius,
  capInsets: _capInsets,
  crossOrigin,
  defaultSource: _defaultSource,
  fadeDuration: _fadeDuration,
  loadingIndicatorSource: _loadingIndicatorSource,
  objectFit: objectFitProp,
  objectPosition,
  onError,
  onLoad,
  onLoadEnd,
  onLoadStart,
  onPartialLoad: _onPartialLoad,
  onProgress,
  progressiveRenderingEnabled: _progressiveRenderingEnabled,
  referrerPolicy,
  resizeMethod: _resizeMethod,
  // oxlint-disable-next-line typescript/no-deprecated -- `source` is still a supported input (RN-style assets); useResolvedImageSource normalizes it with `src`
  source: sourceProp,
  src,
  srcSet,
  svg: _svg,
  tintColor: _tintColor,
  fill = false,
  sizes,
  loading: loadingProp,
  priority,
  placeholder = 'empty',
  placeholderSrc,
  fallback,
  framed,
  size,
  compact = false,
  groupPosition,
  groupOrientation,
  decoding = 'async',
  onPress,
  disabled,
  width,
  height,
  aspectRatio,
  borderRadius,
  ...props
}: ImageProps) => {
  const { source, resolvedSrc } = useResolvedImageSource(sourceProp, src);
  const hasSource = Boolean(resolvedSrc) || isNumber(source);
  const thumbnail = hasThumbnailSize(size);
  const isFramed = framed ?? thumbnail;
  const objectFit = resolveObjectFit(objectFitProp, fill || thumbnail);
  const loading = priority ? 'eager' : (loadingProp ?? 'lazy');

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

  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening -- handlers are RN-shaped (ImageProps) but the underlying <img>/RN Image events differ; no shared event type exists to key this by
  const loadHandlers: Record<string, unknown> = { onError: handleError, onLoad: handleLoad };

  if (isEmptyImage({ hasSource, isFramed, fallback, fill, size })) {
    return null;
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
      aspectRatio={aspectRatio}
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
        <TamaguiImage
          alt={alt}
          crossOrigin={crossOrigin}
          decoding={decoding}
          fetchPriority={priority ? 'high' : undefined}
          loading={loading}

          objectPosition={objectPosition}
          {...loadHandlers}
          onLoadEnd={onLoadEnd}
          onLoadStart={onLoadStart}
          onProgress={onProgress}
          referrerPolicy={referrerPolicy}
          sizes={sizes}
          src={resolvedSrc}
          srcSet={srcSet}
          {...mediaFillProps({
            fill,
            thumbnail,
            width,
            height,
            aspectRatio,
            objectFit,
            objectPosition,
          })}
        />
      ) : null}
    </ImageFrame>
  );
};
