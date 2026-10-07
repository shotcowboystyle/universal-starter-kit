/**
 * The four CSS rules without which the canvas is laid out and invisible.
 *
 * `NodeGraphWeb` sizes its root `width: 100%; height: 100%`, and React Flow's
 * own `.react-flow` does the same. A percentage height resolves against the
 * parent's height, and in an Expo DOM component the chain above it —
 * `html > body > #root` — is a plain auto-height document. So `height: 100%`
 * computes to `auto`, `.react-flow` collapses, and `@xyflow/react`'s
 * `overflow: hidden` on the pane clips every node away.
 *
 * MEASURED ON BOTH PLATFORMS at tasks 2.7 and 2.8, and it is the failure that
 * looks most like nothing being wrong. The iPhone 16e's accessibility tree
 * carried all ten mounted node bodies with correct titles, correct three-column
 * geometry, and heights that MOVED when the space knob was flipped — every
 * signal a reader would take as proof — while the screen showed white. There
 * was no fallback, because there was no error: boot ran through to `ready`, the
 * canvas was fine, and it had nowhere to paint. emulator-5592 looked identical.
 *
 * The gate spike carried these rules and passed with them
 * (`components/GraphCanvas.tsx`'s `LAYOUT_CSS`); the package never ported them,
 * so this is the one part of the gate that was proven and then lost.
 *
 * It is a `<style>` element and nothing else, so it costs no layout and cannot
 * move a node. Mounted by `NodeGraphDomInner` for the same reason `GraphFaces`
 * is: inside the WebView is the only place either can do anything.
 */

import type { ReactNode } from 'react';

/**
 * `#root` is Expo's own mount point for a DOM component, and `#root > div` is
 * whatever React renders first inside it — neither is ours to name in markup,
 * so they are named here.
 *
 * `margin: 0` on `body` matters as much as the heights: a UA's default 8px
 * margin makes the canvas 16px wider than its WebView, and React Flow's pane
 * then reports a viewport that does not match the box the user is touching.
 */
export const graphDomLayoutCss = [
  'html, body { height: 100%; margin: 0; padding: 0; }',
  '#root { height: 100%; }',
  '#root > div { height: 100%; }',
].join('\n');

/** The sheet, and nothing else. Renders nothing where there is no DOM. */
export function GraphDomLayout(): ReactNode {
  if (typeof document === 'undefined') {
    return null;
  }
  return <style data-mpo-graph-layout="root-height">{graphDomLayoutCss}</style>;
}
