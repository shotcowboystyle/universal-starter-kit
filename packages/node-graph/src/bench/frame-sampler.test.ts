/**
 * Task 5.1's spec, written before the sampler existed.
 *
 * The three things it pins are the three ways a perf number lies:
 *
 *  1. the STATISTICS are wrong (a p95 taken with the wrong rank, an fps
 *     derived from the wrong mean),
 *  2. the run measured an IDLE page — the reactflow spike lost a whole round
 *     of numbers this way when touch emulation silently reset, which is why
 *     design §13.2 makes `didMove` mandatory rather than informational,
 *  3. the run measured something real but the WINDOW was cut wrong, which is
 *     the whole of the relayout gate.
 */

import { describe, expect, it } from 'vitest';

import {
  createFrameSampler,
  gestureWindow,
  doubleFrameBudgetMs,
  frameBudgetMs,
  relayoutGate,
  reportRun,
  sliceWindow,
  summarizeFrames,
} from './frame-sampler';
import { generateBenchGraph, mulberry32 } from './generate-graph';

/** A driveable stand-in for `requestAnimationFrame`. */
const fakeClock = (deltas: readonly number[]) => {
  let now = 1000;
  const queue: ((t: number) => void)[] = [];
  let handle = 0;
  let index = 0;
  return {
    now: () => now,
    requestFrame: (onFrame: (t: number) => void) => {
      queue.push(onFrame);
      handle += 1;
      return handle;
    },
    cancelFrame: () => {},
    /** Advance one frame by the next scripted delta. */
    tick(): void {
      const delta = deltas[Math.min(index, deltas.length - 1)];
      index += 1;
      now += delta;
      const next = queue.shift();
      next?.(now);
    },
    tickAll(): void {
      for (let remaining = deltas.length; remaining > 0; remaining -= 1) {
        this.tick();
      }
    },
  };
};

describe(summarizeFrames, () => {
  it('reports mean, p50, p95, worst, the two over-budget counts and fps', () => {
    // 20 samples: nineteen at 10 ms and one at 50 ms.
    const deltas = [...Array.from({ length: 19 }, () => 10), 50];
    const stats = summarizeFrames(deltas);
    expect(stats.samples).toBe(20);
    expect(stats.mean).toBeCloseTo(12, 5);
    expect(stats.p50).toBe(10);
    // Nearest rank: ceil(0.95 * 20) = 19, so p95 is the NINETEENTH of the
    // sorted array — still 10. One outlier in twenty does not move a p95, and
    // a percentile that said otherwise would be interpolating a frame nobody
    // rendered.
    expect(stats.p95).toBe(10);
    expect(stats.worst).toBe(50);
    expect(stats.over16_7).toBe(1);
    expect(stats.over33_3).toBe(1);
    expect(stats.fps).toBeCloseTo(1000 / 12, 5);
  });

  it('takes p95 by nearest rank, so two outliers in twenty DO move it', () => {
    const deltas = [...Array.from({ length: 18 }, () => 10), 50, 50];
    expect(summarizeFrames(deltas).p95).toBe(50);
  });

  it('counts strictly over the budget, so a frame exactly on it is not a drop', () => {
    const stats = summarizeFrames([frameBudgetMs, doubleFrameBudgetMs]);
    expect(stats.over16_7).toBe(1);
    expect(stats.over33_3).toBe(0);
  });

  it('is empty-safe rather than NaN', () => {
    const stats = summarizeFrames([]);
    expect(stats.samples).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.p95).toBe(0);
    expect(stats.fps).toBe(0);
  });
});

describe('createFrameSampler didMove', () => {
  it('is false when no transform changed between the first and last sample', () => {
    const clock = fakeClock([10, 10, 10, 10]);
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => 'translate(0px, 0px) scale(1)',
      countNodes: () => 200,
    });
    sampler.start();
    clock.tickAll();
    const run = sampler.stop();
    expect(run.didMove).toBe(false);
    expect(run.nodeCount).toBe(200);
  });

  it('is true when one did', () => {
    const clock = fakeClock([10, 10, 10, 10]);
    let x = 0;
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => {
        x += 7;
        return `translate(${x}px, 0px) scale(1)`;
      },
    });
    sampler.start();
    clock.tickAll();
    expect(sampler.stop().didMove).toBe(true);
  });
});

