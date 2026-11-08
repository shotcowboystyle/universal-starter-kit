/**
 * The bridge surface: ONE discriminated union, ONE channel.
 *
 * Design 9.1. Every function prop on an Expo DOM component is its own async
 * proxy with its own round trip, so nine callbacks would be nine proxies and a
 * tenth event later would be a change to the bridge rather than to a type. One
 * `onEvent(eventJson)` makes adding an event a type change and nothing else.
 *
 * The strings, not the objects, are what cross. `documentJson`, `commandsJson`
 * and `envelopeJson` are all deliberately pre-serialized on the side that owns
 * them: one `JSON.parse` inside beats structured prop walking across the
 * marshaller, and an identity check becomes a string compare.
 *
 * Design's emission table is the `graphEventEmission` const below, not a
 * comment. `createGraphEventEmitter` reads it, so the throttle column is
 * executable and `wire.test.ts` asserts the numbers verbatim.
 */

import type { FrameStats, GestureWindow } from '../bench/frame-sampler';
import type { GraphFontRef } from '../knobs/envelope';
import type { NodeId, Viewport } from '../model/index';

import type { BootStage } from './boot';

/**
 * Design 9.1 calls this `FontFaceWire`. It is `GraphFontRef` — the same shape
 * the envelope already carries — aliased rather than duplicated, so a face
 * cannot mean one thing on the envelope and another on the props.
 */
export type FontFaceWire = GraphFontRef;

export type GraphErrorPhase = 'boot' | 'module' | 'render' | 'runtime';

/** One family's outcome from the corrupted-first-family probe (design 6.3). */
/**
 * A face probe, whole, because half of one is not evidence.
 *
 * It used to be `{ family, matched }`, and that shape could not survive contact
 * with the panel that renders it: `GraphDiagnostics` prints the STACK and BOTH
 * widths, because design §6.3's control is "the same cascade with only the first
 * family name corrupted, measured twice". A boolean called `matched` with no
 * widths behind it is exactly the font-name assertion AC-3 exists to replace.
 *
 * `conclusive` rides along for the same reason it exists on `FaceProbe`: equal
 * widths are not a MISS when nothing measured, or when the stack has no
 * fallback behind its first name.
 */
export interface FaceProbeWire {
  readonly stack: string;
  readonly widthStack: number;
  /** The same cascade, first family name broken. */
  readonly widthFirstCorrupted: number;
  readonly matched: boolean;
  readonly conclusive: boolean;
}

/**
 * The JSON-safe projection of design 9.5's `GraphDiagnostics`.
 *
 * `layoutRunner` is a plain string here rather than a union: the runner kinds
 * land with milestone 4's layout engine, and a wire type that has to be
 * revised every time an engine is added would make the bridge the bottleneck
 * for a change that has nothing to do with it.
 */
/** Design 6.3's two mechanisms, plus the two states that are neither. */
export type GraphFaceSourceWire = 'asset' | 'inline' | 'pending' | 'failed';

export interface GraphFaceDeliveryWire {
  readonly id: string;
  readonly family: string;
  readonly weight: number;
  /** Design 6.3's two mechanisms, plus the two states that are neither. */
  readonly source: GraphFaceSourceWire;
}

export interface GraphDiagnosticsWire {
  readonly stage: BootStage | null;
  /** Milliseconds from the `script` stamp to `ready`. The watchdog's evidence. */
  readonly bootMs: number | null;
  readonly renderer: 'react-flow-web' | 'react-flow-dom';
  readonly xyflowVersion: string;
  readonly layoutRunner: string;
  readonly faces: readonly FaceProbeWire[];
  /** Which mechanism delivered each face INSIDE the WebView (design 6.3). */
  readonly faceDelivery: readonly GraphFaceDeliveryWire[];
  /** Node bodies React Flow mounted. Differs from the next field under culling. */
  readonly nodesMounted: number;
  readonly nodesInDocument: number;
  readonly culling: boolean;
  readonly renderMode: 'detail' | 'overview';
  readonly scheme: 'light' | 'dark';
  readonly lastError: { readonly phase: GraphErrorPhase; readonly message: string } | null;
}

