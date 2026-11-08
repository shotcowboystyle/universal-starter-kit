/**
 * The auto-layout contract, design §8. Types only — no dagre, no DOM, no
 * React, no runtime at all.
 *
 * It is its own module because THREE realms read it: the canvas on the main
 * thread, the generated worker bundle, and the Hermes-inline path on native.
 * Putting the wire protocol beside the engine would have made the runner
 * import the engine just to name a message.
 *
 * **elk is not here, and that is deliberate.** Design §8 describes an optional
 * `@repo/node-graph/layout-elk` entry, and the plan's decision D2
 * gates it on a licence ruling that has NOT been made: elkjs is `EPL-2.0 OR
 * GPL-3.0-or-later` against this repo's Apache-2.0. So `LayoutEngine` has one
 * member, the subpath does not exist, and `worker.generated.test.ts` asserts
 * the token `elkjs` appears nowhere in the bundled worker. When the ruling
 * lands, this union grows; until then a second engine cannot be added by
 * accident.
 */

import type { EdgeId, NodeId, XY } from '../model/document';

/** One member until decision D2 is ruled. See the module header. */
export type LayoutEngine = 'dagre';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

/**
 * A node as the engine sees it: a box and where it currently sits.
 *
 * `width` / `height` are the SEEDED measure (design §5), not a DOM read. The
 * engine runs off the main thread and could not measure anything even if it
 * wanted to, which is the same constraint that makes the seed load-bearing on
 * first paint.
 */
export interface LayoutNodeInput {
  readonly id: NodeId;
  readonly width: number;
  readonly height: number;
  /** Top-left, the document's convention. Read for the anchor and for fixed nodes. */
  readonly position: XY;
}

export interface LayoutEdgeInput {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
}

export interface LayoutOptions {
  readonly direction?: LayoutDirection;
  /** Gap between nodes on the same rank. dagre's `nodesep`. */
  readonly nodeSpacing?: number;
  /** Gap between ranks. dagre's `ranksep`. */
  readonly rankSpacing?: number;
  /** Gap between edges entering the same node. dagre's `edgesep`. */
  readonly edgeSpacing?: number;
  /**
   * Tidy only these. Every other node is FIXED: it keeps its position exactly,
   * and it is absent from the graph handed to dagre rather than present as an
   * obstacle — dagre has no notion of a fixed node, so leaving one in would
   * have it ranked and moved like any other.
   */
  readonly subset?: readonly NodeId[];
}

export interface LayoutRequest {
  readonly nodes: readonly LayoutNodeInput[];
  readonly edges: readonly LayoutEdgeInput[];
  readonly options?: LayoutOptions;
}

export interface LayoutResult {
  /**
   * EVERY input node id, moved or fixed. A fixed node maps to the position it
   * came in with, so the result is a complete description of the arrangement
   * and `setPositions` can be built from it without consulting the document —
   * which matters because the result arrives from another thread, possibly
   * after the document has moved on (see `generation`).
   */
  readonly positions: Readonly<Record<NodeId, XY>>;
  /** The ids the engine actually laid out, in sorted order. */
  readonly moved: readonly NodeId[];
  readonly engine: LayoutEngine;
  /** Wall-clock milliseconds inside the engine. Reported by the story. */
  readonly ms: number;
  /**
   * Which runner produced it — stamped by the RUNNER, not by the engine.
   *
   * `layoutWithDagre` runs in three realms and cannot tell which one it is in,
   * so the field is optional on the engine's own return and filled in on the
   * main thread. Design §13.2 records it with every device run, because an
   * accidental `inline` fallback has to be visible in the data rather than
   * hidden inside a plausible-looking number.
   */
  readonly runner?: LayoutRunnerKind;
}

/**
 * Design §8's four. `resolveRunner()` returns one of them and the canvas
 * reports it in diagnostics, so an accidental `inline` on a platform that has
 * `Worker` is visible in the data rather than hidden in a bad number.
 */
export type LayoutRunnerKind = 'worker-blob' | 'worker-url' | 'hermes-inline' | 'inline';

export type LayoutWorkerRequest =
  | { readonly t: 'ping' }
  | { readonly t: 'layout'; readonly id: number; readonly request: LayoutRequest };

export type LayoutWorkerResponse =
  | { readonly t: 'pong' }
  | { readonly t: 'result'; readonly id: number; readonly result: LayoutResult }
  | { readonly t: 'error'; readonly id: number; readonly message: string };
