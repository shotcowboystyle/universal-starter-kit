/**
 * The frame sampler, design §13.2 and plan task 5.1.
 *
 * It samples `requestAnimationFrame` deltas from INSIDE the canvas, because
 * that is the clock that measures the frames a user sees. The host RN view's
 * FPS is a different and less useful quantity: it keeps ticking while the
 * WebView is stalled.
 *
 * Three things it refuses to do, each one a way a perf number lies:
 *
 *  - **Report an idle page.** `didMove` compares a transform signature taken at
 *    the first sample against one taken at the last, and `reportRun` REJECTS a
 *    run where they match rather than handing back plausible-looking numbers.
 *    The reactflow spike lost a whole round of measurements to exactly this
 *    when touch emulation silently reset, which is why design §13.2 makes it
 *    mandatory rather than advisory.
 *  - **Report an empty run.** Zero frames is not a fast run.
 *  - **Guess a window.** `relayoutGate` throws on a mark that was never set
 *    instead of measuring from t = 0 and calling it a pre-window.
 *
 * No React, no `@xyflow`, no DOM in the core: everything the sampler needs from
 * the page arrives as the `probeTransform` and `countNodes` callbacks, so the
 * whole module runs in vitest under a fake clock. `createDomTransformProbe`
 * builds the real probe from SELECTORS the caller passes, which keeps the one
 * `@xyflow` import site in `react-flow/xy.ts` where the lint rule wants it.
 */

import type { Result } from '../model/index';

/** 60 Hz. A frame longer than this dropped one. */
export const frameBudgetMs = 16.7;
/** Two frames. Design §13.2's "no frame over 33 ms" gate reads this. */
export const doubleFrameBudgetMs = 33.3;

export interface FrameStats {
  readonly samples: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly worst: number;
  /** Frames STRICTLY over 16.7 ms. A frame exactly on budget did not drop one. */
  readonly over16_7: number;
  readonly over33_3: number;
  /** Derived from the mean, so it is the average frame rate and not a peak. */
  readonly fps: number;
}

/**
 * Nearest rank, `sorted[ceil(q * n) - 1]`.
 *
 * Written out rather than interpolated because an interpolated p95 over 120
 * samples invents a number that no frame took, and the thing being asserted
 * ("no frame over 33 ms") is about frames that happened.
 */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function summarizeFrames(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) {
    return { samples: 0, mean: 0, p50: 0, p95: 0, worst: 0, over16_7: 0, over33_3: 0, fps: 0 };
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  let total = 0;
  let over16 = 0;
  let over33 = 0;
  for (const delta of deltas) {
    total += delta;
    if (delta > frameBudgetMs) {
      over16 += 1;
    }
    if (delta > doubleFrameBudgetMs) {
      over33 += 1;
    }
  }
  const mean = total / deltas.length;
  return {
    samples: deltas.length,
    mean,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    worst: sorted.at(-1),
    over16_7: over16,
    over33_3: over33,
    fps: mean > 0 ? 1000 / mean : 0,
  };
}

export interface FrameSample {
  /** The rAF timestamp this frame ENDED at. */
  readonly t: number;
  readonly d: number;
}

export interface FrameMark {
  readonly t: number;
  /** The transform signature at the instant of the mark, so a post-window `didMove` is checkable. */
  readonly signature: string;
  /** Which mark this is. Carried on the ordered list, where the key is gone. */
  readonly label: string;
}

export interface FrameRun {
  readonly deltas: readonly number[];
  readonly samples: readonly FrameSample[];
  readonly stats: FrameStats;
  readonly didMove: boolean;
  readonly nodeCount: number;
  readonly marks: Readonly<Record<string, FrameMark>>;
  /**
   * Every mark IN ORDER, including repeats of the same label.
   *
   * `marks` is keyed, so `mark("start")` six times keeps the sixth and loses
   * five — which is fine for `relayoutGate`, whose whole subject is a single
   * relayout, and useless for six scripted pans. Both are kept rather than one
   * derived from the other: the keyed record is a different question ("when did
   * the relayout fire") from the ordered list ("which windows were gestures").
   */
  readonly markList: readonly FrameMark[];
  readonly startedAt: number;
  readonly stoppedAt: number;
  readonly startSignature: string;
  readonly stopSignature: string;
  /**
   * `start()` had been called and this `stop()` is the one closing it.
   *
   * The device instrument. On a phone there is no console, so "the Stop never
   * reached the canvas" and "the Stop arrived with no run in flight" are the
   * same picture: a readout stuck on `sampling…`. They are different bugs — the
   * first is a dead bridge, the second is a lost Start — and only the canvas
   * knows which. `reportRun` turns this into a named rejection so a screenshot
   * can say.
   */
  readonly started: boolean;
}