describe('a frame that began before the sampler did', () => {
  it('is dropped rather than reported as a negative frame time', () => {
    // Measured in Chrome, not imagined: `start()` reads `performance.now()`,
    // and a frame already in flight carries an rAF timestamp from BEFORE that
    // call. The first delta came back at -12 ms, which is not a frame anybody
    // rendered.
    const queue: ((t: number) => void)[] = [];
    let x = 0;
    const sampler = createFrameSampler({
      now: () => 1000,
      requestFrame: (onFrame) => {
        queue.push(onFrame);
        return queue.length;
      },
      cancelFrame: () => {},
      probeTransform: () => {
        x += 1;
        return `t${x}`;
      },
    });
    sampler.start();
    // The already-in-flight frame: its timestamp predates `start()`.
    queue.shift()?.(988);
    queue.shift()?.(1000);
    queue.shift()?.(1012);
    const run = sampler.stop();
    expect(run.deltas).toStrictEqual([12, 12]);
    expect(run.deltas.every((delta) => delta >= 0)).toBe(true);
  });
});

describe(reportRun, () => {
  const context = { label: 'pan', host: 'chrome-emulated', nodeCount: 200, culling: true };

  /**
   * The WIRE instrument, and the reason it comes first.
   *
   * On a phone there is no console, and the `sampling…` readout belongs to the
   * story rather than to the canvas — so a Stop that never crossed the bridge
   * and a Stop that arrived with no run in flight are the same picture. They
   * are different bugs and only the canvas can tell them apart. `notStarted`
   * says the canvas heard the Stop; silence says it did not.
   */
  it('names a Stop that arrived with no run in flight, so a dead wire reads differently', () => {
    const clock = fakeClock([10]);
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => 'still',
    });
    const result = reportRun(sampler.stop(), context);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('unreachable');
    }
    expect(result.error.reason).toBe('notStarted');
    expect(result.error.message).toMatch(/no run in flight/u);
  });

  /** A second Stop is a second `notStarted`, which is true both times. */
  it('does not carry a finished run forward into the next Stop', () => {
    const clock = fakeClock([10, 12]);
    let x = 0;
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => {
        x += 1;
        return `t${x}`;
      },
    });
    sampler.start();
    clock.tickAll();
    expect(reportRun(sampler.stop(), context).ok).toBe(true);
    const second = reportRun(sampler.stop(), context);
    expect(second.ok).toBe(false);
    if (second.ok) {
      throw new Error('unreachable');
    }
    expect(second.error.reason).toBe('notStarted');
  });

  it('rejects a run whose didMove is false rather than returning a report', () => {
    const clock = fakeClock([10, 10, 10]);
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => 'still',
    });
    sampler.start();
    clock.tickAll();
    const result = reportRun(sampler.stop(), context);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('unreachable');
    }
    expect(result.error.reason).toBe('didMove');
    expect((result as { value?: unknown }).value).toBeUndefined();
  });

  it('rejects a run with no samples', () => {
    const clock = fakeClock([10]);
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => 'still',
    });
    sampler.start();
    const result = reportRun(sampler.stop(), context);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('unreachable');
    }
    expect(result.error.reason).toBe('empty');
  });

  it('returns the report when the page actually moved', () => {
    const clock = fakeClock([10, 12, 40, 11]);
    let x = 0;
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => {
        x += 1;
        return `t${x}`;
      },
      countNodes: () => 200,
    });
    sampler.start();
    clock.tickAll();
    const result = reportRun(sampler.stop(), context);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('unreachable');
    }
    expect(result.value.didMove).toBe(true);
    expect(result.value.label).toBe('pan');
    expect(result.value.nodeCount).toBe(200);
    expect(result.value.stats.samples).toBe(4);
    expect(result.value.deltas).toStrictEqual([10, 12, 40, 11]);
  });
});

