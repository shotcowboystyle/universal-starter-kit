/**
 * Native load-more trigger for DataTable's infinite mode.
 *
 * Web watches its sentinel with an IntersectionObserver. React Native has
 * none, and the table never sees its host's scroll events: the backoffice
 * list scrolls the whole screen in a ScrollView the table sits inside. So
 * the sentinel asks where it is on screen, on a short interval while more
 * pages exist, and fires once it comes within `leadPx` of the window's
 * bottom edge, the same lead web gives its observer.
 */

import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { Dimensions, View } from 'react-native';

export const NATIVE_SENTINEL_POLL_MS = 250;

export interface NativeInfiniteSentinelProps {
  onVisible: () => void;
  leadPx: number;
}

export function NativeInfiniteSentinel({ onVisible, leadPx }: NativeInfiniteSentinelProps) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      ref.current?.measureInWindow((_x, y, width) => {
        // An unmeasured view reports all zeros; width 0 means not laid out.
        if (!active || width <= 0) {
          return;
        }
        if (y <= Dimensions.get('window').height + leadPx) {
          onVisibleRef.current();
        }
      });
    }, NATIVE_SENTINEL_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [leadPx]);

  return (
    <View
      ref={ref}
      style={{ height: 1, width: '100%' }}
      aria-hidden
      testID="infinite-sentinel"
    />
  );
}
