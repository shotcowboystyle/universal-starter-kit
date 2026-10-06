import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { Paragraph, YStack, styled } from 'tamagui';

import { wrapBareTextChildren } from '../shared/text-rides-text';

type ResolvedKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

// oxlint-disable-next-line react-doctor/only-export-components -- styled() frame is shared with index/index.native/types; consumers import it with VideoCaption from this module
export const VideoFrame = styled(YStack, {
  name: 'Video',
  width: '100%',
});

/**
 * Live-media tile frame: unclamped scale radius, no
 * CONTAINER-CAP, no status pip. The capped card-surface fragment is the
 * wrong recipe — it carries the Axiom 1 cap and padding a tile does not have.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- tile-frame helper shared by web and native Video; consumers import it with VideoFrame from this module
export const mediaTileFrameProps = (knobProps: ResolvedKnobProps) => {
  const frame = {
    backgroundColor: knobProps.surface.backgroundColor,
    borderRadius: knobProps.borderRadius.borderRadius,
    padding: 0,
    'data-media-tile': 'video',
  };
  const { className } = knobProps.borderRadius;
  return className === undefined || className === '' ? frame : { ...frame, className };
};

export const VideoCaption = ({ children }: { children: ReactNode }) => {
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  return (
    <Paragraph
      render="figcaption"
      color={knobProps.textAccentColor}>
      {wrapBareTextChildren(children, (label, key) => (
        <Paragraph
          key={key}
          render="span"
          {...knobProps.body}
          color={knobProps.textAccentColor}>
          {label}
        </Paragraph>
      ))}
    </Paragraph>
  );
};
