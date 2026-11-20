/**
 * Select mode: the free half of the lasso (design §7.3, task 3.6).
 *
 * There are two ways into a marquee on touch and this is the one that costs
 * nothing, because it is upstream's own path rather than a mechanism we own.
 * The toolbar flips a mode; the canvas re-renders with
 * `panOnDrag={false} selectionOnDrag selectionMode={SelectionMode.Partial}`;
 * the next `pointerdown` then passes React Flow's touch guard.
 *
 * That guard, verbatim from the installed 12.11.5 (`Pane/index.tsx:143-148`,
 * shipped at `dist/esm/index.js:1481`):
 *
 *   if (event.pointerType === 'touch' && panOnDrag !== false && !selectionKeyPressed) return;
 *
 * `panOnDrag !== false` is an IDENTITY check, so `false` is the only value in
 * the language that opens it. `0`, `[]`, `null` and `undefined` are every bit
 * as truthy to that line as `true` is, and each of them yields a select mode
 * that looks right in a props table and does nothing under a finger. Hence
 * `panOnDrag: false as const` below rather than anything computed, and hence
 * the spec asserting it with `toBe(false)`.
 *
 * `SelectionMode.Partial` is the touch default on purpose: `Full` asks the user
 * to enclose a node completely, and on a phone the marquee is drawn with the
 * thing you are aiming at hidden under your hand.
 *
 * The long press (design §7.3 L1-L7) is the OTHER entry point, added in task
 * 3.7 below. It drives this same mode and it is opt-in, so that if the
 * interceptor turns out not to work on a real WebView, toolbar mode is
 * untouched and there is still a lasso.
 */

import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MarqueeMode, NodeId, NodeRect, Rect, Viewport } from '../model/index';
import { selectInMarquee } from '../model/select';
import { SelectionMode, reactFlowPaneSelector } from '../react-flow/xy';

import { installLassoIntercept } from './lasso-intercept';
import type { LassoIntercept } from './lasso-intercept';

/**
 * `pan` is React Flow's ordinary canvas — one finger pans, and that is what
 * every graph does today. `select` swaps that one finger for a marquee.
 *
 * Two values, not three: a "connect" mode was considered and dropped, because
 * connecting already starts from a port rather than from the pane and a mode
 * for it would be a mode the user has to remember to leave.
 */
export type GraphInteractionMode = 'pan' | 'select';

/** Exactly the React Flow props the mode decides, and no others. */
export interface LassoFlowProps {
  readonly panOnDrag: boolean;
  readonly selectionOnDrag: boolean;
  readonly selectionMode: SelectionMode;
}

const panProps: LassoFlowProps = {
  panOnDrag: true,
  selectionOnDrag: false,
  selectionMode: SelectionMode.Partial,
};

const selectProps: LassoFlowProps = {
  panOnDrag: false,
  selectionOnDrag: true,
  selectionMode: SelectionMode.Partial,
};

/**
 * Frozen module constants rather than a fresh object per call: these are spread
 * onto `ReactFlow` on every render of the canvas, and a new `selectionMode`
 * identity each time is a prop change React Flow has to reconcile for nothing.
 */
export const lassoFlowProps = (mode: GraphInteractionMode): LassoFlowProps =>
  mode === 'select' ? selectProps : panProps;

/* ── The long press (design §7.3 L1-L7, task 3.7) ──────────────────────── */

/** Design §7.3 L1. Long enough not to fire on a flick, short enough to feel deliberate. */
export const lassoHoldMs = 350;
/** Design §7.3 L2. Past this before the timer fires, it was a pan and it stays one. */
export const lassoSlopPx = 10;

