import { isTouchable, isWeb, isWebTouchable } from '@repo/platform';
import { useDidFinishSSR } from 'tamagui';

/** Match web SSR before adopting touch geometry. Native applies its floor immediately. */
export function useTouchSurface(): boolean {
  const didFinishSSR = useDidFinishSSR();
  return (!isWeb || didFinishSSR) && (isTouchable || isWebTouchable);
}
