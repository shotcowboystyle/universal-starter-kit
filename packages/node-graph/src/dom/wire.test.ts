/**
 * The wire is the whole bridge surface, so it is specced as data rather than
 * as behavior: a table the spec walks, not a set of hand-written cases that
 * drift from it.
 *
 * Four things are load-bearing here and each has a failure it is preventing.
 *
 *  1. **Round-trip.** Every variant survives `JSON.stringify`/`parse`. A field
 *     that cannot (a `Map`, a `Date`, an `undefined` that matters) silently
 *     becomes a different object on the far side of a WebView, and the symptom
 *     is a wrong render with no error.
 *  2. **The emission table.** Design 9.1's table is a `const` in `wire.ts` and
 *     this spec walks it. Adding a variant without a throttle decision is a
 *     TYPE error (the table is mapped over the union) and adding one without a
 *     round-trip fixture is a FAILURE here, so neither can be forgotten.
 *  3. **The `ResizeObserver loop` filter.** React Flow's own observer trips
 *     that notice on every layout pass. Treating it as fatal blanked the canvas
 *     mid-drag in the gate. So it is dropped — and NOTHING else is, including
 *     other errors that mention `ResizeObserver`, or the notice quoted inside
 *     somebody else's message.
 *  4. **Boot stages.** The native watchdog names the last stage reached. A
 *     stage that could go backwards would understate how far boot got and send
 *     a reader to the wrong layer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FaceProbe } from '../theme/faces';

import { bootStageIndex, bootStages, readBootRecord, readBootStage, resetBoot, stampBootStage } from './boot';
import type { BootStage } from './boot';
import {
  createGraphEventEmitter,
  createRevEchoGate,
  decodeGraphEvent,
  encodeGraphEvent,
  graphEventEmission,
  graphEventKinds,
  isBenignCanvasError,
} from './wire';
import type { FaceProbeWire, GraphEventKind, GraphEventWire } from './wire';

/**
 * One fixture per variant. Keyed by tag so the spec can assert the set of keys
 * equals `graphEventKinds` — a new variant with no fixture fails here rather
 * than shipping untested across a bridge nobody can debug from.
 */
const fixtures = {
  ready: {
    t: 'ready',
    diagnostics: {
      stage: 'ready',
      bootMs: 812,
      renderer: 'react-flow-dom',
      xyflowVersion: '12.11.5',
      layoutRunner: 'main',
      faces: [
        {
          stack: 'Inter, "Helvetica Neue", sans-serif',
          widthStack: 210.13,
          widthFirstCorrupted: 205.28,
          matched: true,
          conclusive: true,
        },
        {
          stack: 'ui-monospace, monospace',
          widthStack: 217.59,
          widthFirstCorrupted: 217.59,
          matched: false,
          conclusive: true,
        },
      ],
      faceDelivery: [
        { id: 'inter-400', family: 'Inter', weight: 400, source: 'inline' },
        { id: 'inter-700', family: 'Inter', weight: 700, source: 'asset' },
      ],
      nodesMounted: 10,
      nodesInDocument: 12,
      culling: true,
      renderMode: 'detail',
      scheme: 'dark',
      lastError: null,
    },
  },
  commit: {
    t: 'commit',
    rev: 7,
    commandsJson: '[{"t":"moveNodes","deltas":{"a":{"x":12.5,"y":-4}}}]',
  },
  selection: { t: 'selection', ids: ['a', 'b', 'c'] },
  viewport: { t: 'viewport', viewport: { x: -120.25, y: 44, zoom: 0.85 } },
  nodeActivate: { t: 'nodeActivate', id: 'a' },
  connectRefused: {
    t: 'connectRefused',
    code: 'dataTypeMismatch',
    message: 'number cannot connect to string',
  },
  haptic: { t: 'haptic', kind: 'selection' },
  metrics: { t: 'metrics', frames: [16.7, 16.6, 33.4], label: 'drag-200', didMove: true },
  paint: { t: 'paint', bootMs: 634 },
  layoutResult: { t: 'layoutResult', runner: 'hermes-inline', ms: 271.4, nodeCount: 200 },
  perfReport: {
    t: 'perfReport',
    report: {
      ok: true,
      label: 'pan-200',
      nodeCount: 200,
      culling: true,
      layoutRunner: 'hermes-inline',
      didMove: true,
      durationMs: 3012.5,
      stats: {
        samples: 180,
        mean: 17.2,
        p50: 16.7,
        p95: 24.9,
        worst: 41.2,
        over16_7: 61,
        over33_3: 2,
        fps: 58.14,
      },
      // Six scripted pans, bracketed. `stats` above is the whole Start-to-Stop
      // window; this is the cell design 13.2 actually asks for.
      gesture: {
        stats: {
          samples: 118,
          mean: 18.9,
          p50: 17.1,
          p95: 26.4,
          worst: 41.2,
          over16_7: 55,
          over33_3: 2,
          fps: 52.91,
        },
        segments: 6,
        idleFrames: 62,
        unclosed: 0,
      },
      reportJson: '{"label":"pan-200"}',
    },
  },
  lasso: { t: 'lasso', phase: 'arm', ids: [], haptic: 'selection' },
  error: {
    t: 'error',
    phase: 'module',
    message: "Cannot find module './NodeGraphDomInner'",
    stack: 'at node-graph-dom.ts:41',
  },
} satisfies { readonly [K in GraphEventKind]: Extract<GraphEventWire, { t: K }> };

