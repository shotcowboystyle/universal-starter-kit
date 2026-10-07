/**
 * The rule, as a warning a story author trips over once (milestone 6, task 6.1).
 *
 * `NodeGraph` on native accepts `children` and IGNORES them. That has been the
 * written contract since milestone 2 and it is still right: React Flow's
 * `<Background />` and `<Controls />` are components, a component cannot cross a
 * JSON bridge, and accepting them is what lets ONE story file serve both
 * platforms.
 *
 * What was wrong is that nothing said so at the moment it mattered. Measured
 * across MPO-212, MPO-213 and MPO-214: every device-facing control and readout
 * milestones 3-5 built was written as a child of `<NodeGraph>` — AutoLayout's
 * Tidy button, the Perf200 sampler and its `window.__mpoPerf200`, the Lasso
 * story's interceptor — and on device all of them silently vanished. Five
 * pending acceptance criteria, one cause, and no error anywhere: the canvas
 * painted, so nothing looked broken.
 *
 * So the contract now announces itself, ONCE per process, in dev only. Once
 * because the alternative is a warning per canvas per render, which is how a
 * console becomes something people stop reading. Dev only because in production
 * the author is not there and the message is for the author.
 *
 * It names both legal places rather than only the ban. A rule that says what
 * not to do teaches nothing at 2 a.m.
 */

let warned = false;

/** Test seam. Nothing in the package calls it. */
export function resetGraphChildrenWarning(): void {
  warned = false;
}

export const graphChildrenWarning =
  '[@repo/node-graph] <NodeGraph> was given children on native, and they are ' +
  'IGNORED: the canvas renders inside a WebView and a React element cannot cross the bridge. ' +
  'Put the control OUTSIDE the canvas as a native sibling and drive it through `graphRef` ' +
  '(fitView, relayout, zoomTo, centerOn, setSelection, exportViewport, undo, redo, perfStart, ' +
  'perfStop, perfMark), reading state back from the events; or, if it has to be inside the ' +
  'canvas, express it as a serializable option so the DOM bundle renders it. Design 9.1.';

/**
 * True when it warned. `children` is checked for a value rather than for a
 * count: `null`, `false` and `undefined` are all what a conditional child
 * collapses to, and warning about `{cond && <X/>}` when `cond` is false would
 * be a warning about code that is doing the right thing.
 */
export function warnOnGraphChildren(children: unknown): boolean {
  if (warned) {
    return false;
  }
  if (children === null || children === undefined || children === false) {
    return false;
  }
  if (Array.isArray(children) && children.every((child) => child === null || child === undefined || child === false)) {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  warned = true;
  // oxlint-disable-next-line no-console -- the one sink a story author reads
  console.warn(graphChildrenWarning);
  return true;
}
