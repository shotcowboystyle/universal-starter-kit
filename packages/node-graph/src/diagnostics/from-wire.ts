/**
 * The `ready` event's payload, as design §9.5's record.
 *
 * The two shapes are the same fields with one deliberate difference:
 * `GraphDiagnosticsWire.layoutRunner` is a plain string, so adding a layout
 * runner in milestone 4 is not a bridge change. This is the one place that
 * difference is reconciled, and an unknown runner narrows to `"none"` rather
 * than being cast — a value the panel invented would read as a runner that ran.
 *
 * Everything else crosses unchanged. `FaceProbeWire` and `FaceProbe` are the
 * same five fields, and `graphDiagnosticsWireFields` in `wire.test.ts` is what
 * holds them to that.
 */

import type { GraphDiagnosticsWire } from '../dom/wire';

import type { GraphDiagnostics, LayoutRunnerKind } from './types';

const layoutRunnerKinds: readonly LayoutRunnerKind[] = ['worker-blob', 'worker-url', 'hermes-inline', 'inline', 'none'];

const isLayoutRunner = (value: string): value is LayoutRunnerKind => layoutRunnerKinds.some((kind) => kind === value);

const asLayoutRunner = (value: string): LayoutRunnerKind => (isLayoutRunner(value) ? value : 'none');

export const graphDiagnosticsFromWire = (wire: GraphDiagnosticsWire): GraphDiagnostics => ({
  stage: wire.stage,
  bootMs: wire.bootMs,
  renderer: wire.renderer,
  xyflowVersion: wire.xyflowVersion,
  layoutRunner: asLayoutRunner(wire.layoutRunner),
  faces: wire.faces,
  faceDelivery: wire.faceDelivery,
  nodesMounted: wire.nodesMounted,
  nodesInDocument: wire.nodesInDocument,
  culling: wire.culling,
  renderMode: wire.renderMode,
  scheme: wire.scheme,
  lastError: wire.lastError,
});