describe('the GraphEventWire union', () => {
  it('has a fixture for every declared kind, and no stray fixture', () => {
    expect(Object.keys(fixtures).toSorted()).toStrictEqual(graphEventKinds.toSorted());
  });

  it.each(graphEventKinds)('round-trips %s through JSON with no loss', (kind) => {
    const event = fixtures[kind];
    const decoded = decodeGraphEvent(encodeGraphEvent(event));
    expect(decoded).toStrictEqual(event);
    expect(decoded.t).toBe(kind);
  });

  it('refuses a payload whose tag is not a declared kind', () => {
    expect(() => decodeGraphEvent('{"t":"nudge"}')).toThrow(/nudge/u);
  });

  it('refuses a payload that is not an object', () => {
    expect(() => decodeGraphEvent('"ready"')).toThrow(/not an object/u);
  });
});

describe('the emission table (design 9.1)', () => {
  it('covers exactly the declared kinds', () => {
    expect(Object.keys(graphEventEmission).toSorted()).toStrictEqual(graphEventKinds.toSorted());
  });

  it('gives every kind a non-empty `firesOn`', () => {
    for (const kind of graphEventKinds) {
      expect(graphEventEmission[kind].firesOn.length).toBeGreaterThan(0);
    }
  });

  /**
   * The numbers, asserted literally. A silent change to 250 ms would look
   * fine on a desktop and cost a frame budget on a phone, and nothing else in
   * the repo would notice.
   */
  it("carries design 9.1's throttles verbatim", () => {
    expect(graphEventEmission.commit.throttle).toStrictEqual({ mode: 'none' });
    expect(graphEventEmission.selection.throttle).toStrictEqual({ mode: 'none' });
    expect(graphEventEmission.nodeActivate.throttle).toStrictEqual({ mode: 'none' });
    expect(graphEventEmission.connectRefused.throttle).toStrictEqual({ mode: 'none' });
    expect(graphEventEmission.viewport.throttle).toStrictEqual({ mode: 'trailing', ms: 125 });
    expect(graphEventEmission.haptic.throttle).toStrictEqual({ mode: 'floor', ms: 120 });
    expect(graphEventEmission.metrics.throttle).toStrictEqual({ mode: 'onDemand' });
  });

  /** `ready` and `error` are absent from the design's table; these are the decisions taken. */
  it("decides the two kinds design 9.1's table omits", () => {
    expect(graphEventEmission.ready.throttle).toStrictEqual({ mode: 'none' });
    expect(graphEventEmission.error.throttle).toStrictEqual({ mode: 'none' });
  });
});

/** A fake clock and timer queue around a real emitter. */
const harness = () => {
  const sent: GraphEventWire[] = [];
  let clock = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextHandle = 1;
  const emitter = createGraphEventEmitter({
    send: (json) => {
      sent.push(decodeGraphEvent(json));
    },
    now: () => clock,
    schedule: (fn, ms) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: clock + ms, fn });
      return handle;
    },
    cancel: (handle) => {
      timers.delete(handle as number);
    },
  });
  const advance = (ms: number) => {
    clock += ms;
    // A snapshot: a timer's callback may schedule another one.
    // oxlint-disable-next-line unicorn/no-useless-spread -- deliberate snapshot of a Map mutated inside the loop
    for (const [handle, timer] of [...timers]) {
      if (timer.at > clock) {
        continue;
      }
      timers.delete(handle);
      timer.fn();
    }
  };
  return { advance, emitter, sent };
};