/** Six deltas, marks placed between them, so the arithmetic is countable. */
const scriptedRun = (script: readonly (number | 'start' | 'end')[]) => {
  const deltas = script.filter((step): step is number => typeof step === 'number');
  const clock = fakeClock(deltas);
  let x = 0;
  const sampler = createFrameSampler({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    probeTransform: () => {
      x += 1;
      return `t${x}`;
    },
  });
  sampler.start();
  for (const step of script) {
    if (step === 'start' || step === 'end') {
      sampler.mark(step);
    } else {
      clock.tick();
    }
  }
  return sampler.stop();
};

/**
 * Design §13.2's cell is the frames a GESTURE produced, and the m6 iOS number
 * was not that.
 *
 * `952 frames · p95 18.8 · mean 16.7` over six scripted pans ran Start to Stop
 * and held every idle frame between one pan and the next. Idle frames are cheap
 * and plentiful, so they pull the mean down and leave the p95 roughly alone:
 * the cell was optimistic about the average, and there was no arithmetic that
 * could say by how much. These are the brackets that make the subtraction
 * possible.
 */
describe(gestureWindow, () => {
  it('counts frames inside the brackets and calls the rest idle', () => {
    // 10, [start] 20, 30, [end] 40 — two frames bracketed, two idle.
    const window = gestureWindow(scriptedRun([10, 'start', 20, 30, 'end', 40]));
    expect(window).not.toBeNull();
    expect(window?.segments).toBe(1);
    expect(window?.stats.samples).toBe(2);
    expect(window?.stats.mean).toBe(25);
    expect(window?.idleFrames).toBe(2);
    expect(window?.unclosed).toBe(0);
  });

  /**
   * SIX pans, which is what the iOS run drove. The keyed `marks` record keeps
   * one `start` and one `end`, so this only works off the ordered list — and
   * that is the whole reason `markList` exists beside it.
   */
  it('reads repeats in order, so six scripted pans are six segments', () => {
    const script: (number | 'start' | 'end')[] = [];
    for (let pan = 0; pan < 6; pan += 1) {
      script.push('start', 20, 20, 'end', 50);
    }
    const window = gestureWindow(scriptedRun(script));
    expect(window?.segments).toBe(6);
    expect(window?.stats.samples).toBe(12);
    expect(window?.idleFrames).toBe(6);
    // The idle frames were 50 ms each and would have dragged the mean up; the
    // gesture mean is the 20s alone.
    expect(window?.stats.mean).toBe(20);
  });

  /**
   * A missed `end` tap is REPORTED, not hidden. Dropping the segment loses a
   * whole pan; folding it in silently would put the idle tail inside a number
   * that claims to be gesture-only.
   */
  it('closes an open bracket at the Stop and says it did', () => {
    const window = gestureWindow(scriptedRun([10, 'start', 20, 30]));
    expect(window?.segments).toBe(1);
    expect(window?.unclosed).toBe(1);
    expect(window?.stats.samples).toBe(2);
  });

  /**
   * `null`, not a zeroed `FrameStats`. "Nothing was bracketed" and "a bracketed
   * gesture produced no frames" are different findings, and a readout that
   * printed `0 frames` for the first would send a reader looking for a
   * performance problem that is a missed button press.
   */
  it('answers null when the run bracketed nothing at all', () => {
    expect(gestureWindow(scriptedRun([10, 20, 30]))).toBeNull();
  });

  it('ignores an end with no start before it', () => {
    expect(gestureWindow(scriptedRun([10, 'end', 20]))).toBeNull();
  });

  it('rides the report, so the cell crosses the bridge with the run', () => {
    const report = reportRun(scriptedRun([10, 'start', 20, 30, 'end', 40]), {
      label: 'pan',
      host: 'iphone-16e',
      nodeCount: 200,
      culling: true,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) {
      throw new Error('unreachable');
    }
    expect(report.value.gesture?.segments).toBe(1);
    expect(report.value.gesture?.idleFrames).toBe(2);
    // And the whole window is still there beside it, unchanged.
    expect(report.value.stats.samples).toBe(4);
  });
});

/** 40 frames at 10 ms, a mark at frame 20, then 20 frames at 10 ms. */
const evenRun = () => {
  const clock = fakeClock(Array.from({ length: 40 }, () => 10));
  let x = 0;
  const sampler = createFrameSampler({
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    probeTransform: () => {
      x += 1;
      return `t${x}`;
    },
  });
  sampler.start();
  for (let i = 0; i < 20; i += 1) {
    clock.tick();
  }
  sampler.mark('relayout');
  for (let i = 0; i < 20; i += 1) {
    clock.tick();
  }
  return sampler.stop();
};

describe('sliceWindow and relayoutGate', () => {
  it('cuts a window half-open on the near edge, so the frame that ended AT the mark is pre', () => {
    const run = evenRun();
    const mark = run.marks.relayout.t;
    expect(sliceWindow(run, mark - 100, mark)).toHaveLength(10);
    expect(sliceWindow(run, mark, mark + 100)).toHaveLength(10);
  });

  it('passes when the post window matches the pre window', () => {
    const verdict = relayoutGate(evenRun(), 'relayout', 100);
    expect(verdict.pass).toBe(true);
    expect(verdict.p95Ratio).toBeCloseTo(1, 5);
    expect(verdict.postDidMove).toBe(true);
    expect(verdict.reasons).toStrictEqual([]);
  });

  it('fails when the post p95 blows past 20% of the pre p95', () => {
    const clock = fakeClock([...Array.from({ length: 20 }, () => 10), 400, 400]);
    let x = 0;
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => {
        x += 1;
        return `t${x}`;
      },
    });
    sampler.start();
    for (let i = 0; i < 20; i += 1) {
      clock.tick();
    }
    sampler.mark('relayout');
    clock.tick();
    clock.tick();
    const verdict = relayoutGate(sampler.stop(), 'relayout', 1000);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain('p95');
    expect(verdict.reasons).toContain('newHeavyFrames');
  });

  it('fails when the post window did not move, even if the frames look fine', () => {
    const clock = fakeClock(Array.from({ length: 40 }, () => 10));
    let x = 0;
    let frozen = false;
    const sampler = createFrameSampler({
      now: clock.now,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      probeTransform: () => {
        if (frozen) {
          return 'frozen';
        }
        x += 1;
        return `t${x}`;
      },
    });
    sampler.start();
    for (let i = 0; i < 20; i += 1) {
      clock.tick();
    }
    frozen = true;
    sampler.mark('relayout');
    for (let i = 0; i < 20; i += 1) {
      clock.tick();
    }
    const verdict = relayoutGate(sampler.stop(), 'relayout', 100);
    expect(verdict.postDidMove).toBe(false);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain('didMove');
  });

  it('refuses a mark that was never set rather than inventing a window', () => {
    expect(() => relayoutGate(evenRun(), 'never', 100)).toThrow(/never/u);
  });
});