/**
 * A finished perf run, as it crosses the bridge (milestone 6, design §13).
 *
 * The sampler now runs INSIDE the WebView, because that is the realm whose
 * `requestAnimationFrame` deltas are the frames a user sees — the host RN
 * view's FPS keeps ticking while the WebView is stalled. Nothing on the Hermes
 * side can read those deltas, so the run has to come back as an event.
 *
 * `stats` is `FrameStats` aliased rather than duplicated, exactly as
 * `FontFaceWire` aliases `GraphFontRef`: a percentile cannot be allowed to mean
 * one thing in the sampler and another on the wire.
 *
 * `reportJson` carries the WHOLE `FrameReport`, deltas included, so an artifact
 * writer on the native side has the raw run and not only its summary. It is a
 * string for the same reason `documentJson` is: one `JSON.parse` on the far
 * side beats structured prop walking across the marshaller, and 3600 numbers is
 * exactly the shape that walk is worst at.
 *
 * A REJECTED run crosses too. `reportRun` discards a run where nothing moved
 * (design §13.2), and a device readout that simply showed nothing would be
 * indistinguishable from a Stop that never reached the canvas.
 */
export interface PerfReportWire {
  readonly ok: boolean;
  /**
   * `empty`, `didMove` or `notStarted`, from `FrameReportRejection`. Absent on a
   * pass.
   *
   * `notStarted` is the WIRE instrument, and the only one of the three that is
   * not about the run: it means the canvas heard the Stop and had no run in
   * flight, so the Start is what went missing. A readout that stays on
   * `sampling…` means the opposite — the Stop never crossed at all — and those
   * two were indistinguishable on device until this reason existed.
   */
  readonly reason?: 'empty' | 'didMove' | 'notStarted';
  readonly message?: string;
  readonly label: string;
  readonly nodeCount: number;
  readonly culling: boolean;
  readonly layoutRunner: string;
  readonly didMove: boolean;
  readonly durationMs: number;
  readonly stats: FrameStats | null;
  /**
   * The GESTURE-ONLY cell: frames between `perfMark("start")` and
   * `perfMark("end")`, with the idle frames counted rather than mixed in.
   *
   * `stats` above is the whole window, Start to Stop. The m6 iOS number —
   * `952 frames · p95 18.8 · mean 16.7` over six scripted pans — was taken that
   * way and shipped with the caveat attached, because idle frames between one
   * pan and the next are cheap and plentiful: they pull the mean down and leave
   * the p95 roughly alone, so the cell was optimistic about the average and
   * there was no way to say by how much. Design §13.2's cell is the gesture.
   *
   * `null` when the run bracketed nothing, which is a different finding from a
   * bracketed gesture that produced no frames.
   */
  readonly gesture: GestureWindow | null;
  /** `JSON.stringify(FrameReport)` on a pass, `""` on a rejection. */
  readonly reportJson: string;
}

/**
 * Design §7.3's three moments, now that the gesture lives in the DOM realm.
 *
 * `arm` is the hold firing, `select` is the finger lifting with a marquee, and
 * `cancel` is every way out — past the slop, a second finger, an unmount. They
 * are three because a native shell buzzes on one, updates a readout on another
 * and clears it on the third.
 */
export type LassoPhaseWire = 'arm' | 'select' | 'cancel';

