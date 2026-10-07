/**
 * Task 3.6 — toolbar select mode, and the guard it turns on.
 *
 * The claim from the plan, and it is a claim about UPSTREAM, not about us:
 * with `panOnDrag={false} selectionOnDrag`, a touch `pointerdown` on the pane
 * passes the guard at `Pane/index.tsx:146` and starts a selection; with
 * `panOnDrag` truthy it does not. Verified against the installed 12.11.5 at
 * `dist/esm/index.js:1481`:
 *
 *   if (event.pointerType === 'touch' && panOnDrag !== false && !selectionKeyPressed) return;
 *
 * Three cases, because two of them would pass for the wrong reason alone:
 *
 *  - `panOnDrag: false` — the selection starts. That is the mode.
 *  - `panOnDrag: [0, 2]` — an ARRAY, so `_selectionOnDrag` is still true
 *    (`index.js:2121` bails only on `panOnDrag === true`) and
 *    `onPointerDownCapture` IS installed. The only thing that refuses the touch
 *    is the guard. Testing `panOnDrag: true` instead would stay green with the
 *    guard deleted, because upstream never installs the handler in that case —
 *    a passing test that proves nothing.
 *  - the same array with a MOUSE pointer — the selection starts. So the
 *    refusal above is the `pointerType === 'touch'` arm and not the array.
 *
 * `panOnDrag: false` is asserted by IDENTITY (`toBe(false)`), never by
 * falsiness. The guard reads `panOnDrag !== false`, so `0`, `[]` and `null` are
 * all truthy to it, and every one of them is a silently broken select mode.
 */

import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NodeRect, Viewport } from '../model/index';
import { ReactFlow, SelectionMode, useStore } from '../react-flow/xy';

import type { GraphInteractionMode, LassoLongPressOptions } from './useLassoSelect';
import { lassoFlowProps, lassoHoldMs, lassoSlopPx, useLassoSelect } from './useLassoSelect';

afterEach(cleanup);

/**
 * React Flow paints `.react-flow__selection` only once `userSelectionActive` is
 * set, which needs a second event — a MOVE. The rect itself is set on
 * pointerdown and "starts a selection" is exactly that, so this reads the store
 * instead of staging a whole drag. Pure render, no effect: the probe
 * re-renders through the store subscription like any other React Flow child.
 */
function SelectionProbe() {
  const rect = useStore((state) => state.userSelectionRect);
  return rect ? <div data-testid="selection-started" /> : null;
}

function mountPane(mode: GraphInteractionMode | { panOnDrag: boolean | number[] }) {
  const props =
    typeof mode === 'string' ? lassoFlowProps(mode) : { ...lassoFlowProps('select'), panOnDrag: mode.panOnDrag };
  const { container } = renderWithProviders(
    <div style={{ width: 400, height: 300 }}>
      <ReactFlow
        nodes={[]}
        edges={[]}
        elementsSelectable
        // Off in the harness only. It is a `requestAnimationFrame` loop that
        // outlives the assertion and has nothing to do with the guard.
        autoPanOnSelection={false}
        proOptions={{ hideAttribution: true }}
        {...props}>
        <SelectionProbe />
      </ReactFlow>
    </div>,
  );
  const pane = container.querySelector<HTMLElement>('.react-flow__pane');
  if (!pane) {
    throw new Error('the pane never mounted');
  }
  return { container, pane };
}

function pressOn(pane: HTMLElement, pointerType: 'touch' | 'mouse') {
  act(() => {
    pane.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 40,
        clientY: 40,
        isPrimary: true,
        pointerId: 1,
        pointerType,
      }),
    );
  });
}

const started = (container: HTMLElement) => container.querySelector('[data-testid="selection-started"]') !== null;

describe('the props the mode resolves to', () => {
  it('select mode sets panOnDrag to false by identity, not by falsiness', () => {
    const props = lassoFlowProps('select');
    expect(props.panOnDrag).toBe(false);
    expect(props.selectionOnDrag).toBe(true);
    expect(props.selectionMode).toBe(SelectionMode.Partial);
  });

  it("pan mode is React Flow's own default and selects nothing on drag", () => {
    const props = lassoFlowProps('pan');
    expect(props.panOnDrag).toBe(true);
    expect(props.selectionOnDrag).toBe(false);
  });
});

