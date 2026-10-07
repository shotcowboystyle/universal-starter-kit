import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { isWeb, Paragraph, YStack } from 'tamagui';

import { tokenPx } from '../shared/tokenPx';

export interface VideoProps {
  src: string;
  children?: ReactNode;
  muted?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  loop?: boolean;
  poster?: string;
}

export function Video({
  src,
  children,
  muted = true,
  autoPlay = true,
  controls = false,
  loop = true,
  poster,
  ...props
}: VideoProps & Record<string, unknown>) {
  const { knobProps } = useResolvedKnobs();
  const radiusPx = tokenPx(knobProps.borderRadius.borderRadius, 8, 'radius');
  const fallbackMin = tokenPx(knobProps.sizeToken, 24) * 8;
  const hasMedia = !isWeb || Boolean(src);
  return (
    <YStack
      render="figure"
      marginHorizontal={0}
      marginVertical="$6"
      gap="$2"
      paddingTop={children && !hasMedia ? '$2' : undefined}
      {...props}>
      {isWeb ? (
        src ? (
          <YStack
            render="video"
            // @ts-expect-error HTML video attributes via render prop
            src={src}
            autoPlay={autoPlay}
            playsInline
            muted={muted}
            controls={controls}
            loop={loop}
            poster={poster}
            // R11: media radius stays UNCLAMPED and rides the radius knob.
            style={{ width: '100%', display: 'block', borderRadius: radiusPx }}
          />
        ) : // omit the element entirely for an empty src (SB-M-1227)
        null
      ) : (
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.borderRadius}
          backgroundColor="$color3"
          alignItems="center"
          justifyContent="center"
          minHeight={fallbackMin}>
          <Paragraph
            color="$color9"
            size={knobProps.sizeToken as any}
            {...knobProps.body}>
            Video playback requires a native video player
          </Paragraph>
        </YStack>
      )}
      {children ? (
        <Paragraph
          render="figcaption"
          color={knobProps.textAccentColor}
          size={knobProps.sizeToken as any}
          {...knobProps.body}>
          {children}
        </Paragraph>
      ) : null}
    </YStack>
  );
}
