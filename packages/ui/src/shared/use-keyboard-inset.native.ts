/**
 * How many points of the native screen the software keyboard currently covers.
 *
 * A sheet that ignores this draws its frame UNDER the keyboard: the last row
 * is sliced mid-glyph, the rounded top edge lands on top of the autocomplete
 * suggestion strip, and the field being typed into can be occluded by it.
 * KeyboardAvoidingView is not enough inside a `Modal` — it pads the
 * container but the sheet keeps whatever fixed height it was given, so it
 * simply overflows off the top instead of shrinking.
 *
 * The number comes from the platform, never from a constant: the suggestion
 * strip is exactly the band that overlapped, and its height varies with the
 * field, the language and whether QuickType is on.
 */

import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // iOS fires the *Will* pair one frame before the animation, so the sheet
    // resizes with the keyboard rather than after it. Android has no *Will*.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event) => {
      const screen = event?.endCoordinates;
      if (!screen) {
        return;
      }
      const windowHeight = Dimensions.get('window').height;
      setInset(Math.max(0, Math.round(windowHeight - screen.screenY)));
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setInset(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
