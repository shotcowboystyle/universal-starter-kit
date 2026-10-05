import { useCallback, useEffect, useState } from 'react';
import { Image as TamaguiImage } from 'tamagui';

import { ImageFrame, mediaFillProps, type ImageStatus } from './ImageFrame';
import { isThumbnailSize, useResolvedImageSource } from './shared';
import type { ImageProps } from './types';

export type { ImageProps } from './types';

export function Image({
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
}: ImageProps) {
  const { source, resolvedSrc } = useResolvedImageSource(sourceProp, src);
  const hasSource = Boolean(resolvedSrc) || typeof source === 'number';
  const thumbnail = size != null && (isThumbnailSize(size) || typeof size === 'number');
  const isFramed = framed ?? thumbnail;
  const objectFit = objectFitProp ?? (fill || thumbnail ? 'cover' : undefined);
  const loading = priority ? 'eager' : (loadingProp ?? 'lazy');

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

  if (!hasSource && !isFramed && fallback == null && !fill && size == null) {
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
          objectFit={objectFit}
          objectPosition={objectPosition}
          onError={handleError as never}
          onLoad={handleLoad as never}
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
}