describe('the Pane guard', () => {
  it('starts a selection on a touch pointerdown in select mode', () => {
    const { container, pane } = mountPane('select');
    expect(started(container)).toBe(false);
    pressOn(pane, 'touch');
    expect(started(container)).toBe(true);
  });

  it('refuses the same touch when panOnDrag is a truthy array', () => {
    const { container, pane } = mountPane({ panOnDrag: [0, 2] });
    pressOn(pane, 'touch');
    expect(started(container)).toBe(false);
  });

  it('lets the same array through for a mouse, so the refusal is the touch arm', () => {
    const { container, pane } = mountPane({ panOnDrag: [0, 2] });
    pressOn(pane, 'mouse');
    expect(started(container)).toBe(true);
  });

  it('starts nothing on a touch in pan mode', () => {
    const { container, pane } = mountPane('pan');
    pressOn(pane, 'touch');
    expect(started(container)).toBe(false);
  });
});

describe('the mode the toolbar owns', () => {
  it('defaults to pan, so a graph with no toolbar behaves exactly as before', () => {
    const { result } = renderHook(() => useLassoSelect());
    expect(result.current.mode).toBe('pan');
    expect(result.current.flowProps.panOnDrag).toBe(true);
  });

  it('toggles between the two modes and reports the new props', () => {
    const { result } = renderHook(() => useLassoSelect());
    act(() => {
      result.current.toggleMode();
    });
    expect(result.current.mode).toBe('select');
    expect(result.current.flowProps.panOnDrag).toBe(false);
    act(() => {
      result.current.toggleMode();
    });
    expect(result.current.mode).toBe('pan');
  });

  it('is controlled when a mode is passed, and never moves on its own', () => {
    const onModeChange = vi.fn();
    const { result } = renderHook(() => useLassoSelect({ mode: 'select', onModeChange }));
    expect(result.current.mode).toBe('select');
    act(() => {
      result.current.setMode('pan');
    });
    expect(onModeChange).toHaveBeenCalledWith('pan');
    // The owner did not re-render us with the new value, so it did not change.
    expect(result.current.mode).toBe('select');
  });

  it('reports a change out of an uncontrolled hook too', () => {
    const onModeChange = vi.fn();
    const { result } = renderHook(() => useLassoSelect({ onModeChange }));
    act(() => {
      result.current.setMode('select');
    });
    expect(onModeChange).toHaveBeenCalledWith('select');
    expect(result.current.mode).toBe('select');
  });
});

/* ── Task 3.7: L1, L2, L5, L6, L7 ─────────────────────────────────────────
 *
 * `lassoIntercept.spec.ts` proves the MECHANISM in isolation, which is the
 * thing three prior designs got wrong. This proves the STATE MACHINE built on
 * it, with fake timers so a 350 ms hold costs nothing.
 *
 * The pane is a real element in a real document, not a mock: the hook finds it
 * by class under the root, listens on it, and dispatches a `touchcancel` at it.
 * Faking that away would leave nothing worth testing.
 */

interface Harness {
  readonly root: HTMLDivElement;
  readonly pane: HTMLDivElement;
  readonly viewport: { current: Viewport };
  readonly onSelect: ReturnType<typeof vi.fn<(ids: readonly string[]) => void>>;
  readonly onHaptic: ReturnType<typeof vi.fn<() => void>>;
  readonly setViewport: ReturnType<typeof vi.fn<(v: Viewport) => void>>;
  readonly options: LassoLongPressOptions;
  /** d3's `touchmove.zoom`, in the shape it actually has: bubble phase, above the pane. */
  readonly d3Pan: ReturnType<typeof vi.fn<(event: Event) => void>>;
  readonly d3Cancel: ReturnType<typeof vi.fn<(event: Event) => void>>;
}

const nodes: readonly NodeRect[] = [
  { id: 'a', rect: { x: 0, y: 0, width: 100, height: 60 } },
  { id: 'b', rect: { x: 400, y: 400, width: 100, height: 60 } },
];

