/**
 * What a WebView that came up wrong is able to tell you (design §9.5).
 *
 * Every field here answers a question an agent reading a device screenshot has
 * to be able to answer without a console: how far did boot get, which renderer
 * drew this, which layout runner resolved, did the face actually paint, how
 * many nodes mounted, and what threw first.
 */

import type { BootStage } from '../dom/boot';
import type { GraphErrorPhase } from '../dom/wire';
import type { LayoutRunnerKind as LayoutEngineRunnerKind } from '../layout/types';
import type { FaceProbe } from '../theme/faces';

/**
 * Design §8's four, plus `none`.
 *
 * `none` is not in the design's union and is not a fifth strategy — it is the
 * honest state before a canvas has resolved a runner. The alternative was
 * reporting `inline`, which is a real runner and would read as "the worker
 * fallback fired" to exactly the person the field exists for.
 *
 * The four are IMPORTED rather than restated. Milestone 4 made
 * `layout/types.ts` the definition, and two hand-kept copies of a union is how
 * a fifth runner ends up reportable in one file and not the other.
 */
export type LayoutRunnerKind = LayoutEngineRunnerKind | 'none';

export type GraphRenderer = 'react-flow-web' | 'react-flow-dom';

/**
 * Which of design 6.3's two mechanisms actually delivered a face.
 *
 * On device this is the whole answer to "did the asset URL work, or did the
 * 211 KB of base64 carry it" — a question nothing on screen could answer
 * before MPO-211, because `GraphFaces` reported it to a callback the panel
 * never saw. `pending` means the probe has not answered yet, and is reported
 * rather than guessed.
 */
export interface GraphFaceDelivery {
  readonly id: string;
  readonly family: string;
  readonly weight: number;
  // oxlint-disable-next-line sonarjs/max-union-size -- the four delivery states of the wire contract; a named alias would add nothing
  readonly source: 'asset' | 'inline' | 'pending' | 'failed';
}

export interface GraphDiagnostics {
  readonly stage: BootStage | null;
  /**
   * Milliseconds from the entry's `script` stamp to this record, or `null`
   * where no boot record exists.
   *
   * The number the native watchdog's budget is set FROM (MPO-211). Design
   * 9.4's 4000 ms was never measured; on emulator-5590 rebooted fresh it
   * fired on a canvas that then rendered on the first Retry.
   */
  readonly bootMs: number | null;
  readonly renderer: GraphRenderer;
  readonly xyflowVersion: string;
  readonly layoutRunner: LayoutRunnerKind;
  readonly faces: readonly FaceProbe[];
  /** Which mechanism delivered each declared face. Empty where none was mounted. */
  readonly faceDelivery: readonly GraphFaceDelivery[];
  /**
   * Node bodies React Flow has MOUNTED, from `nodeCensus` — not the document's
   * node count, which is the field below.
   *
   * The two differ whenever `culling` is true: the demo document has 12 nodes
   * and mounts 10 at the default viewport. Reporting one number for both is
   * what made "renders 12 nodes" unreadable off a device screenshot.
   */
  readonly nodesMounted: number;
  /** Nodes in the document the canvas parsed. */
  readonly nodesInDocument: number;
  readonly culling: boolean;
  readonly renderMode: 'detail' | 'overview';
  readonly scheme: 'light' | 'dark';
  readonly lastError: { readonly phase: GraphErrorPhase; readonly message: string } | null;
}

/**
 * What the caller knows, as against what this module derives.
 *
 * The split is deliberate. `stage`, `xyflowVersion` and `lastError` are read
 * from module state and cannot be faked by a caller; the rest are live values
 * only the canvas holds. Making the canvas hand them in beats reaching into
 * React Flow's store from a second place — `renderMode` in particular is
 * already computed once, in `GraphNodeHost`, from the live zoom.
 */
export interface GraphDiagnosticsInput {
  readonly renderer: GraphRenderer;
  readonly nodesMounted: number;
  readonly nodesInDocument: number;
  readonly culling: boolean;
  readonly renderMode: 'detail' | 'overview';
  readonly scheme: 'light' | 'dark';
  /** Omitted until `resolveRunner()` has answered. Reported as `none`. */
  readonly layoutRunner?: LayoutRunnerKind;
  /** From `probeRenderedFamily`. Omitted reports as an empty list, never absent. */
  readonly faces?: readonly FaceProbe[];
  /** From `GraphFaces`' `onStatus`. Omitted reports as an empty list, never absent. */
  readonly faceDelivery?: readonly GraphFaceDelivery[];
}
