import { useCallback } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { TamaguiElement } from 'tamagui';

/**
 * Props the web DOM node accepts but Tamagui's RN-flavored prop types omit
 * (ARIA roles outside RN's `Role` union, hover callbacks, CSS-only style keys).
 */
export interface WebOnlyProps {
  role?: string;
  style?: CSSProperties;
  onScroll?: (() => void) | undefined;
  display?: 'grid';
  gridTemplateColumns?: string;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
}

/**
 * Pass web-only props through a JSX spread without widening them to a
 * dictionary: the `object` return type adds no keys to the checked prop type,
 * while the real props still reach the component at runtime.
 */
export const webOnlyProps = (props: WebOnlyProps): object => props;

/** True for a real DOM element; always false on native and during SSR. */
export const isDomElement = <N>(node: N): node is N & HTMLElement =>
  typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;

/**
 * Callback ref for a Tamagui `View` that records the node in `domRef` as a DOM
 * element (hotkey targets, scroll metrics, focus). `domRef.current` is null
 * wherever the node is not a DOM element. `domRef` stays a plain `useRef` in
 * the caller so hook dependency analysis still sees it as stable.
 */
export const useDomRefCallback = (domRef: RefObject<HTMLElement | null>) =>
  useCallback(
    (node: TamaguiElement | null) => {
      domRef.current = isDomElement(node) ? node : null;
    },
    [domRef],
  );

/** After an Escape cancel the pointer is still down: keep swallowing the click until it is released. */
export const holdClickSuppressionUntilRelease = (suppressRef: { current: boolean }) => {
  suppressRef.current = true;
  window.addEventListener(
    'pointerup',
    () => {
      setTimeout(() => {
        suppressRef.current = false;
      }, 0);
    },
    { once: true },
  );
};
