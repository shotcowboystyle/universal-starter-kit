// GJS replica of the tamagui meta-package's Anchor view.
//
// Anchor is defined INSIDE the `tamagui` package (src/views/Anchor.tsx),
// not in any granular @tamagui/* package the barrel could re-export, and
// tamagui's export map hides ./src/*. The component is ten lines: a
// styled SizableText that opens its href through React Native's Linking
// on press. Replicate exactly that — Linking comes from the react-native
// alias, where @react-gnome/react-native backs it with Gtk.show_uri.

import { styled } from '@tamagui/core';
import type { SizableTextProps } from '@tamagui/text';
import { SizableText } from '@tamagui/text';
import { Linking } from 'react-native';

export interface AnchorExtraProps {
  href?: string;
  target?: string;
  rel?: string;
}

export type AnchorProps = SizableTextProps & AnchorExtraProps;

const AnchorFrame = styled(SizableText, {
  name: 'Anchor',
  role: 'link',
});

export const Anchor = AnchorFrame.styleable<AnchorExtraProps>(({ href, target: _target, rel: _rel, ...props }, ref) => (
  <AnchorFrame
    {...props}
    onPress={(event) => {
      props.onPress?.(event);
      if (href !== undefined) {
        void Linking.openURL(href);
      }
    }}
    ref={ref as never}
  />
));
