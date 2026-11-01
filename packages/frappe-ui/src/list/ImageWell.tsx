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

// SAFETY: every caller passes a `$<hue><step>` theme color token, which Tamagui resolves at runtime; its color props only type the literal token union.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
const colorToken = (token: string) => token as never;

/**
 * A square image well: a tinted surface (the tint is data, from the theme's
 * ramps) holding an image that walks its candidate list on error and fades
 * in on web, with a "?" when every candidate fails.
 */
export const ImageWell = ({
  sources,
  alt,
  tints,
  pixelated = false,
  inset = 0.06,
  lazy = false,
  ...wellProps
}: ImageWellProps) => {
  const { knobProps } = useResolvedKnobs();
  const [revealedSrc, setRevealedSrc] = useState<string | null>(null);
  const hue = tints?.[0] ?? 'gray';
  const secondHue = tints?.[1];
  const hasSecondHue = secondHue !== undefined && secondHue !== '';

  // The failed-candidate cursor is keyed by the source list, so a new list
  // starts again from its first candidate.
  const sourceKey = sources.join('|');
  const [failures, setFailures] = useState({ key: sourceKey, index: 0 });
  const sourceIndex = failures.key === sourceKey ? failures.index : 0;

  const src = sources[sourceIndex] ?? '';
  // onLoad can be missed for a cached or server-rendered image, so a short
  // timer reveals it anyway: a slow image may pop, but none stays invisible.
  const revealed = !isWeb || !src || revealedSrc === src;
  useEffect(() => {
    if (!isWeb || !src || revealedSrc === src) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on the other path; a bare return trips consistent-return
      return undefined;
    }
    const timer = setTimeout(() => {
      setRevealedSrc(src);
    }, 350);
    return () => {
      clearTimeout(timer);
    };
  }, [src, revealedSrc]);

  const imageSize: `${number}%` = `${Math.round((1 - inset * 2) * 100)}%`;
  const loading: 'lazy' | 'eager' = lazy ? 'lazy' : 'eager';
  // `loading` / `decoding` are DOM-only image attributes.
  const webImageProps = isWeb ? { loading, decoding: 'async' as const } : undefined;
  // SAFETY: imageRendering is a valid CSS property on web; Tamagui's style prop type omits it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const pixelatedProps = pixelated && isWeb ? { style: { imageRendering: 'pixelated' } as never } : null;

  return (
    <YStack
      {...knobProps.borderRadius}
      borderWidth={0}
      backgroundColor={hasSecondHue ? 'transparent' : colorToken(`$${hue}5`)}
      aspectRatio={1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      position="relative"
      {...wellProps}>
      {hasSecondHue ? (
        <XStack
          fullscreen
          zIndex={0}
          pointerEvents="none">
          <YStack
            flex={1}
            backgroundColor={colorToken(`$${hue}5`)}
          />
          <YStack
            flex={1}
            backgroundColor={colorToken(`$${secondHue}5`)}
          />
        </XStack>
      ) : null}
      {src ? (
        <Image
          key={src}
          src={src}
          alt={alt}
          width={imageSize}
          height={imageSize}
          objectFit="contain"
          opacity={revealed ? 1 : 0}
          transition={knobProps.transition}
          zIndex={1}
          {...webImageProps}
          {...pixelatedProps}
          onLoad={() => {
            setRevealedSrc(src);
          }}
          onError={() => {
            setFailures((prev) => ({ key: sourceKey, index: (prev.key === sourceKey ? prev.index : 0) + 1 }));
          }}
        />
      ) : (
        <Text
          fontSize="$10"
          color={colorToken(`$${hue}8`)}
          fontWeight="700"
          aria-hidden
          zIndex={1}>
          ?
        </Text>
      )}
    </YStack>
  );
};
