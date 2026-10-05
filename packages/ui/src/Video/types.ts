import type { ReactNode } from 'react';
import type { GetProps } from 'tamagui';

import { VideoFrame } from './VideoFrame';

export interface VideoProps extends Omit<GetProps<typeof VideoFrame>, 'children'> {
  /** Media URL. */
  src: string;
  /** Optional caption (figcaption). */
  children?: ReactNode;
  muted?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  poster?: string;
  /**
   * Custom overlay chrome (web) / native system chrome. Off = raw media,
   * no transport (muted-loop embeds).
   */
  controls?: boolean;
  /** Accessible title / aria-label for the player. */
  title?: string;
  /** Compact density: steps size/space down one level. */
  compact?: boolean;
}