export interface FrameSamplerOptions {
  readonly now?: () => number;
  readonly requestFrame?: (cb: (t: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
  /**
   * A short string that changes when anything on the canvas moved. Design
   * §13.2's `didMove` is exactly "this changed between the first and last
   * sample"; nothing is compared per frame, so the probe can afford to walk
   * every node.
   */
  readonly probeTransform?: () => string;
  readonly countNodes?: () => number;
  /** Ring buffer bound. 3600 frames is a minute at 60 Hz. */
  readonly maxSamples?: number;
}

export interface FrameSampler {
  start: () => void;
  stop: () => FrameRun;
  /** Stamps an instant AND the transform signature at it. Returns the timestamp. */
  mark: (label: string) => number;
  readonly running: boolean;
}

const defaultNow = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

export function createFrameSampler(options: FrameSamplerOptions = {}): FrameSampler {
  const {
    now = defaultNow,
    requestFrame = (cb: (t: number) => void) => globalThis.requestAnimationFrame(cb),
    cancelFrame = (handle: number) => {
      globalThis.cancelAnimationFrame(handle);
    },
    probeTransform = () => '',
    countNodes = () => 0,
    maxSamples = 3600,
  } = options;

  let samples: FrameSample[] = [];
  let marks: Record<string, FrameMark> = {};
  let markList: FrameMark[] = [];
  let handle: number | null = null;
  let lastT = 0;
  let startedAt = 0;
  let startSignature = '';
  let running = false;
  let started = false;

  const step = (t: number) => {
    const delta = t - lastT;
    lastT = t;
    // A NEGATIVE first delta is real and was measured in Chrome: `start()`
    // reads `performance.now()`, but a frame can already be in flight, and its
    // rAF timestamp is the moment that frame BEGAN — which is before the call.
    // The interval it describes is not a frame the page rendered, so it is
    // dropped rather than reported as a -12 ms frame. Only the first sample
    // can be affected; the origin is corrected and sampling continues.
    if (delta < 0) {
      handle = requestFrame(step);
      return;
    }
    samples.push({ t, d: delta });
    if (samples.length > maxSamples) {
      samples.shift();
    }
    handle = requestFrame(step);
  };

  return {
    get running() {
      return running;
    },
    start() {
      samples = [];
      marks = {};
      markList = [];
      startedAt = now();
      lastT = startedAt;
      startSignature = probeTransform();
      running = true;
      started = true;
      handle = requestFrame(step);
    },
    mark(label: string) {
      const t = now();
      const stamp: FrameMark = { t, signature: probeTransform(), label };
      marks[label] = stamp;
      markList.push(stamp);
      return t;
    },
    stop() {
      if (handle !== null) {
        cancelFrame(handle);
      }
      handle = null;
      running = false;
      // Consumed by this stop. A second Stop with no Start between them is a
      // second `notStarted`, which is the truthful answer both times.
      const wasStarted = started;
      started = false;
      const stoppedAt = now();
      const stopSignature = probeTransform();
      const deltas = samples.map((sample) => sample.d);
      return {
        deltas,
        samples: [...samples],
        stats: summarizeFrames(deltas),
        didMove: startSignature !== stopSignature,
        nodeCount: countNodes(),
        marks: { ...marks },
        markList: [...markList],
        startedAt,
        stoppedAt,
        startSignature,
        stopSignature,
        started: wasStarted,
      };
    },
  };
}

/**
 * The real probe, built from selectors the caller supplies.
 *
 * React Flow places both the viewport and every node with a CSS TRANSFORM and
 * never with a layout offset, so `offsetLeft` / `offsetTop` are 0 at every
 * arrangement — milestone 4 shipped a position stamp built on them that was a
 * constant, and caught it in Chrome rather than in a spec. This reads
 * `style.transform`, which is the thing that actually moves.
 *
 * A pan moves the viewport; a node drag moves one node while the viewport
 * stands still. Both are in the signature, because both are runs design §13.2
 * asks for.
 */
export function createDomTransformProbe(selectors: {
  readonly viewport: string;
  readonly node: string;
  readonly root?: ParentNode;
}): () => string {
  return () => {
    const root = selectors.root ?? globalThis.document;
    const viewport = root.querySelector<HTMLElement>(selectors.viewport);
    const nodes = root.querySelectorAll<HTMLElement>(selectors.node);
    let total = 0;
    for (const node of nodes) {
      const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform ?? '');
      if (!match) {
        continue;
      }
      total += Number(match[1]) + Number(match[2]) * 3;
    }
    return `${viewport?.style.transform ?? 'none'}|${nodes.length}|${Math.round(total)}`;
  };
}

/** The default bracket labels. A pair, so a story cannot spell one of them. */
export const gestureStartMark = 'start';
export const gestureEndMark = 'end';

export interface GestureWindow {
  /** Frames inside a `start` → `end` pair, and only those. */
  readonly stats: FrameStats;
  /** How many pairs the run recorded. Design §13.2's six scripted pans is six. */
  readonly segments: number;
  /** Frames that fell in no segment: the harness sitting still between pans. */
  readonly idleFrames: number;
  /**
   * A `start` still open when the Stop came, closed at the Stop.
   *
   * Reported rather than silently dropped or silently included. Dropping loses
   * a whole gesture; including it without saying so folds the idle tail into a
   * number that claims to be gesture-only. 0 or 1, since the marks are read in
   * order.
   */
  readonly unclosed: number;
}

/**
 * Design §13.2's cell, bounded to the GESTURES instead of to the session.
 *
 * The m6 iOS number — `952 frames · p95 18.8 · mean 16.7` over six scripted
 * pans — was reported with its own caveat attached: the window ran from Start
 * to Stop, so it held every idle frame between one pan and the next. Idle
 * frames are cheap and plentiful, so they drag the mean down and leave the p95
 * roughly alone: the cell was pessimistic about the tail and optimistic about
 * the average, and there was no way to say by how much.
 *
 * A `start` mark opens a segment and the next `end` closes it. Repeats are read
 * in ORDER off `markList`, because the keyed `marks` record keeps only the last
 * of each label — six pans marked `start`/`end` are one entry there.
 *
 * `null` when nothing was marked at all. "No gesture was bracketed" and "a
 * bracketed gesture produced no frames" are different findings, and a zeroed
 * `FrameStats` cannot tell them apart.
 */
export function gestureWindow(
  run: FrameRun,
  labels: { readonly start: string; readonly end: string } = {
    start: gestureStartMark,
    end: gestureEndMark,
  },
): GestureWindow | null {
  const spans: { from: number; to: number }[] = [];
  let open: number | null = null;
  let unclosed = 0;
  for (const mark of run.markList) {
    if (mark.label === labels.start) {
      // A second `start` with no `end` between them replaces the first: the
      // operator missed a tap, and the later bracket is the one they meant.
      open = mark.t;
      continue;
    }
    if (mark.label !== labels.end || open === null) {
      continue;
    }
    spans.push({ from: open, to: mark.t });
    open = null;
  }
  if (open !== null) {
    spans.push({ from: open, to: run.stoppedAt });
    unclosed = 1;
  }
  if (spans.length === 0) {
    return null;
  }
  const deltas: number[] = [];
  for (const span of spans) {
    deltas.push(...sliceWindow(run, span.from, span.to));
  }
  return {
    stats: summarizeFrames(deltas),
    segments: spans.length,
    idleFrames: run.deltas.length - deltas.length,
    unclosed,
  };
}

export interface FrameRunContext {
  readonly label: string;
  readonly host: string;
  readonly nodeCount: number;
  readonly culling: boolean;
  readonly layoutRunner?: string;
  readonly note?: string;
}

export interface FrameReport extends FrameRunContext {
  readonly didMove: true;
  readonly stats: FrameStats;
  /** The gesture-only cell, or `null` when the run bracketed nothing. */
  readonly gesture: GestureWindow | null;
  readonly deltas: readonly number[];
  readonly durationMs: number;
  readonly marks: Readonly<Record<string, FrameMark>>;
}

export interface FrameReportRejection {
  readonly reason: 'empty' | 'didMove' | 'notStarted';
  readonly message: string;
}

/**
 * The gate on the way OUT of a run.
 *
 * A `didMove: false` run is discarded, not reported — design §13.2, verbatim.
 * Returning a `Result` rather than throwing is the package's house shape
 * (`parseDocument`), and it means a five-run cell can drop a bad run and say
 * how many it dropped instead of dying halfway through a session.
 */
export function reportRun(run: FrameRun, context: FrameRunContext): Result<FrameReport, FrameReportRejection> {
  /**
   * FIRST, because it is the only rejection that says something about the WIRE
   * rather than about the run.
   *
   * A Stop that arrives with no run in flight and a Stop that never arrives at
   * all look identical on a phone — the readout sits on `sampling…` either way,
   * because that state belongs to the story and not to the canvas. Naming this
   * one splits the difference: `notStarted` means the canvas heard the Stop and
   * had nothing to stop, so the Start is what went missing; silence still means
   * the Stop itself never crossed.
   */
  if (!run.started) {
    return {
      ok: false,
      error: {
        reason: 'notStarted',
        message:
          'the canvas received a Stop with no run in flight — the Start either never ' +
          'reached this canvas or a remount discarded the sampler between them',
      },
    };
  }
  if (run.deltas.length === 0) {
    return {
      ok: false,
      error: { reason: 'empty', message: 'no frames were sampled; this is not a fast run' },
    };
  }
  if (!run.didMove) {
    return {
      ok: false,
      error: {
        reason: 'didMove',
        message:
          'nothing moved between the first and last sample — the run measured an idle page and is discarded, not reported',
      },
    };
  }
  return {
    ok: true,
    value: {
      ...context,
      nodeCount: run.nodeCount || context.nodeCount,
      didMove: true,
      stats: run.stats,
      gesture: gestureWindow(run),
      deltas: run.deltas,
      durationMs: run.stoppedAt - run.startedAt,
      marks: run.marks,
    },
  };
}

/**
 * Frames whose timestamp falls in `(from, to]`.
 *
 * Half-open on the NEAR edge on purpose: the frame that ended exactly at the
 * mark is a frame that happened before the relayout fired, so it belongs to
 * the pre-window.
 */
export function sliceWindow(run: FrameRun, from: number, to: number): number[] {
  const out: number[] = [];
  for (const sample of run.samples) {
    if (sample.t > from && sample.t <= to) {
      out.push(sample.d);
    }
  }
  return out;
}

export interface RelayoutGateVerdict {
  readonly pass: boolean;
  readonly pre: FrameStats;
  readonly post: FrameStats;
  readonly p95Ratio: number;
  readonly postDidMove: boolean;
  readonly windowMs: number;
  readonly markT: number;
  /** `p95` | `newHeavyFrames` | `didMove`. Empty on a pass. */
  readonly reasons: readonly string[];
}

/**
 * Design §13.2's first absolute gate, as a function rather than a paragraph.
 *
 * PASS is all three of:
 *
 *  - the post window's p95 is within 20% of the pre window's,
 *  - the post window holds no more frames over 33.3 ms than the pre window did
 *    (the design's "no frame over 33 ms appears in the post window that is
 *    absent from the pre window", read as a count so it is falsifiable),
 *  - `didMove` holds across the post window ALONE — a relayout that froze the
 *    canvas produces a beautiful histogram.
 */
export function relayoutGate(run: FrameRun, markLabel: string, windowMs = 500): RelayoutGateVerdict {
  const mark = run.marks[markLabel];
  if (!mark) {
    throw new Error(`relayoutGate: no mark named "${markLabel}" — refusing to invent a window from t = 0`);
  }
  const pre = summarizeFrames(sliceWindow(run, mark.t - windowMs, mark.t));
  const post = summarizeFrames(sliceWindow(run, mark.t, mark.t + windowMs));
  const p95Ratio = pre.p95 === 0 ? (post.p95 === 0 ? 1 : Number.POSITIVE_INFINITY) : post.p95 / pre.p95;
  const postDidMove = mark.signature !== run.stopSignature;
  const reasons: string[] = [];
  if (!(p95Ratio <= 1.2)) {
    reasons.push('p95');
  }
  if (post.over33_3 > pre.over33_3) {
    reasons.push('newHeavyFrames');
  }
  if (!postDidMove) {
    reasons.push('didMove');
  }
  return {
    pass: reasons.length === 0,
    pre,
    post,
    p95Ratio,
    postDidMove,
    windowMs,
    markT: mark.t,
    reasons,
  };
}