export type GraphEventWire =
  | { t: 'ready'; diagnostics: GraphDiagnosticsWire }
  | { t: 'commit'; rev: number; commandsJson: string }
  | { t: 'selection'; ids: readonly NodeId[] }
  | { t: 'viewport'; viewport: Viewport }
  | { t: 'nodeActivate'; id: NodeId }
  | { t: 'connectRefused'; code: string; message: string }
  | { t: 'haptic'; kind: 'selection' | 'impact' | 'warning' }
  | { t: 'metrics'; frames: readonly number[]; label: string; didMove: boolean }
  /**
   * The canvas PAINTED. Milestone 6, design §9.4.
   *
   * `ready` is deliberately late — it waits `graphReadySettleMs` so the
   * diagnostics it carries are filled in rather than reporting `nodesMounted:
   * 0` — and on emulator-5592 the 12 s watchdog fired on a canvas that was
   * already on screen. Ready and paint had come apart, and the watchdog was
   * timing the wrong one. This is the early half: the frame after React Flow's
   * first render, carrying nothing but the fact that pixels exist.
   */
  | { t: 'paint'; bootMs: number | null }
  /**
   * A tidy finished. Milestone 6, design §8 and §13.2.
   *
   * `runner` is the string the engine stamped, so `hermes-inline` on a phone
   * and `worker-blob` on web are readable from a native sibling — which is the
   * only place a device can read them, since the AutoLayout readout used to be
   * a child of the canvas and children are dropped on native.
   */
  /**
   * `error` is the m6 device-pass addition, and it exists because a relayout
   * that REJECTS used to answer with nothing at all.
   *
   * `layout()` rejects when the blob Worker cannot be constructed or dies
   * mid-flight — both of which are realm-local and therefore exactly what a
   * freshly recreated WebView can hit — and the bridge only had a `.then`. So
   * the toolbar sat on "laying out…" forever with no `layoutResult` ever
   * crossing, which is indistinguishable from a Tidy that never reached the
   * canvas. On a rejection the runner is `none` and `ms` is 0, because
   * inventing either would read as a successful tidy.
   */
  | { t: 'layoutResult'; runner: string; ms: number; nodeCount: number; error?: string }
  | { t: 'perfReport'; report: PerfReportWire }
  /**
   * The long press, from inside the WebView. Milestone 6, design §7.3.
   *
   * `haptic` is a HINT and not a command: the canvas cannot buzz, and whether a
   * buzz is appropriate is the shell's call. `null` on every phase but `arm`.
   */
  | {
      t: 'lasso';
      phase: LassoPhaseWire;
      ids: readonly NodeId[];
      haptic: LassoHapticWire;
    }
  | { t: 'error'; phase: GraphErrorPhase; message: string; stack?: string };

export type GraphEventKind = GraphEventWire['t'];

/** The buzz a `lasso` event hints at; `null` on every phase but `arm`. */
export type LassoHapticWire = 'selection' | 'impact' | 'warning' | null;

/**
 * The runtime list, maintained BESIDE the union rather than derived from the
 * table below — deriving it from the table would make the spec's coverage
 * assertion circular and prove nothing.
 *
 * The two conditional types under it are the compile-time half: a variant added
 * to `GraphEventWire` and not to this tuple, or a name here that is not a
 * variant, is a type error at build time.
 */
export const graphEventKinds = [
  'ready',
  'commit',
  'selection',
  'viewport',
  'nodeActivate',
  'connectRefused',
  'haptic',
  'metrics',
  'paint',
  'layoutResult',
  'perfReport',
  'lasso',
  'error',
] as const;

type DeclaredKind = (typeof graphEventKinds)[number];
type AssertNever<T extends never> = T;
type _EveryVariantIsDeclared = AssertNever<Exclude<GraphEventKind, DeclaredKind>>;
type _EveryDeclaredIsAVariant = AssertNever<Exclude<DeclaredKind, GraphEventKind>>;

/**
 * `trailing` coalesces to the LAST value in the window — a pan reports where it
 * ended, not where it was 125 ms ago. `floor` drops what arrives inside the
 * window — a second haptic 30 ms after the first is not a second buzz, it is
 * the same one felt twice. They are different mechanisms and naming them apart
 * is what stops one being implemented as the other.
 */
export type GraphEventThrottle =
  | { readonly mode: 'none' }
  | { readonly mode: 'trailing'; readonly ms: number }
  | { readonly mode: 'floor'; readonly ms: number }
  | { readonly mode: 'onDemand' };

export interface GraphEventEmission {
  readonly firesOn: string;
  readonly throttle: GraphEventThrottle;
}

/**
 * Design 9.1's emission table, as data.
 *
 * Mapped over the union, so a new variant with no row here does not compile.
 * That is the point: an event without a throttle decision is how a per-frame
 * emitter reaches a bridge, and no reviewer catches it by reading a diff.
 *
 * `ready` and `error` are not in the design's table. Both are discrete and both
 * are what a stuck WebView has to be able to say, so both are unthrottled; the
 * decision is recorded here and asserted in the spec rather than left implied.
 *
 * Never emitted at all, at any throttle: node positions, viewport DURING a
 * gesture, hover.
 */
