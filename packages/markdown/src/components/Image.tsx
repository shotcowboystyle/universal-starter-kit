import { useResolvedKnobs } from '@repo/theme';
import { Image as TamaguiImage, View } from 'tamagui';

import type { ImageProps } from '../types';

export const MarkdownImage = ({ src, alt, title }: ImageProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <View marginVertical="$2">
      <TamaguiImage
        // src (string), not source: the RN source object never reaches the
        // DOM <img> src on web, so the image silently renders empty; tamagui
        // maps src back to source={{uri}} on native.
        src={src}
        alt={alt ?? ''}
        aria-label={alt ?? title ?? undefined}
        width="100%"
        aspectRatio={16 / 9}
        objectFit="contain"
        // R11: media tiles stay UNCLAMPED — radius rides the scale, no pad cap.
        {...knobProps.borderRadius}
      />
    </View>
  );
};
