/**
 * `--mpo-graph-zoom` on the canvas root — milestone 6, design §7.1 H7.
 *
 * The 44 px port hit region is an `::after` pseudo-element, and every element
 * a node owns lives INSIDE `.react-flow__viewport`, whose transform carries the
 * pan and the zoom. So a region declared 44 px renders 44 × zoom SCREEN px, and
 * on device that was measured rather than reasoned about: on the iPhone 16e at
 * zoom 0.377 the region was 16.6 pt wide — a half-width of 8.3 pt against a
 * demanded 18 — and a tap 18 pt off the painted centre panned the canvas
 * instead of grabbing the port. The same miss on emulator-5592 at zoom 0.397.
 *
 * The fix is to counter-scale the region by 1/zoom, which needs the zoom in
 * CSS. This writes it, and it writes it IMPERATIVELY: `style.setProperty` on a
 * ref rather than a React prop, because a viewport change is a per-frame event
 * during a pinch and re-rendering the canvas tree 120 times a second to move a
 * custom property would cost more than the region is worth.
 *
 * The component itself still re-renders per zoom frame — `useStore` is a
 * subscription — but it renders `null` and has no children, so the cost is one
 * function call and a store comparison. The SELECTOR reads only `transform[2]`,
 * so a pan (which changes `transform[0]` and `[1]`) wakes nothing here.
 */

import { useEffect } from 'react';

import { useStore } from './xy';

/** The property name, in one place. `css/graph.css` reads it. */
export const graphZoomVarName = '--mpo-graph-zoom';

export interface GraphZoomVarProps {
  readonly rootRef: { current: HTMLElement | null };
}

export const GraphZoomVar = ({ rootRef }: GraphZoomVarProps) => {
  const zoom = useStore((state) => state.transform[2]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    // A zoom of 0 is not a thing React Flow produces, but dividing by one in
    // CSS is silent and produces an infinitely large hit region, which would
    // swallow the whole canvas. The floor is the same `minZoom` the canvas
    // defaults to, so the region can never grow past what that zoom allows.
    root.style.setProperty(graphZoomVarName, String(zoom > 0 ? zoom : 1));
  }, [rootRef, zoom]);

  return null;
};
