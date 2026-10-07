/**
 * Task 3.7, the first thing to prove — and deliberately the ONLY thing this
 * file knows about. No React, no React Flow, no hook: three nested divs and
 * two listeners.
 *
 * Design §7.3 names three mechanisms that were proposed and do not work, and
 * every one of them failed because it was never isolated from the canvas:
 * `setPointerCapture` cannot steal a legacy `TouchEvent` from d3; `panOnDrag`
 * as an array is only consulted for `mousedown`; flipping `panOnDrag` mid-hold
 * cannot stop a d3 gesture that has already started. So the fourth mechanism
 * gets tested at its own level before anything is built on it.
 *
 * The claim: a capture-phase `touchmove` listener on an ANCESTOR stops the
 * event before a bubble-phase listener below it ever runs, and removing that
 * listener restores delivery.
 *
 * The fixture mirrors the real tree on purpose. d3-zoom binds `touchmove.zoom`
 * on the element it is called with, which in React Flow is
 * `.react-flow__renderer` — an ANCESTOR of `.react-flow__pane`, not the pane
 * itself. So `mid` carries a bubble listener as well as `target`, and the
 * interceptor has to sit above them BOTH. An interceptor installed on the pane
 * would pass a test that only watched the pane and would still let d3 pan the
 * canvas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installLassoIntercept } from './lassoIntercept';

let root: HTMLDivElement;
let mid: HTMLDivElement;
let target: HTMLDivElement;
type Listener = ReturnType<typeof vi.fn<(event: Event) => void>>;

/** Bubble-phase listeners, standing in for d3's `touchmove.zoom`. */
let onMid: Listener;
let onTarget: Listener;

beforeEach(() => {
  root = document.createElement('div');
  mid = document.createElement('div');
  target = document.createElement('div');
  mid.append(target);
  root.append(mid);
  document.body.append(root);
  onMid = vi.fn<(event: Event) => void>();
  onTarget = vi.fn<(event: Event) => void>();
  mid.addEventListener('touchmove', onMid);
  target.addEventListener('touchmove', onTarget);
});

afterEach(() => {
  root.remove();
  vi.restoreAllMocks();
});

function fire(type: string, touchCount = 1): TouchEvent {
  const touches = Array.from(
    { length: touchCount },
    (_, index) => new Touch({ identifier: index, target, clientX: 10 + index, clientY: 20 + index }),
  );
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches,
    targetTouches: touches,
    changedTouches: touches,
  });
  target.dispatchEvent(event);
  return event;
}

describe('the mechanism', () => {
  it('delivers touchmove to both bubble listeners with nothing installed', () => {
    fire('touchmove');
    expect(onTarget).toHaveBeenCalledOnce();
    expect(onMid).toHaveBeenCalledOnce();
  });

  it('a capture listener on the ancestor stops the event reaching either of them', () => {
    installLassoIntercept({ ancestor: root });
    fire('touchmove');
    expect(onTarget).not.toHaveBeenCalled();
    expect(onMid).not.toHaveBeenCalled();
  });

  it('restores delivery to both when released', () => {
    const intercept = installLassoIntercept({ ancestor: root });
    fire('touchmove');
    intercept.release();
    fire('touchmove');
    expect(onTarget).toHaveBeenCalledOnce();
    expect(onMid).toHaveBeenCalledOnce();
  });

  it('works from the document, which is the ancestor of everything', () => {
    // The hook's default. A specific ancestor has to be chosen correctly and
    // `document` cannot be chosen wrongly — it is above `.react-flow__renderer`
    // however deep the canvas is nested in a consumer's layout.
    const intercept = installLassoIntercept({ ancestor: document });
    fire('touchmove');
    expect(onMid).not.toHaveBeenCalled();
    intercept.release();
    fire('touchmove');
    expect(onMid).toHaveBeenCalledOnce();
  });

  it('hands every swallowed event to the caller, so the marquee can be drawn from them', () => {
    const onIntercept = vi.fn<(event: TouchEvent) => void>();
    installLassoIntercept({ ancestor: root, onIntercept });
    fire('touchmove');
    fire('touchmove');
    expect(onIntercept).toHaveBeenCalledTimes(2);
    expect(onIntercept.mock.calls[0][0].type).toBe('touchmove');
  });
});

describe('what it deliberately does NOT swallow', () => {
  /**
   * Arming dispatches a `touchcancel` at the pane so d3 ends its gesture
   * cleanly rather than sitting on a live `g.touch0` (design §7.3 L3). An
   * interceptor that swallowed every touch event would eat that dispatch and
   * leave d3 exactly as stuck as doing nothing — which is why this is a spec
   * and not a comment about the listener's event name.
   */
  it.each(['touchstart', 'touchend', 'touchcancel'])('lets %s through', (type) => {
    const seen = vi.fn<(event: Event) => void>();
    mid.addEventListener(type, seen);
    installLassoIntercept({ ancestor: root });
    fire(type);
    expect(seen).toHaveBeenCalledOnce();
  });

  it('never preventDefaults, so it cannot cancel a scroll the pane wanted', () => {
    installLassoIntercept({ ancestor: root });
    const event = fire('touchmove');
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('release', () => {
  it('is idempotent', () => {
    const intercept = installLassoIntercept({ ancestor: root });
    intercept.release();
    intercept.release();
    fire('touchmove');
    expect(onMid).toHaveBeenCalledOnce();
  });

  it('reports whether it is still installed', () => {
    const intercept = installLassoIntercept({ ancestor: root });
    expect(intercept.active).toBe(true);
    intercept.release();
    expect(intercept.active).toBe(false);
  });

  it('a second release does not disarm a later interceptor', () => {
    const first = installLassoIntercept({ ancestor: root });
    first.release();
    const second = installLassoIntercept({ ancestor: root });
    first.release();
    fire('touchmove');
    expect(onMid).not.toHaveBeenCalled();
    second.release();
  });
});