export const graphEventEmission = {
  ready: { firesOn: 'the canvas mounted and painted once', throttle: { mode: 'none' } },
  commit: {
    firesOn: 'drag stop, connect, delete, paste, layout commit',
    throttle: { mode: 'none' },
  },
  selection: { firesOn: 'selection commit, lasso release', throttle: { mode: 'none' } },
  viewport: {
    firesOn: 'pan/zoom, only when `reportViewport` is on',
    throttle: { mode: 'trailing', ms: 125 },
  },
  nodeActivate: { firesOn: 'tap on a field, double-tap on a node', throttle: { mode: 'none' } },
  connectRefused: { firesOn: 'illegal drop', throttle: { mode: 'none' } },
  haptic: {
    firesOn: 'snap acquisition, lasso arm, connect',
    throttle: { mode: 'floor', ms: 120 },
  },
  metrics: { firesOn: 'bench only', throttle: { mode: 'onDemand' } },
  /**
   * Unthrottled and fired ONCE per mount. It is what the watchdog is measured
   * against, so a coalescing window here would be a window added to the budget.
   */
  paint: { firesOn: "the frame after React Flow's first render", throttle: { mode: 'none' } },
  layoutResult: { firesOn: 'a relayout resolved', throttle: { mode: 'none' } },
  perfReport: { firesOn: 'perfStop', throttle: { mode: 'onDemand' } },
  /**
   * `none`, not `floor`: the three phases are different facts and coalescing
   * `arm` into `select` would lose the buzz. The gesture itself fires at most
   * three of these, so there is nothing to throttle.
   */
  lasso: {
    firesOn: 'the hold firing, the finger lifting, or any cancel',
    throttle: { mode: 'none' },
  },
  error: {
    firesOn: 'a caught throw in boot, module eval, render or runtime',
    throttle: { mode: 'none' },
  },
} satisfies { readonly [K in GraphEventKind]: GraphEventEmission };

export const isGraphEventKind = (value: unknown): value is GraphEventKind =>
  typeof value === 'string' &&
  // SAFETY: widening the literal tuple to readonly string[] only to call includes on a string
  (graphEventKinds as readonly string[]).includes(value);

export const encodeGraphEvent = (event: GraphEventWire): string => JSON.stringify(event);

/**
 * Throws on a tag it does not know, rather than returning it.
 *
 * Both ends ship in the same bundle, so an unknown tag is not user input — it
 * is a DOM bundle and a native host out of step, and the same reasoning as
 * `parseKnobEnvelope`'s version check applies: failing loudly beats handling
 * something plausible and wrong.
 */
export const decodeGraphEvent = (json: string): GraphEventWire => {
  const parsed: unknown = JSON.parse(json);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this IS the I/O-boundary parse of the bridge payload
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`graph event payload is not an object: ${json.slice(0, 120)}`);
  }
  const tag = 't' in parsed ? parsed.t : undefined;
  if (!isGraphEventKind(tag)) {
    throw new Error(
      `graph event tag ${JSON.stringify(tag)} is not one of ${graphEventKinds.join(', ')} — ` +
        'the DOM bundle and its native host are out of step; rebuild the app.',
    );
  }
  // SAFETY: `parsed` is a non-array object whose `t` is a known GraphEventKind; both ends ship in one bundle
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tag check above is the contract; fields are trusted per the comment above
  return parsed as GraphEventWire;
};

/**
 * The two `ResizeObserver loop` notices, and NOTHING else.
 *
 * React Flow's own observer trips them on every layout pass. Treating them as
 * fatal blanked the canvas mid-drag in the gate, which is why this is a spec
 * and not a comment. The match is anchored past an optional `Uncaught ` and an
 * optional `SomeError: ` prefix — the shapes `window.onerror` actually hands
 * over — so an error that merely MENTIONS `ResizeObserver`, or one that quotes
 * the notice inside a longer sentence, still reaches the boundary.
 */
const resizeObserverLoopNotice = /^(?:uncaught\s+)?(?:[a-z]*error:\s*)?resizeobserver loop\b/iu;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever window.onerror / a catch handed over; narrowed right here
export const isBenignCanvasError = (message: unknown): boolean =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the narrowing of the untyped error message
  typeof message === 'string' && resizeObserverLoopNotice.test(message);

