import { Carousel, YStack } from '@repo/ui';
import { useState } from 'react';

import { ImageWell } from '../list/ImageWell';
import type { FrappeRecordSlide } from '../list/recordLook';

export interface RecordGalleryProps {
  /** The record's image candidates: the first slide walks them on error. */
  images: readonly string[];
  /** Further slides after the first. */
  slides?: readonly FrappeRecordSlide[];
  alt: string;
  tints?: readonly (string | undefined)[];
}

/**
 * The hero's images. A swipeable carousel once its width is measured; before
 * that (and on the server) the first image alone, so the hero never paints
 * empty. Wells take the measured width and slides sit flush, so each lands
 * exactly one width over.
 */
export function RecordGallery({ images, slides = [], alt, tints }: RecordGalleryProps) {
  const [width, setWidth] = useState(0);
  const first = (
    <ImageWell
      sources={images}
      alt={alt}
      tints={tints}
      inset={0.08}
    />
  );
  return (
    <YStack
      onLayout={(event) => {
        setWidth(Math.round(event.nativeEvent.layout.width));
      }}
      width="100%">
      {width > 0 && slides.length > 0 ? (
        <Carousel gap={0}>
          <ImageWell
            sources={images}
            alt={alt}
            tints={tints}
            inset={0.08}
            width={width}
          />
          {slides.map((slide) => (
            <ImageWell
              key={slide.src}
              sources={[slide.src]}
              alt={`${alt}, ${slide.label}`}
              pixelated={slide.pixelated}
              inset={0.14}
              backgroundColor="$color2"
              width={width}
              lazy
            />
          ))}
        </Carousel>
      ) : (
        first
      )}
    </YStack>
  );
}
