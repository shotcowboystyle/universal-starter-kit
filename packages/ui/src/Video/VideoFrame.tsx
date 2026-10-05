import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Paragraph, YStack, styled } from 'tamagui';

import { wrapBareTextChildren } from '../shared/textRidesText';

export const VideoFrame = styled(YStack, {
  name: 'Video',
  width: '100%',
});

/**
 * Live-media tile frame: unclamped scale radius, no
 * CONTAINER-CAP, no status pip. The capped card-surface fragment is the
 * wrong recipe — it carries the Axiom 1 cap and padding a tile does not have.
 */
export function mediaTileFrameProps(knobProps: {
  surface: { backgroundColor?: unknown };
  borderRadius: { borderRadius?: unknown; className?: string };
}): Record<string, unknown> {
  return {
    backgroundColor: knobProps.surface.backgroundColor,
    borderRadius: knobProps.borderRadius.borderRadius,
    padding: 0,
    ...(knobProps.borderRadius.className ? { className: knobProps.borderRadius.className } : {}),
    'data-media-tile': 'video',
  };
}

export function VideoCaption({ children }: { children: ReactNode }) {
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  return (
    <Paragraph render="figcaption" color={knobProps.textAccentColor as '$color11'}>
      {wrapBareTextChildren(children, (label, key) => (
        <Paragraph key={key} render="span" {...knobProps.body} color={knobProps.textAccentColor as '$color11'}>
          {label}
        </Paragraph>
      ))}
    </Paragraph>
  );
}