function harness(overrides: Partial<LassoLongPressOptions> = {}): Harness {
  const root = document.createElement('div');
  // `.react-flow__renderer` is where d3 is bound, and it is an ANCESTOR of the
  // pane. The interceptor has to sit above it, so the fixture has to contain
  // it or the assertion is weaker than the product.
  const renderer = document.createElement('div');
  renderer.className = 'react-flow__renderer';
  const pane = document.createElement('div');
  pane.className = 'react-flow__pane';
  renderer.append(pane);
  root.append(renderer);
  document.body.append(root);

  const d3Pan = vi.fn<(event: Event) => void>();
  const d3Cancel = vi.fn<(event: Event) => void>();
  renderer.addEventListener('touchmove', d3Pan);
  renderer.addEventListener('touchcancel', d3Cancel);

  const viewport = { current: { x: 10, y: 20, zoom: 2 } as Viewport };
  const setViewport = vi.fn<(v: Viewport) => void>((next) => {
    viewport.current = next;
  });
  const onSelect = vi.fn<(ids: readonly string[]) => void>();
  const onHaptic = vi.fn<() => void>();

  const rootRef = createRef<HTMLElement>() as { current: HTMLElement | null };
  rootRef.current = root;

  return {
    root,
    pane,
    viewport,
    onSelect,
    onHaptic,
    setViewport,
    d3Pan,
    d3Cancel,
    options: {
      rootRef,
      enabled: true,
      viewport: { get: () => viewport.current, set: setViewport },
      getNodeRects: () => nodes,
      onSelect,
      onHaptic,
      ...overrides,
    },
  };
}

function touchEvent(type: string, target: HTMLElement, points: readonly [number, number][]) {
  const touches = points.map(([x, y], index) => new Touch({ identifier: index, target, clientX: x, clientY: y }));
  return new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : touches,
    targetTouches: type === 'touchend' ? [] : touches,
    changedTouches: touches,
  });
}

const fire = (target: HTMLElement, type: string, points: readonly [number, number][]) => {
  act(() => {
    target.dispatchEvent(touchEvent(type, target, points));
  });
};

