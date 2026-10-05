import { useMemo } from 'react';
import type { ImageURISource } from 'react-native';

import { useAssets } from '../../hooks/useAssets';

import type { ImageThumbnailSize } from './types';

export function isThumbnailSize(size: unknown): size is ImageThumbnailSize {
  return size === 'extraSmall' || size === 'small' || size === 'medium' || size === 'large';
}

export function thumbnailPx(size: ImageThumbnailSize | number, nestedPx: number, compact: boolean): number {
  if (typeof size === 'number') {
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
}

export function isSvgUri(uri: string | undefined, svgFlag?: boolean): boolean {
  if (svgFlag) {
    return true;
  }
  if (!uri) {
    return false;
  }
  return /\.svg([?#]|$)/.test(uri) || uri.startsWith('data:image/svg+xml');
}

export function useResolvedImageSource(sourceProp: unknown, src: unknown) {
  const source = sourceProp || src;
  const [asset] = useAssets(typeof source === 'number' ? [source] : []);

  const imageUriSource = useMemo(() => {
    if (typeof source === 'string') {
      return { uri: source } satisfies ImageURISource;
    }
    if (typeof source === 'number') {
      return asset;
    }
    return (
      (source as { default?: ImageURISource | ImageURISource[] })?.default ||
      (source as ImageURISource | ImageURISource[])
    );
  }, [asset, source]);

  const resolvedSrc = useMemo(() => {
    if (typeof source === 'string') {
      return source;
    }
    if (!imageUriSource || Array.isArray(imageUriSource)) {
      return undefined;
    }
    return imageUriSource.uri;
  }, [source, imageUriSource]);

  return { source, imageUriSource, resolvedSrc };
}

export function objectFitToResizeMode(
  objectFit: string | undefined,
): 'cover' | 'contain' | 'stretch' | 'center' | undefined {
  switch (objectFit) {
    case 'cover':
      return 'cover';
    case 'contain':
    case 'scale-down':
      return 'contain';
    case 'fill':
      return 'stretch';
    case 'none':
      return 'center';
    default:
      return undefined;
  }
}

export function svgPreserveAspectRatio(objectFit: string | undefined): string | undefined {
  switch (objectFit) {
    case 'contain':
    case 'scale-down':
      return 'xMidYMid meet';
    case 'cover':
      return 'xMidYMid slice';
    case 'fill':
    case 'none':
      return 'none';
    default:
      return undefined;
  }
}