/**
 * Echo suppression, design 9.1.
 *
 * A change that came out of the canvas comes back in through `documentJson` on
 * the next render. The host stamps a monotonic `rev`; the canvas ignores an
 * inbound document at or below the highest rev it has already emitted or
 * applied, so a drag does not fight its own echo and a re-render does not
 * re-apply what is already on screen.
 *
 * One high-water number rather than a set of seen revs: `rev` is monotonic by
 * contract, so the set would only ever grow and never be consulted below its
 * maximum.
 */
export interface RevEchoGate {
  /** The canvas just emitted a `commit` stamped `rev`. */
  readonly markEmitted: (rev: number) => void;
  /** True when this inbound document is new work and should be applied. */
  readonly acceptInbound: (rev: number) => boolean;
  readonly highWater: () => number;
}

export const createRevEchoGate = (): RevEchoGate => {
  let highWater = Number.NEGATIVE_INFINITY;
  return {
    markEmitted(rev) {
      if (rev > highWater) {
        highWater = rev;
      }
    },
    acceptInbound(rev) {
      if (rev <= highWater) {
        return false;
      }
      highWater = rev;
      return true;
    },
    highWater: () => highWater,
  };
};

export interface GraphEventEmitterOptions {
  /** The single bridge crossing. `onEvent` on the DOM side; a test collector in a spec. */
  readonly send: (eventJson: string) => void;
  /** Test seam. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Test seam. Defaults to `globalThis.setTimeout`. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- opaque timer handle; only ever passed back to `cancel`
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  /** Test seam. Defaults to `globalThis.clearTimeout`. */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- opaque timer handle produced by `schedule`
  readonly cancel?: (handle: unknown) => void;
}

export interface GraphEventEmitter {
  readonly emit: (event: GraphEventWire) => void;
  /** Send anything still pending now. Called before a commit, so ordering holds. */
  readonly flush: () => void;
  /** Drop anything pending. Called on unmount, so no timer fires into a dead tree. */
  readonly dispose: () => void;
}

/**
 * The table, executed.
 *
 * Design 9.1's spec is "a 30-change drag produces exactly one bridge crossing",
 * and this is where that is true: 30 `viewport` events inside one 125 ms window
 * schedule one timer and send the last value.
 */
export const createGraphEventEmitter = (options: GraphEventEmitterOptions): GraphEventEmitter => {
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const cancel =
    options.cancel ??
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- opaque timer handle produced by `schedule`
    ((handle: unknown) => {
      // SAFETY: without a custom `schedule`, the handle came from globalThis.setTimeout
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above; the handle type differs per host
      globalThis.clearTimeout(handle as number);
    });

  const pending = new Map<GraphEventKind, GraphEventWire>();
  const timers = new Map<GraphEventKind, unknown>();
  const lastSentAt = new Map<GraphEventKind, number>();
  let disposed = false;

  const send = (event: GraphEventWire) => {
    lastSentAt.set(event.t, now());
    options.send(encodeGraphEvent(event));
  };

  const fire = (kind: GraphEventKind) => {
    timers.delete(kind);
    const event = pending.get(kind);
    if (!event) {
      return;
    }
    pending.delete(kind);
    send(event);
  };

  return {
    emit(event) {
      if (disposed) {
        return;
      }
      const { throttle } = graphEventEmission[event.t];
      if (throttle.mode === 'none' || throttle.mode === 'onDemand') {
        send(event);
        return;
      }
      if (throttle.mode === 'floor') {
        const last = lastSentAt.get(event.t);
        if (last !== undefined && now() - last < throttle.ms) {
          return;
        }
        send(event);
        return;
      }
      // trailing: keep the latest, one timer per kind.
      pending.set(event.t, event);
      if (timers.has(event.t)) {
        return;
      }
      timers.set(
        event.t,
        schedule(() => {
          fire(event.t);
        }, throttle.ms),
      );
    },
    flush() {
      // A snapshot, because `fire` deletes from `pending` as it goes.
      // oxlint-disable-next-line unicorn/no-useless-spread -- deliberate snapshot: `fire` deletes from `pending` while iterating
      for (const kind of [...pending.keys()]) {
        const handle = timers.get(kind);
        if (handle !== undefined) {
          cancel(handle);
        }
        fire(kind);
      }
    },
    dispose() {
      disposed = true;
      for (const handle of timers.values()) {
        cancel(handle);
      }
      timers.clear();
      pending.clear();
    },
  };
};