/**
 * The viewport, as a port rather than as `useReactFlow()`.
 *
 * Arming has to UNDO the sub-slop drift d3 already applied during the hold
 * (L3), which means reading the viewport at `touchstart` and writing it back
 * 350 ms later. Taking that as two functions rather than reaching for the
 * instance keeps this hook mountable outside `ReactFlowProvider` — and, more
 * usefully, keeps the screen/flow arithmetic below honest: it is the same
 * `(screen - paneOrigin - pan) / zoom` React Flow uses, written out, rather
 * than a helper whose behavior a spec would have to take on trust.
 *
 * Whether d3 HONOURS a `setViewport` mid-gesture is not something a unit test
 * can answer. That is the device video's job, and until it exists the long
 * press is a hypothesis (design §7.3).
 */
export interface LassoViewportPort {
  readonly get: () => Viewport;
  readonly set: (viewport: Viewport) => void;
}

export interface LassoLongPressOptions {
  /**
   * The canvas root. The pane is found under it by class, so a consumer
   * threads one ref instead of reaching into React Flow's tree.
   */
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly viewport: LassoViewportPort;
  /** Every node's rect in FLOW units. Same shape `model/select.ts` takes. */
  readonly getNodeRects: () => readonly NodeRect[];
  readonly onSelect?: (ids: readonly NodeId[]) => void;
  /**
   * Design §7.3 L3. A WebView cannot buzz, so the canvas asks and the native
   * shell does it — this is what becomes `{ t: "haptic", kind: "selection" }`.
   */
  readonly onHaptic?: () => void;
  /**
   * Every way OUT of an armed gesture that is not a selection: past the slop, a
   * second finger, an unmount. Milestone 6 added it because a native shell has
   * a readout to clear and a marquee to stop drawing, and without this it could
   * only learn that a lasso had ended by inferring it from a `select` that
   * never came.
   *
   * Fires ONCE per armed gesture and never for a press that never armed — a tap
   * is not a cancelled lasso.
   */
  readonly onCancel?: () => void;
  readonly holdMs?: number;
  readonly slopPx?: number;
  readonly marqueeMode?: MarqueeMode;
  /**
   * Design §7.3 L7: on fine pointers NOTHING changes. Default false, so the
   * long press is something a touch canvas opts into and a mouse canvas never
   * sees — React Flow's own `selectionKeyCode` lasso stays the desktop answer.
   */
  readonly enabled?: boolean;
}

export interface UseLassoSelectOptions {
  /** Controlled. When set, the hook never changes the mode itself. */
  readonly mode?: GraphInteractionMode;
  /** Uncontrolled seed. Defaults to `pan`, so a canvas with no toolbar is unchanged. */
  readonly defaultMode?: GraphInteractionMode;
  readonly onModeChange?: (mode: GraphInteractionMode) => void;
  readonly longPress?: LassoLongPressOptions;
}

export interface LassoSelect {
  /** What the TOOLBAR says. Arming does not change it, so the button does not flicker. */
  readonly mode: GraphInteractionMode;
  readonly setMode: (mode: GraphInteractionMode) => void;
  readonly toggleMode: () => void;
  /**
   * What the CANVAS should be given — `select` while armed, whatever the
   * toolbar says otherwise. Pass this to `NodeGraphWeb`'s `interactionMode`,
   * not `mode`.
   *
   * Measured in Chrome before this existed: the story passed `mode`, the pane
   * kept its `draggable` class through the whole armed gesture, and L3's
   * "set `panOnDrag={false}` so nothing new starts" was true of `flowProps`
   * and of nothing else. The interceptor stops the gesture already running;
   * this is what stops the next one.
   */
  readonly effectiveMode: GraphInteractionMode;
  readonly flowProps: LassoFlowProps;
  /** True between the hold firing and the finger lifting. */
  readonly armed: boolean;
  /** The marquee in pane-relative SCREEN px, or null. `LassoOverlay` paints it. */
  readonly marquee: Rect | null;
}

const rectBetween = (a: XYPoint, b: XYPoint): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

interface XYPoint {
  readonly x: number;
  readonly y: number;
}

