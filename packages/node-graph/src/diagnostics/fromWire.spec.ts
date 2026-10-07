/**
 * The `ready` payload becoming design §9.5's record.
 *
 * The interesting half is `layoutRunner`: the wire types it as a plain string
 * so milestone 4 can add a runner without a bridge change, and the record types
 * it as a union the panel renders. A cast would let a canvas one version ahead
 * put a runner name on screen that this build knows nothing about; narrowing to
 * `none` says "no runner I recognise" instead, which is the honest reading of
 * an unknown value.
 */

import { describe, expect, it } from 'vitest';

import type { GraphDiagnosticsWire } from '../dom/wire';

import { graphDiagnosticsFromWire } from './fromWire';

const wire: GraphDiagnosticsWire = {
  stage: 'ready',
  bootMs: 1204,
  renderer: 'react-flow-dom',
  xyflowVersion: '12.11.5',
  layoutRunner: 'none',
  faces: [
    {
      stack: 'Inter, "Helvetica Neue", sans-serif',
      widthStack: 210.13,
      widthFirstCorrupted: 205.28,
      matched: true,
      conclusive: true,
    },
  ],
  faceDelivery: [{ id: 'inter-400', family: 'Inter', weight: 400, source: 'inline' }],
  nodesMounted: 10,
  nodesInDocument: 12,
  culling: true,
  renderMode: 'detail',
  scheme: 'dark',
  lastError: null,
};

describe(graphDiagnosticsFromWire, () => {
  it('carries every field the panel renders', () => {
    const record = graphDiagnosticsFromWire(wire);
    expect(record.stage).toBe('ready');
    expect(record.bootMs).toBe(1204);
    expect(record.nodesMounted).toBe(10);
    expect(record.nodesInDocument).toBe(12);
    expect(record.faces).toHaveLength(1);
    expect(record.faceDelivery[0]?.source).toBe('inline');
    expect(record.scheme).toBe('dark');
  });

  it('keeps a runner kind it recognises', () => {
    expect(graphDiagnosticsFromWire({ ...wire, layoutRunner: 'worker-blob' }).layoutRunner).toBe('worker-blob');
  });

  it('narrows a runner it does not recognise to none, rather than casting', () => {
    // A canvas from a later milestone naming a runner this build has never
    // heard of. Reporting the string verbatim would put an unknown runner on
    // screen as if this build knew what it meant.
    expect(graphDiagnosticsFromWire({ ...wire, layoutRunner: 'elk-worker' }).layoutRunner).toBe('none');
  });

  it("passes an error through as the panel's banner reads it", () => {
    const record = graphDiagnosticsFromWire({
      ...wire,
      lastError: { phase: 'module', message: 'boom' },
    });
    expect(record.lastError).toEqual({ phase: 'module', message: 'boom' });
  });
});
