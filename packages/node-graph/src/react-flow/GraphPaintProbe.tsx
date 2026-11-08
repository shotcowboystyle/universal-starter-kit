/**
 * The `paint` marker — milestone 6, design §9.4.
 *
 * `ready` is deliberately LATE. The canvas waits `graphReadySettleMs` (1800)
 * before stamping it so the diagnostics it carries are filled in rather than
 * reporting `nodesMounted: 0` and every face `pending`. That was the right fix
 * for the diagnostics and the wrong clock for the watchdog: on emulator-5592
 * the 12 s budget fired on a canvas that was ALREADY on screen, and Retry did
 * not recover emulator-5590. Ready and paint had come apart, and the watchdog
 * was timing the one that is allowed to be slow.
 *
 * So this is the early half, and it carries nothing but the fact that pixels
 * exist. Two `requestAnimationFrame`s, not one: the first is scheduled before
 * the browser paints the frame this mount produced, the second runs after it.
 * A single frame would report "about to paint", which is the claim that was
 * already being made by `ready` and is not the one the watchdog needs.
 *
 * It is a child of `ReactFlow`, so mounting means React Flow rendered. It
 * renders `null` and fires exactly once per mount.
 */

import { useEffect, useRef } from 'react';

export interface GraphPaintProbeProps {
  /** Fired once, on the frame after React Flow's first render. */
  readonly onPaint: () => void;
}

export const GraphPaintProbe = ({ onPaint }: GraphPaintProbeProps) => {
  const fired = useRef(false);
  // Read through a ref so a caller rebuilding the callback each render does not
  // re-arm the probe — the whole point is that it fires once.
  const latest = useRef(onPaint);
  // oxlint-disable-next-line react/refs -- latest-value ref, written every render by design
  latest.current = onPaint;

  useEffect(() => {
    if (fired.current) {
      return;
    }
    let cancelled = false;
    // A canvas can mount where there is no rAF at all (a spec under happy-dom).
    // Firing synchronously there is honest: the tree rendered, and there is no
    // compositor to wait for.
    const raf = globalThis.requestAnimationFrame;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the declared type lies: happy-dom and some realms have no rAF at all
    if (typeof raf !== 'function') {
      fired.current = true;
      latest.current();
      return;
    }
    let inner: number | null = null;
    const outer = raf(() => {
      if (cancelled) {
        return;
      }
      inner = raf(() => {
        if (cancelled || fired.current) {
          return;
        }
        fired.current = true;
        latest.current();
      });
    });
    // oxlint-disable-next-line typescript/consistent-return -- a cleanup is returned only when frames were scheduled
    return () => {
      cancelled = true;
      globalThis.cancelAnimationFrame?.(outer);
      if (inner !== null) {
        globalThis.cancelAnimationFrame?.(inner);
      }
    };
  }, []);

  return null;
};
