import { useResolvedKnobs } from '@repo/theme';
import { Image, Text, XStack, YStack, isWeb } from '@repo/ui';
import type { YStackProps } from '@repo/ui';
import { useEffect, useState } from 'react';

export interface ImageWellProps extends Omit<YStackProps, 'children'> {
  /** Candidate URLs in order; a failed load moves to the next. */
  sources: readonly string[];
  alt: string;
  /**
   * Theme hues (`"grass"`) painting the well from their ramps: one fills it,
   * two split it down the middle.
   */
  tints?: readonly (string | undefined)[];
  /** Nearest-neighbor upscaling, for pixel art. */
  pixelated?: boolean;
  /** Gap between the well's edge and the image, as a fraction of its width. */
  inset?: number;
  /** Fetch only as the image nears the viewport (web). */
  lazy?: boolean;
}

/**
 * A square image well: a tinted surface (the tint is data, from the theme's
 * ramps) holding an image that walks its candidate list on error and fades
 * in on web, with a "?" when every candidate fails.
 */
export function ImageWell({
  sources,
  alt,
  tints,
  pixelated = false,
  inset = 0.06,
  lazy = false,
  ...wellProps
}: ImageWellProps) {
  const { knobProps } = useResolvedKnobs();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [revealedSrc, setRevealedSrc] = useState<string | null>(null);
  const hue = tints?.[0] ?? 'gray';
  const secondHue = tints?.[1];

  const sourceKey = sources.join('|');
  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  const src = sources[sourceIndex] ?? '';
  // onLoad can be missed for a cached or server-rendered image, so a short
  // timer reveals it anyway: a slow image may pop, but none stays invisible.
  const revealed = !isWeb || !src || revealedSrc === src;
  useEffect(() => {
    if (!isWeb || !src || revealedSrc === src) {
      return;
    }
    const timer = setTimeout(() => {
      setRevealedSrc(src);
    }, 350);
    return () => {
      clearTimeout(timer);
    };
  }, [src, revealedSrc]);

  const imageSize = `${Math.round((1 - inset * 2) * 100)}%`;

  return (
    <YStack
      {...knobProps.borderRadius}
      borderWidth={0}
      backgroundColor={secondHue ? 'transparent' : (`$${hue}5` as never)}
      aspectRatio={1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      position="relative"
      {...wellProps}>
      {secondHue ? (
        <XStack
          fullscreen
          zIndex={0}
          pointerEvents="none">
          <YStack
            flex={1}
            backgroundColor={`$${hue}5` as never}
          />
          <YStack
            flex={1}
            backgroundColor={`$${secondHue}5` as never}
          />
        </XStack>
      ) : null}
      {src ? (
        <Image
          key={src}
          src={src}
          alt={alt}
          width={imageSize as never}
          height={imageSize as never}
          objectFit="contain"
          opacity={revealed ? 1 : 0}
          transition={knobProps.transition}
          zIndex={1}
          {...((isWeb ? { loading: lazy ? 'lazy' : 'eager', decoding: 'async' } : undefined) as
            | Record<string, unknown>
            | undefined)}
          {...(pixelated && isWeb ? { style: { imageRendering: 'pixelated' } as never } : null)}
          onLoad={() => {
            setRevealedSrc(src);
          }}
          onError={() => {
            setSourceIndex((index) => index + 1);
          }}
        />
      ) : (
        <Text
          fontSize="$10"
          color={`$${hue}8` as never}
          fontWeight="700"
          aria-hidden
          zIndex={1}>
          ?
        </Text>
      )}
    </YStack>
  );
}