describe('the long press', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function mount(overrides: Partial<LassoLongPressOptions> = {}) {
    const h = harness(overrides);
    const view = renderHook(() => useLassoSelect({ longPress: h.options }));
    return { ...h, view };
  }

  it('L1: a hold of 350 ms arms, snapshots the viewport and asks for a haptic', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    expect(h.view.result.current.armed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(lassoHoldMs - 1);
    });
    expect(h.view.result.current.armed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(h.view.result.current.armed).toBe(true);
    expect(h.onHaptic).toHaveBeenCalledOnce();
    // The value read at touchstart, written back on arm — not whatever the
    // viewport happens to be now.
    expect(h.setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 2 });
  });

  it("L1: arming ends d3's gesture with a touchcancel at the pane", () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    expect(h.d3Cancel).toHaveBeenCalledOnce();
  });

  it('L1: arming forces panOnDrag false, so nothing new can start', () => {
    const h = mount();
    expect(h.view.result.current.flowProps.panOnDrag).toBe(true);
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    expect(h.view.result.current.flowProps.panOnDrag).toBe(false);
    // `effectiveMode` is what a canvas is given, and it is the reason this is
    // two fields rather than one: measured in Chrome, a story that passed
    // `mode` left the pane `draggable` for the whole armed gesture.
    expect(h.view.result.current.effectiveMode).toBe('select');
    // The TOOLBAR mode is untouched. Arming is a gesture, not a mode change,
    // and the toolbar must read the same after the finger lifts.
    expect(h.view.result.current.mode).toBe('pan');
  });

  it('armed, the interceptor takes touchmove away from d3', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    fire(h.pane, 'touchmove', [[52, 52]]);
    // Still pending: d3 is panning normally and has no idea we are here.
    expect(h.d3Pan).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    fire(h.pane, 'touchmove', [[200, 180]]);
    fire(h.pane, 'touchmove', [[260, 240]]);
    expect(h.d3Pan).toHaveBeenCalledOnce();
    expect(h.view.result.current.marquee).toEqual({
      x: 50,
      y: 50,
      width: 210,
      height: 190,
    });
  });

  it('L2: past the slop before the timer fires, it stays an ordinary pan', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    fire(h.pane, 'touchmove', [[50 + lassoSlopPx + 1, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs * 2);
    });
    expect(h.view.result.current.armed).toBe(false);
    expect(h.onHaptic).not.toHaveBeenCalled();
    expect(h.setViewport).not.toHaveBeenCalled();
    // Nothing was intercepted, so the pan saw every move it was sent.
    expect(h.d3Pan).toHaveBeenCalledOnce();
  });

  it('L2: movement INSIDE the slop still arms', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    fire(h.pane, 'touchmove', [[50 + lassoSlopPx - 1, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    expect(h.view.result.current.armed).toBe(true);
  });

  it('L5: a second touch point while armed cancels everything and gives the gesture back', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    expect(h.view.result.current.armed).toBe(true);

    fire(h.pane, 'touchmove', [
      [60, 60],
      [200, 200],
    ]);
    expect(h.view.result.current.armed).toBe(false);
    expect(h.view.result.current.marquee).toBeNull();
    expect(h.onSelect).not.toHaveBeenCalled();

    // The interceptor is gone, so a pinch reaches d3 exactly as it would have.
    const before = h.d3Pan.mock.calls.length;
    fire(h.pane, 'touchmove', [
      [70, 70],
      [210, 210],
    ]);
    expect(h.d3Pan).toHaveBeenCalledTimes(before + 1);
  });

  it('L5: a second touch point while PENDING cancels the timer', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    fire(h.pane, 'touchstart', [
      [50, 50],
      [200, 200],
    ]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs * 2);
    });
    expect(h.view.result.current.armed).toBe(false);
  });

  it('L6: release commits the selection in FLOW units and restores everything', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    fire(h.pane, 'touchmove', [[400, 300]]);
    fire(h.pane, 'touchend', [[400, 300]]);

    // Screen (50,50)-(400,300) at pan (10,20) zoom 2 is flow (20,15)-(195,140),
    // which covers node "a" at (0,0,100x60) and not node "b" at (400,400).
    expect(h.onSelect).toHaveBeenCalledOnce();
    expect(h.onSelect.mock.calls[0][0]).toEqual(['a']);
    expect(h.view.result.current.armed).toBe(false);
    expect(h.view.result.current.marquee).toBeNull();
    expect(h.view.result.current.flowProps.panOnDrag).toBe(true);
    expect(h.view.result.current.effectiveMode).toBe('pan');

    const before = h.d3Pan.mock.calls.length;
    fire(h.pane, 'touchmove', [[10, 10]]);
    expect(h.d3Pan).toHaveBeenCalledTimes(before + 1);
  });

  it('L6: a hold with no movement selects nothing rather than everything', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    fire(h.pane, 'touchend', [[50, 50]]);
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it('L7: disabled, nothing is listened for and nothing is intercepted', () => {
    const h = mount({ enabled: false });
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs * 2);
    });
    expect(h.view.result.current.armed).toBe(false);
    expect(h.onHaptic).not.toHaveBeenCalled();
    fire(h.pane, 'touchmove', [[200, 200]]);
    expect(h.d3Pan).toHaveBeenCalledOnce();
  });

  it('L7: the default is off, so a fine-pointer canvas is untouched', () => {
    const h = harness();
    const { rootRef, viewport, getNodeRects } = h.options;
    const view = renderHook(() => useLassoSelect({ longPress: { rootRef, viewport, getNodeRects } }));
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs * 2);
    });
    expect(view.result.current.armed).toBe(false);
  });

  it('unmounting mid-gesture releases the interceptor', () => {
    const h = mount();
    fire(h.pane, 'touchstart', [[50, 50]]);
    act(() => {
      vi.advanceTimersByTime(lassoHoldMs);
    });
    const before = h.d3Pan.mock.calls.length;
    h.view.unmount();
    fire(h.pane, 'touchmove', [[200, 200]]);
    expect(h.d3Pan).toHaveBeenCalledTimes(before + 1);
  });
});