describe(createGraphEventEmitter, () => {
  it('sends an unthrottled kind straight through', () => {
    const { emitter, sent } = harness();
    emitter.emit(fixtures.commit);
    emitter.emit(fixtures.selection);
    expect(sent.map((event) => event.t)).toStrictEqual(['commit', 'selection']);
  });

  /** Design 9.1: a 30-change drag produces exactly ONE bridge crossing. */
  it('coalesces a trailing kind to one crossing per window, carrying the last value', () => {
    const { advance, emitter, sent } = harness();
    for (let index = 0; index < 30; index += 1) {
      emitter.emit({ t: 'viewport', viewport: { x: index, y: 0, zoom: 1 } });
      advance(2);
    }
    expect(sent).toStrictEqual([]);
    advance(125);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toStrictEqual({ t: 'viewport', viewport: { x: 29, y: 0, zoom: 1 } });
  });

  it('lets a floor kind through once per floor and drops the rest', () => {
    const { advance, emitter, sent } = harness();
    emitter.emit({ t: 'haptic', kind: 'selection' });
    emitter.emit({ t: 'haptic', kind: 'impact' });
    advance(60);
    emitter.emit({ t: 'haptic', kind: 'impact' });
    expect(sent).toHaveLength(1);
    advance(60);
    emitter.emit({ t: 'haptic', kind: 'warning' });
    expect(sent.map((event) => (event as { kind: string }).kind)).toStrictEqual(['selection', 'warning']);
  });

  it('flush() sends a pending trailing event immediately and cancels its timer', () => {
    const { advance, emitter, sent } = harness();
    emitter.emit(fixtures.viewport);
    emitter.flush();
    expect(sent).toHaveLength(1);
    advance(1000);
    expect(sent).toHaveLength(1);
  });

  it('dispose() drops a pending trailing event rather than firing it after unmount', () => {
    const { advance, emitter, sent } = harness();
    emitter.emit(fixtures.viewport);
    emitter.dispose();
    advance(1000);
    expect(sent).toStrictEqual([]);
  });
});

describe(isBenignCanvasError, () => {
  const benign = [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
    'ResizeObserver loop completed with undelivered notifications',
    'Uncaught Error: ResizeObserver loop limit exceeded',
    'Error: ResizeObserver loop completed with undelivered notifications.',
  ];

  /**
   * "and ONLY that message". Every one of these is a real error a reader has
   * to see, and three of them mention `ResizeObserver` — a substring test
   * would swallow them and the canvas would fail silently again, which is the
   * exact bug the filter exists to avoid re-creating.
   */
  const fatal = [
    'ResizeObserver is not defined',
    "TypeError: Failed to construct 'ResizeObserver': 1 argument required",
    "Cannot read properties of undefined (reading 'ResizeObserver')",
    'Error thrown from my ResizeObserver loop handler',
    'loop limit exceeded',
    'Maximum update depth exceeded',
    "Uncaught SyntaxError: Cannot use 'import.meta' outside a module",
    '',
  ];

  it.each(benign)('drops %j', (message) => {
    expect(isBenignCanvasError(message)).toBe(true);
  });

  it.each(fatal)('keeps %j', (message) => {
    expect(isBenignCanvasError(message)).toBe(false);
  });

  it('tolerates a non-string the browser handed it', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- undefined is the case under test
    expect(isBenignCanvasError(undefined)).toBe(false);
    expect(isBenignCanvasError(null)).toBe(false);
  });
});

describe(createRevEchoGate, () => {
  it('ignores an inbound document whose rev the canvas emitted itself', () => {
    const gate = createRevEchoGate();
    gate.markEmitted(7);
    expect(gate.acceptInbound(7)).toBe(false);
    expect(gate.acceptInbound(8)).toBe(true);
  });

  it('ignores a rev it has already applied, so a re-render does not re-apply', () => {
    const gate = createRevEchoGate();
    expect(gate.acceptInbound(3)).toBe(true);
    expect(gate.acceptInbound(3)).toBe(false);
  });

  it('ignores a stale rev that arrives out of order', () => {
    const gate = createRevEchoGate();
    expect(gate.acceptInbound(9)).toBe(true);
    expect(gate.acceptInbound(4)).toBe(false);
  });

  it('accepts the first document, whatever its rev', () => {
    expect(createRevEchoGate().acceptInbound(0)).toBe(true);
    expect(createRevEchoGate().acceptInbound(41)).toBe(true);
  });

  it('reports the high-water mark so a diagnostics panel can show it', () => {
    const gate = createRevEchoGate();
    gate.markEmitted(12);
    expect(gate.highWater()).toBe(12);
  });
});

