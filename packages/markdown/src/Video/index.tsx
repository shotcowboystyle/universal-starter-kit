import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { isWeb, Paragraph, YStack } from 'tamagui';
import type { FontSizeTokens, GetProps } from 'tamagui';

import { tokenPx } from '../shared/token-px';

export interface VideoProps {
  src: string;
  children?: ReactNode;
  muted?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  loop?: boolean;
  poster?: string;
}

export const Video = ({
  src,
  children,
  muted = true,
  autoPlay = true,
  controls = false,
  loop = true,
  poster,
  ...props
}: VideoProps & Omit<GetProps<typeof YStack>, keyof VideoProps>) => {
  const { knobProps } = useResolvedKnobs();
  const radiusPx = tokenPx(knobProps.borderRadius.borderRadius, 8, 'radius');
  const fallbackMin = tokenPx(knobProps.sizeToken, 24) * 8;
  // SAFETY: KnobProps types sizeToken as a plain string, but resolveKnobs only ever sets it to '$3' | '$4' | '$5', all font size tokens
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const textSize = knobProps.sizeToken as FontSizeTokens;
  const hasMedia = !isWeb || src !== '';
  const hasCaption = Boolean(children);

  // An empty src on web omits the element entirely (SB-M-1227).
  let media: ReactNode = null;
  if (!isWeb) {
    media = (
      <YStack
        {...knobProps.panelPadding}
        {...knobProps.borderRadius}
        backgroundColor="$color3"
        alignItems="center"
        justifyContent="center"
        minHeight={fallbackMin}>
        <Paragraph
          color="$color9"
          size={textSize}
          {...knobProps.body}>
          Video playback requires a native video player
        </Paragraph>
      </YStack>
    );
  } else if (src !== '') {
    media = (
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
    );
  }

  return (
    <YStack
      render="figure"
      marginHorizontal={0}
      marginVertical="$6"
      gap="$2"
      paddingTop={hasCaption && !hasMedia ? '$2' : undefined}
      {...props}>
      {media}
      {hasCaption ? (
        <Paragraph
          render="figcaption"
          color={knobProps.textAccentColor}
          size={textSize}
          {...knobProps.body}>
          {children}
        </Paragraph>
      ) : null}
    </YStack>
  );
};
