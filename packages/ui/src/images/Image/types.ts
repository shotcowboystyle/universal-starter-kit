import type { GroupOrientation, GroupPosition } from '@repo/theme';
import type { ReactNode } from 'react';
import type { ImageErrorEventData, ImageLoadEventData, NativeSyntheticEvent } from 'react-native';
import type { ImageProps as TamaguiImageProps } from 'tamagui';

/** Polaris Thumbnail sizes. `extraSmall` is the nested control box. */
export type ImageThumbnailSize = 'extraSmall' | 'small' | 'medium' | 'large';

export type ImagePlaceholder = 'empty' | 'blur' | 'skeleton' | ReactNode;

export type ImageProps = Omit<TamaguiImageProps, 'resizeMode' | 'onLoad' | 'onError' | 'size' | 'fill'> & {
  onLoad?: (event?: NativeSyntheticEvent<ImageLoadEventData>) => void;
  onError?: (error: NativeSyntheticEvent<ImageErrorEventData> | Error) => void;
  svg?: boolean;
  /** Next.js `fill` — paint the positioned parent (absolute inset 0). */
  fill?: boolean;
  /** Responsive hint for `srcset` (Next.js `sizes`). */
  sizes?: string;
  loading?: 'lazy' | 'eager';
  /** Above-the-fold: `loading=eager` + `fetchPriority=high`. */
  priority?: boolean;
  placeholder?: ImagePlaceholder;
  /** Blur-up source (Next.js `blurDataURL` / Expo placeholder URI). */
  placeholderSrc?: string;
  /** Shown when the asset is missing or fails. */
  fallback?: ReactNode;
  objectPosition?: string;
  /** Polaris Thumbnail chrome: surface + radius recipes, cover fit. */
  framed?: boolean;
  /** Square thumbnail. Number is px. `extraSmall` uses nestedControl. */
  size?: ImageThumbnailSize | number;
  compact?: boolean;
  groupPosition?: GroupPosition;
  groupOrientation?: GroupOrientation;
  decoding?: 'async' | 'auto' | 'sync';
};
