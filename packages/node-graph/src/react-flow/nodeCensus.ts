/**
 * How many node bodies React Flow actually has mounted, right now.
 *
 * WHY THIS EXISTS. Design §9.5's record calls the field `nodesMounted`, and
 * until MPO-211 the DOM entry filled it with `document.nodes.length` — the
 * number of nodes in the DOCUMENT, which is a different number whenever
 * culling is on. On the demo document that is 12 against 10, and the gap is
 * the whole reason AC 2.7's "renders 12 nodes" could not be read off a device
 * screenshot: a panel reporting 12 while ten bodies are painted proves nothing
 * about either number.
 *
 * So the two are reported separately now, and this module owns the harder one.
 * `GraphNodeHost` is the ONE registered React Flow node type, so it mounts once
 * per node React Flow decides to render and unmounts when culling drops one.
 * Counting its instances counts exactly what is on screen, whatever body a
 * consumer's schema renders — a DOM query for the package's own
 * `data-graph-node` would miss a custom body, and a `.react-flow__node`
 * selector is banned outside the token bridge (lint-conventions' GRAPH VARS
 * COVERAGE).
 *
 * The register is a module global rather than React state because two
 * different trees read it: the canvas's own diagnostics, and a story rendering
 * `GraphDiagnostics` beside the canvas. It is per JS REALM, which is the right
 * grain here — inside a WebView there is exactly one canvas, and that is the
 * realm whose number crosses the bridge.
 *
 * `useSyncExternalStore` is the intended reader; `subscribeNodeCensus` and
 * `mountedNodeCount` are its two halves.
 */

const mounted = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Count a mounted node body. Returns the release, so a caller's effect cleanup
 * is the whole of the unregistration.
 *
 * Keyed by node id rather than counted, so React's mount → unmount → mount in
 * StrictMode, and a double-invoked effect, cannot inflate the number.
 */
export function registerMountedNode(id: string): () => void {
  const had = mounted.has(id);
  mounted.add(id);
  if (!had) {
    notify();
  }
  return () => {
    if (mounted.delete(id)) {
      notify();
    }
  };
}

export function mountedNodeCount(): number {
  return mounted.size;
}

export function subscribeNodeCensus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. Never called by the canvas — an unmount releases its own id. */
export function resetNodeCensus(): void {
  mounted.clear();
  notify();
}
