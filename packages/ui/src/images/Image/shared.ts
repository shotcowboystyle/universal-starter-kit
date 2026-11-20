import { useCallback, useMemo, useState } from 'react';
import type { ImageResizeMode, ImageURISource } from 'react-native';

import { useAssets } from '../../hooks/useAssets';

import type { ImageProps, ImageStatus, ImageThumbnailSize } from './types';

export const isNumber = <T>(value: T): value is T & number => typeof value === 'number';

export const isString = <T>(value: T): value is T & string => typeof value === 'string';

export const isThumbnailSize = <T>(size: T): size is T & ImageThumbnailSize =>
  size === 'extraSmall' || size === 'small' || size === 'medium' || size === 'large';

/** True when `size` is a thumbnail keyword or a px number (the framed-thumbnail mode). */
export const hasThumbnailSize = (size?: ImageThumbnailSize | number | null): size is ImageThumbnailSize | number =>
  size != null && (isThumbnailSize(size) || isNumber(size));

export const thumbnailPx = (size: ImageThumbnailSize | number, nestedPx: number, compact: boolean): number => {
  if (isNumber(size)) {
    return Math.max(0, size);
  }
  if (size === 'extraSmall') {
    return nestedPx;
  }
  if (compact) {
    if (size === 'small') {
      return nestedPx;
    }
    if (size === 'medium') {
      return 40;
    }
    return 60;
  }
  if (size === 'small') {
    return 40;
  }
  if (size === 'medium') {
    return 60;
  }
  return 80;
};

export const isSvgUri = (uri: string | undefined, svgFlag = false): boolean => {
  if (svgFlag) {
    return true;
  }
  if (uri === undefined || uri === '') {
    return false;
  }
  return /\.svg(?:[?#]|$)/u.test(uri) || uri.startsWith('data:image/svg+xml');
};

type ImageSourceValue = ImageURISource | ImageURISource[];

/** Anything the `source` / `src` props accept, including ESM-wrapped assets (`{ default }`). */
export type ImageSourceInput = ImageSourceValue | string | number | { default: ImageSourceValue } | null | undefined;

// ESM-wrapped assets expose the source under `default`.
const resolveModuleSource = (source: Exclude<ImageSourceInput, string | number>): ImageSourceValue | undefined => {
  if (source == null) {
    return undefined;
  }
  if (Array.isArray(source)) {
    return source;
  }
  if ('default' in source) {
    return source.default;
  }
  return source;
};

export const useResolvedImageSource = (sourceProp: ImageSourceInput, src: ImageSourceInput) => {
  const hasSourceProp = Boolean(sourceProp);
  const source = hasSourceProp ? sourceProp : src;
  const [asset] = useAssets(isNumber(source) ? [source] : []);

  const imageUriSource = useMemo(() => {
    if (isString(source)) {
      return { uri: source } satisfies ImageURISource;
    }
    if (isNumber(source)) {
      return asset;
    }
    return resolveModuleSource(source);
  }, [asset, source]);

  const resolvedSrc = useMemo(() => {
    if (isString(source)) {
      return source;
    }
    return imageUriSource == null || Array.isArray(imageUriSource) ? undefined : imageUriSource.uri;
  }, [source, imageUriSource]);

  return { source, imageUriSource, resolvedSrc };
};

const RESIZE_MODE_BY_OBJECT_FIT = new Map<string, ImageResizeMode>([
  ['cover', 'cover'],
  ['contain', 'contain'],
  ['scale-down', 'contain'],
  ['fill', 'stretch'],
  ['none', 'center'],
]);

const PRESERVE_ASPECT_RATIO_BY_OBJECT_FIT = new Map<string, string>([
  ['contain', 'xMidYMid meet'],
  ['scale-down', 'xMidYMid meet'],
  ['cover', 'xMidYMid slice'],
  ['fill', 'none'],
  ['none', 'none'],
]);

export const objectFitToResizeMode = (objectFit: string | undefined): ImageResizeMode | undefined =>
  objectFit === undefined ? undefined : RESIZE_MODE_BY_OBJECT_FIT.get(objectFit);

export const svgPreserveAspectRatio = (objectFit: string | undefined): string | undefined =>
  objectFit === undefined ? undefined : PRESERVE_ASPECT_RATIO_BY_OBJECT_FIT.get(objectFit);

/** True when there is nothing to paint: no source, no frame chrome, no fallback, not filling, no size. */
export const isEmptyImage = (opts: {
  hasSource: boolean;
  isFramed: boolean;
  fallback: unknown;
  fill: boolean;
  size: ImageProps['size'];
}): boolean => {
  const nothingPainted = !opts.hasSource && !opts.isFramed;
  const nothingRequested = opts.fallback == null && !opts.fill && opts.size == null;
  return nothingPainted && nothingRequested;
};

const initialStatus = (hasSource: boolean): ImageStatus => (hasSource ? 'loading' : 'error');

/** Load status that resets whenever the source (or its presence) changes. */
export const useImageStatus = (hasSource: boolean, resolvedSrc: string | undefined) => {
  const sourceKey = `${hasSource}|${resolvedSrc ?? ''}`;
  const [state, setState] = useState({ sourceKey, status: initialStatus(hasSource) });
  const status = state.sourceKey === sourceKey ? state.status : initialStatus(hasSource);
  const setStatus = useCallback(
    (next: ImageStatus) => {
      setState({ sourceKey, status: next });
    },
    [sourceKey],
  );
  return [status, setStatus] as const;
};

export const mediaFillProps = (opts: {
  fill: boolean;
  thumbnail: boolean;
  width?: ImageProps['width'];
  height?: ImageProps['height'];
  aspectRatio?: ImageProps['aspectRatio'];
  objectFit?: ImageProps['objectFit'];
  objectPosition?: string;
}) => {
  const hasWidth = opts.width != null;
  const hasHeight = opts.height != null;
  const hasAspect = opts.aspectRatio != null;
  const twoDimensionsGiven = [hasWidth, hasHeight, hasAspect].filter(Boolean).length >= 2;
  const constrained = opts.fill || opts.thumbnail || twoDimensionsGiven;
  const onlyHeightGiven = hasHeight && !hasWidth && !hasAspect;
  const heightOnly = onlyHeightGiven && !opts.fill && !opts.thumbnail;
  const widthFallback = hasWidth ? ('100%' as const) : undefined;
  const heightOnlyWidth = heightOnly ? ('auto' as const) : widthFallback;
  return {
    width: constrained ? ('100%' as const) : heightOnlyWidth,
    height: constrained || heightOnly ? ('100%' as const) : undefined,
    objectFit: opts.objectFit,
    ...(opts.objectPosition !== undefined && opts.objectPosition !== ''
      ? { objectPosition: opts.objectPosition }
      : null),
    display: 'block' as const,
  };
};

export const resolveObjectFit = (objectFit: ImageProps['objectFit'], coverByDefault: boolean) =>
  objectFit ?? (coverByDefault ? ('cover' as const) : undefined);

export const hasImageSource = (
  imageUriSource: ReturnType<typeof useResolvedImageSource>['imageUriSource'],
  resolvedSrc: string | undefined,
  source: ImageSourceInput,
): boolean => Boolean(imageUriSource) || Boolean(resolvedSrc) || isNumber(source);