describe('boot stages', () => {
  beforeEach(() => {
    resetBoot();
  });

  it("declares design 9.4's six stages in order", () => {
    expect([...bootStages]).toStrictEqual(['script', 'module', 'faces', 'provider', 'flow', 'ready']);
  });

  it('reads null before anything is stamped', () => {
    expect(readBootStage()).toBeNull();
  });

  it('stamps in order, and readBootStage() returns the last one', () => {
    for (const stage of bootStages) {
      stampBootStage(stage);
    }
    expect(readBootStage()).toBe('ready');
    expect(readBootRecord()?.history).toStrictEqual([...bootStages]);
  });

  /**
   * The watchdog prints "the last stage reached". A regression would understate
   * how far boot got and point a reader at the wrong layer.
   */
  it('refuses to go backwards', () => {
    stampBootStage('provider');
    stampBootStage('module');
    expect(readBootStage()).toBe('provider');
    expect(readBootRecord()?.history).toStrictEqual(['provider']);
  });

  it('treats a repeat of the current stage as a no-op', () => {
    stampBootStage('module');
    stampBootStage('module');
    expect(readBootRecord()?.history).toStrictEqual(['module']);
  });

  /** Retry remounts the WebView under a new key, and boot starts over. */
  it('resets the record when `script` is stamped again', () => {
    stampBootStage('flow');
    stampBootStage('script');
    expect(readBootStage()).toBe('script');
    expect(readBootRecord()?.history).toStrictEqual(['script']);
  });

  it('orders stages by index', () => {
    expect(bootStageIndex('script')).toBe(0);
    expect(bootStageIndex('ready')).toBe(bootStages.length - 1);
    expect(bootStageIndex('nope' as BootStage)).toBe(-1);
  });

  /**
   * `node-graph-dom.ts` writes this global INLINE — it cannot import `boot.ts`,
   * because the entry must have no top-level import of ours that can throw.
   * So `boot.ts` has to read a record it did not write.
   */
  it('reads a bare record the DOM entry stamped inline', () => {
    Reflect.set(globalThis, '__mp_graph_boot', { stage: 'script' });
    expect(readBootStage()).toBe('script');
    expect(readBootRecord()?.history).toStrictEqual(['script']);
  });

  it('reads null from a record whose stage is not a declared stage', () => {
    Reflect.set(globalThis, '__mp_graph_boot', { stage: 'banana' });
    expect(readBootStage()).toBeNull();
  });

  it('reads null from a global some other library clobbered', () => {
    Reflect.set(globalThis, '__mp_graph_boot', 'hello');
    expect(readBootStage()).toBeNull();
    expect(readBootRecord()).toBeNull();
  });

  it('stamps a timestamp so diagnostics can show how long a stage took', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    stampBootStage('script');
    expect(readBootRecord()?.at).toBe(1_700_000_000_000);
    nowSpy.mockRestore();
  });
});

describe('FaceProbeWire carries a whole probe', () => {
  /**
   * The drift this exists to stop, found on the iPhone 16e at task 2.7.
   *
   * The wire used to declare `{ family, matched }` while `GraphDiagnostics`
   * rendered `stack`, `widthStack`, `widthFirstCorrupted` and `conclusive` —
   * so the panel could not have shown a probe that crossed the bridge even if
   * one had. A boolean with no widths behind it is the font-NAME assertion
   * AC-3 exists to replace, which is why the whole probe travels or none of it
   * does.
   */
  it('has exactly the keys FaceProbe has', () => {
    const probe: FaceProbe = {
      stack: 'Inter, "Helvetica Neue", sans-serif',
      widthStack: 210.13,
      widthFirstCorrupted: 205.28,
      matched: true,
      conclusive: true,
    };
    // Assignable in BOTH directions: tsgo fails this file if either side grows
    // a field the other lacks.
    const wire: FaceProbeWire = probe;
    const back: FaceProbe = wire;
    expect(Object.keys(back).toSorted()).toStrictEqual([
      'conclusive',
      'matched',
      'stack',
      'widthFirstCorrupted',
      'widthStack',
    ]);
  });

  it('survives the round trip the bridge puts it through', () => {
    const wire: FaceProbeWire = {
      stack: 'ui-monospace, monospace',
      widthStack: 217.59,
      widthFirstCorrupted: 217.59,
      matched: false,
      conclusive: true,
    };
    // oxlint-disable-next-line react-doctor/no-json-parse-stringify-clone, unicorn/prefer-structured-clone -- the JSON round trip IS the bridge under test, not a clone
    expect(JSON.parse(JSON.stringify(wire))).toStrictEqual(wire);
  });
});