describe(generateBenchGraph, () => {
  it('is deterministic: the same seed produces the identical document twice', () => {
    expect(generateBenchGraph({ count: 200, seed: 7 })).toStrictEqual(generateBenchGraph({ count: 200, seed: 7 }));
  });

  it('a different seed produces a different arrangement', () => {
    const a = generateBenchGraph({ count: 200, seed: 7 });
    const b = generateBenchGraph({ count: 200, seed: 8 });
    expect(a).not.toStrictEqual(b);
  });

  it("produces design §13.2's shape: 200 nodes and roughly 400 edges", () => {
    const doc = generateBenchGraph({ count: 200, seed: 1 });
    expect(doc.nodes).toHaveLength(200);
    expect(doc.edges.length).toBeGreaterThanOrEqual(360);
    expect(doc.edges.length).toBeLessThanOrEqual(440);
    expect(new Set(doc.nodes.map((n) => n.id)).size).toBe(200);
    expect(new Set(doc.edges.map((e) => e.id)).size).toBe(doc.edges.length);
  });

  it('mulberry32 is the named generator and repeats exactly', () => {
    const first = Array.from({ length: 5 }, mulberry32(42));
    const second = Array.from({ length: 5 }, mulberry32(42));
    expect(first).toStrictEqual(second);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