const firstTouch = (event: TouchEvent): Touch | undefined => event.touches[0] ?? event.changedTouches[0];

/** What the long-press machine paints: the armed flag and the live marquee. */
interface LassoLongPressState {
  armed: boolean;
  marquee: Rect | null;
}

/**
 * L1-L7, as one state machine with three states: idle, PENDING (the finger is
 * down and the timer is running) and ARMED (the timer fired and the interceptor
 * is installed).
 *
 * Everything the gesture needs lives in one ref rather than in state, because a
 * `touchmove` arrives per frame and a `setState` per frame would re-render the
 * whole canvas to move a rectangle. Only the two things that PAINT — `armed`
 * and `marquee` — are state.
 *
 * The listeners are attached once, on the pane, for the life of the mount, and
 * the state machine decides what to do. Attaching and detaching them as the
 * gesture progresses would be four more places for a stuck listener to hide,
 * and design §7.3 already lists three mechanisms that failed in exactly that
 * way.
 */
const useLassoLongPress = (options?: LassoLongPressOptions): LassoLongPressState => {
  const [armed, setArmed] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  // The options object is rebuilt by the caller on every render; reading it
  // through a ref keeps the effect below from tearing down its listeners each
  // time, which mid-gesture would drop the gesture.
  const latest = useRef(options);
  // oxlint-disable-next-line react/refs -- latest-value ref: the listeners attached once below must see this render's options
  latest.current = options;

  const gesture = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    origin: XYPoint | null;
    snapshot: Viewport | null;
    intercept: LassoIntercept | null;
    /**
     * The marquee, MIRRORED out of state.
     *
     * `marquee` is state because it paints, and the commit at L6 has to read it
     * synchronously on the `touchend` — a `setMarquee` updater does not run
     * until the next render, so a commit written inside one is reading a value
     * from the future and reporting a cancel from the past. It was written that
     * way and worked by accident; milestone 6 needed the same value to decide
     * between `select` and `cancel`, which is where the accident showed.
     */
    marquee: Rect | null;
  }>({ timer: null, origin: null, snapshot: null, intercept: null, marquee: null });

  const enabled = options?.enabled ?? false;
  const rootRef = options?.rootRef;

  // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- the cleanup below calls `reset()`, which clears the timer; the early returns allocate nothing
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const root = rootRef?.current;
    const pane = root?.querySelector<HTMLElement>(reactFlowPaneSelector);
    if (!pane) {
      return;
    }

    const state = gesture.current;
    /**
     * True only for the microsecond the arm spends dispatching its own
     * `touchcancel`. `dispatchEvent` is synchronous, so a boolean is exact.
     *
     * Found by the L1 spec throwing rather than by reading the diff: the
     * escape hatch that tells d3 to let go is a `touchcancel` at the pane, and
     * the pane is where THIS hook listens for the finger lifting. Arming
     * therefore ended the gesture it had just started, one line after starting
     * it. `isTrusted` cannot separate the two — every event in a spec is
     * untrusted — so the dispatcher says so itself.
     */
    let selfCancelling = false;

    /**
     * Everything back to idle. Safe to call from any state, and it is.
     *
     * `announce` separates the two callers. `reset()` after a COMMITTED
     * selection must not also report a cancel — the gesture ended the way it
     * was meant to — while every other exit from an ARMED gesture must, or a
     * native readout has no way to learn the lasso is over. A press that never
     * armed reports nothing either way: a tap is not a cancelled lasso.
     */
    /** Writes both halves at once, so the ref and the paint cannot disagree. */
    const putMarquee = (rect: Rect | null) => {
      state.marquee = rect;
      setMarquee(rect);
    };

    const reset = (announce = true) => {
      const wasArmed = state.intercept !== null;
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
      state.timer = null;
      state.origin = null;
      state.snapshot = null;
      state.intercept?.release();
      state.intercept = null;
      setArmed(false);
      putMarquee(null);
      if (announce && wasArmed) {
        latest.current?.onCancel?.();
      }
    };

    const paneOrigin = () => {
      const box = pane.getBoundingClientRect();
      return { x: box.left, y: box.top };
    };

    /**
     * Screen px to flow units, written out rather than delegated. `pan` and
     * `zoom` come from the port, the pane's own box turns a client point into
     * a pane-relative one, and the rest is the transform React Flow's viewport
     * applies, inverted.
     */
    const toFlow = (point: XYPoint): XYPoint => {
      const view = latest.current?.viewport.get();
      if (!view) {
        return point;
      }
      return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
    };

    /** Fed by the interceptor, so the marquee is drawn from the events it swallowed. */
    const onArmedMove = (event: TouchEvent) => {
      // L5. A second finger is a pinch, and a pinch is not a lasso.
      if (event.touches.length > 1) {
        reset();
        return;
      }
      const touch = firstTouch(event);
      if (!touch || !state.origin) {
        return;
      }
      const origin = paneOrigin();
      putMarquee(
        rectBetween(state.origin, {
          x: touch.clientX - origin.x,
          y: touch.clientY - origin.y,
        }),
      );
    };

    /** L3, in the order design §7.3 gives, because the order is the mechanism. */
    const arm = () => {
      const opts = latest.current;
      if (!opts || !state.origin) {
        return;
      }
      state.timer = null;

      opts.onHaptic?.();
      state.intercept = installLassoIntercept({
        ancestor: pane.ownerDocument,
        onIntercept: onArmedMove,
      });
      // d3 keeps a live `g.touch0` until it sees an end or a cancel, and it
      // will never see another move now. Without this it sits mid-gesture and
      // the NEXT touch continues the old pan.
      selfCancelling = true;
      // oxlint-disable-next-line react/todo -- inside an effect, not render; the compiler's try/finally gap does not apply and `finally` must clear the flag
      try {
        pane.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true, touches: [] }));
      } finally {
        selfCancelling = false;
      }
      // Undo the drift d3 applied under the slop threshold: up to 10 px of pan
      // happened during the hold and the user did not ask for it.
      if (state.snapshot) {
        opts.viewport.set(state.snapshot);
      }

      setArmed(true);
      putMarquee({ x: state.origin.x, y: state.origin.y, width: 0, height: 0 });
    };

    const onTouchStart = (event: TouchEvent) => {
      const opts = latest.current;
      if (!opts) {
        return;
      }
      // L5, the other half: a finger landing while armed, or while pending,
      // hands the gesture back for pinch.
      if (event.touches.length > 1) {
        reset();
        return;
      }
      const touch = firstTouch(event);
      if (!touch) {
        return;
      }
      const origin = paneOrigin();
      state.origin = { x: touch.clientX - origin.x, y: touch.clientY - origin.y };
      // L1
      state.snapshot = opts.viewport.get();
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
      state.timer = setTimeout(arm, opts.holdMs ?? lassoHoldMs);
    };

    /**
     * Only ever sees the PENDING phase: once armed, the interceptor above has
     * already stopped the event before it reaches this bubble listener. That
     * is the mechanism working on its own author, and it is why arming feeds
     * `onArmedMove` from the interceptor instead of from here.
     */
    const onTouchMove = (event: TouchEvent) => {
      if (state.timer === null) {
        return;
      }
      const touch = firstTouch(event);
      if (!touch || !state.origin) {
        return;
      }
      const origin = paneOrigin();
      const dx = touch.clientX - origin.x - state.origin.x;
      const dy = touch.clientY - origin.y - state.origin.y;
      // L2. Past the slop it was a pan, and the pan never knew we were here.
      if (Math.hypot(dx, dy) > (latest.current?.slopPx ?? lassoSlopPx)) {
        reset();
      }
    };

    /** L6. Commit, emit, remove the interceptor, restore the props. */
    const onTouchEnd = () => {
      if (selfCancelling) {
        return;
      }
      const opts = latest.current;
      // An armed gesture that lifts without a marquee is a CANCEL, not a
      // selection of nothing: the finger held, the interceptor installed, and
      // then nothing was drawn. `reset` cannot tell the two apart on its own,
      // so the commit path below flips this.
      let committed = false;
      const drawn = state.marquee;
      const hasArea = drawn !== null && (drawn.width > 0 || drawn.height > 0);
      if (state.intercept && opts && drawn && hasArea) {
        committed = true;
        const topLeft = toFlow(drawn);
        const bottomRight = toFlow({
          x: drawn.x + drawn.width,
          y: drawn.y + drawn.height,
        });
        opts.onSelect?.(
          selectInMarquee(
            opts.getNodeRects(),
            {
              x: topLeft.x,
              y: topLeft.y,
              width: bottomRight.x - topLeft.x,
              height: bottomRight.y - topLeft.y,
            },
            opts.marqueeMode ?? 'partial',
          ),
        );
      }
      reset(!committed);
    };

    pane.addEventListener('touchstart', onTouchStart, { passive: true });
    pane.addEventListener('touchmove', onTouchMove, { passive: true });
    pane.addEventListener('touchend', onTouchEnd, { passive: true });
    pane.addEventListener('touchcancel', onTouchEnd);
    // oxlint-disable-next-line typescript/consistent-return -- an effect returns a cleanup only when it installed something
    return () => {
      pane.removeEventListener('touchstart', onTouchStart);
      pane.removeEventListener('touchmove', onTouchMove);
      pane.removeEventListener('touchend', onTouchEnd);
      pane.removeEventListener('touchcancel', onTouchEnd);
      reset();
    };
  }, [enabled, rootRef]);

  return { armed, marquee };
};

