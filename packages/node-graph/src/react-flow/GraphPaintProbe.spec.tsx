/**
 * Task 6.6. The paint marker fires ONCE, after two frames, and never twice.
 *
 * It is the clock the native watchdog is measured against, so the two things
 * that matter are both timing claims a browser check cannot make: that it waits
 * for the frame AFTER the one this mount produced, and that a re-render does
 * not re-arm it. A second `paint` would be harmless on native (the watchdog is
 * already cleared) and misleading in a log, which is exactly the kind of defect
 * that survives a screenshot.
 */

import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphPaintProbe } from './GraphPaintProbe';

afterEach(cleanup);

/** A hand-cranked rAF, so "the frame after" is a thing this spec can count. */
function stubFrames() {
  const queue: ((t: number) => void)[] = [];
  const original = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
    queue.push(cb);
    return queue.length;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
  return {
    /** Run everything queued right now, and only that. */
    tick(t = 0) {
      const due = queue.splice(0);
      for (const cb of due) {
        cb(t);
      }
    },
    pending: () => queue.length,
    restore() {
      globalThis.requestAnimationFrame = original.request;
      globalThis.cancelAnimationFrame = original.cancel;
    },
  };
}

describe(GraphPaintProbe, () => {
  it('waits for the SECOND frame, because the first is scheduled before the paint', () => {
    const frames = stubFrames();
    const onPaint = vi.fn();
    try {
      render(<GraphPaintProbe onPaint={onPaint} />);
      expect(onPaint, 'fired before any frame ran').not.toHaveBeenCalled();
      frames.tick(16);
      expect(onPaint, 'fired on the frame this mount produced, not the one after').not.toHaveBeenCalled();
      frames.tick(32);
      expect(onPaint).toHaveBeenCalledOnce();
    } finally {
      frames.restore();
    }
  });

  it('fires once, and a re-render does not re-arm it', () => {
    const frames = stubFrames();
    const onPaint = vi.fn();
    try {
      const view = render(<GraphPaintProbe onPaint={onPaint} />);
      frames.tick(16);
      frames.tick(32);
      expect(onPaint).toHaveBeenCalledOnce();
      view.rerender(<GraphPaintProbe onPaint={onPaint} />);
      frames.tick(48);
      frames.tick(64);
      expect(onPaint).toHaveBeenCalledOnce();
    } finally {
      frames.restore();
    }
  });

  it('reads the callback through a ref, so a fresh arrow each render is free', () => {
    const frames = stubFrames();
    const first = vi.fn();
    const second = vi.fn();
    try {
      const view = render(<GraphPaintProbe onPaint={first} />);
      view.rerender(<GraphPaintProbe onPaint={second} />);
      frames.tick(16);
      frames.tick(32);
      // The LATEST callback, and exactly one call between the two of them —
      // rebuilding the probe on a new identity would be a second effect and a
      // second marker.
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    } finally {
      frames.restore();
    }
  });

  /**
   * A canvas can mount where there is no rAF at all — a spec under happy-dom
   * with the global removed, or a headless runtime. Firing synchronously is
   * honest there: the tree rendered and there is no compositor to wait for.
   */
  it('fires synchronously where there is no requestAnimationFrame', () => {
    const original = globalThis.requestAnimationFrame;
    // oxlint-disable-next-line no-explicit-any -- deleting a global for one assertion
    (globalThis as any).requestAnimationFrame = undefined;
    const onPaint = vi.fn();
    try {
      render(<GraphPaintProbe onPaint={onPaint} />);
      expect(onPaint).toHaveBeenCalledOnce();
    } finally {
      globalThis.requestAnimationFrame = original;
    }
  });
});