/**
 * Controlled and uncontrolled, the same way `useGraphController` does it: the
 * prop wins when present, and `onModeChange` fires either way so a native shell
 * can mirror the mode into its own toolbar without owning it.
 */
export const useLassoSelect = (options: UseLassoSelectOptions = {}): LassoSelect => {
  const { mode: controlled, defaultMode = 'pan', onModeChange } = options;
  const [uncontrolled, setUncontrolled] = useState<GraphInteractionMode>(defaultMode);
  const mode = controlled ?? uncontrolled;

  // Read through a ref inside `setMode` so `toggleMode` does not have to be
  // rebuilt on every mode change. The canvas passes these straight to a
  // toolbar, and a toolbar that re-renders on each of its own presses is the
  // small kind of waste that adds up at 200 nodes.
  const current = useRef(mode);
  // oxlint-disable-next-line react/refs -- latest-value ref: written during render on purpose so `setMode` reads this render's mode without being rebuilt
  current.current = mode;

  const setMode = useCallback(
    (next: GraphInteractionMode) => {
      if (next === current.current) {
        return;
      }
      if (controlled === undefined) {
        setUncontrolled(next);
      }
      onModeChange?.(next);
    },
    [controlled, onModeChange],
  );

  const toggleMode = useCallback(() => {
    setMode(current.current === 'select' ? 'pan' : 'select');
  }, [setMode]);

  const { armed, marquee } = useLassoLongPress(options.longPress);

  // While armed the canvas must not start anything NEW (design §7.3 L3), so it
  // takes select-mode props whatever the toolbar says. The interceptor stops
  // the gesture already running; `panOnDrag: false` stops the next one.
  const effectiveMode: GraphInteractionMode = armed ? 'select' : mode;

  return useMemo(
    () => ({
      mode,
      setMode,
      toggleMode,
      effectiveMode,
      flowProps: lassoFlowProps(effectiveMode),
      armed,
      marquee,
    }),
    [mode, setMode, toggleMode, effectiveMode, armed, marquee],
  );
};
