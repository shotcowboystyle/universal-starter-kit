import type { Middleware, Placement } from '@floating-ui/react';
import { autoUpdate, offset, shift, size, useFloating } from '@floating-ui/react';
import { OVERLAY_ATTACH_GAP, radiusStopFromToken, resolveRadiusClass, useResolvedKnobs } from '@repo/theme';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { getTokenValue } from 'tamagui';

import { clampDropdownRadius, scrollArrowThreshold } from '../shared/floatingList';
import { containsAcrossPanels } from '../shared/panelPortal';

// React Native defines a `window` global without DOM event methods, so a bare
// `typeof window` check is not enough — the floating cores mount this hook on
// native (unused there, but it must not crash).
const canUseDom = typeof window !== 'undefined' && typeof window.addEventListener === 'function';

/**
 * Snap a floating-ui coordinate to the device pixel grid. A fractional
 * overlay origin (e.g. after shift() near a viewport edge) draws its border
 * on a half-lit pixel row that reads as a doubled/ghosted edge next to the
 * trigger's crisp border (OVERLAY_ANCHOR_GAP rule: overlay borders must
 * coincide with the surfaces they align to by construction).
 */
function roundToDevicePixel(value: number): number {
  const dpr = canUseDom ? window.devicePixelRatio || 1 : 1;
  return Math.round(value * dpr) / dpr;
}

export const panelAnimationDuration = 180;
export const panelGrowDuration = 200;
export const panelViewportPadding = 10;
/** Gap between trigger and panel. The cover ruling makes this
 * ZERO for the FloatingPanel family: the panel attaches to the trigger it
 * was opened from. Aliased to the house token so there is one source
 * (Axiom 5); `OVERLAY_ANCHOR_GAP` still governs FREE overlays. */
export const panelAnchorOffset = OVERLAY_ATTACH_GAP;

/**
 * How a panel's width relates to the trigger it opened from.
 * Three declared modes, not a boolean:
 * - `"fit-content"` — content-sized; the trigger's width is ignored. For
 *   icon-button triggers, where matching a 32px button would be absurd.
 * - `"match-trigger"` — width EXACTLY the trigger's, both when the content
 *   is narrower and when it is wider. The content scrolls or wraps.
 * - `"at-least-trigger"` — `max(trigger, content)`. The default, and the
 *   floor for every panel opened from a field-shaped trigger: a panel
 *   narrower than the control you clicked is not reachable.
 */
export type PanelWidthMode = 'fit-content' | 'match-trigger' | 'at-least-trigger';
export const panelTransition = `opacity ${panelAnimationDuration}ms ease-out, transform ${panelAnimationDuration}ms ease-out, top ${panelGrowDuration}ms ease-out, max-height ${panelGrowDuration}ms ease-out, height ${panelGrowDuration}ms ease-out`;

// ── Options ───────────────────────────────────────────────────

export interface UseFloatingPanelOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Called just before the panel opens (e.g. to reset consumer-owned refs). */
  onBeforeOpen?: () => void;
  /** Consumer's reposition function — called on page scroll / resize. */
  repositionRef?: RefObject<(() => void) | null>;
  /**
   * When provided, page-scroll is also blocked when the user scrolls
   * past the boundary of this element (useful when the scroll area is
   * a child of the floating element, e.g. Combobox list area).
   */
  scrollBoundaryRef?: RefObject<HTMLElement | null>;
  /** Override default middleware ([offset, size]). Pass [] to disable. */
  middleware?: Middleware[];
  /** Enable floating-ui autoUpdate (default true). */
  useAutoUpdate?: boolean;
  /**
   * Boolean ref set to true on inside-panel wheel events.
   * The scroll-lock handler (document-level capture) flips this and
   * calls repositionRef, so consumers don't need a separate wheel listener.
   */
  wheelGrowRef?: RefObject<boolean>;
  /**
   * How the panel's width relates to its trigger.
   * Default `"at-least-trigger"`.
   */
  widthMode?: PanelWidthMode;
  /**
   * @deprecated Pass `widthMode` instead. `fitContent` is the two-valued
   * spelling of the same idea and cannot express `"match-trigger"`.
   * `true` → `"fit-content"`, `false`/undefined → `"at-least-trigger"`.
   * An explicit `widthMode` always wins.
   */
  fitContent?: boolean;
  /**
   * The panel's content sits one density step below the page, as
   * the calendar does. Its padding, and so its CONTAINER-CAP radius, resolve
   * at the compact space step.
   */
  compact?: boolean;
  /**
   * The panel opens at a point, not from the trigger's box (ContextMenu). It
   * shares no corner with the trigger, so its radius stays the CONTAINER-CAP
   * value instead of dropping to the trigger's drawn arc.
   */
  freeOverlay?: boolean;
}

/** One place that resolves the deprecated boolean onto the three modes, so
 *  the hook and the component cannot disagree about what a consumer meant. */
export function resolvePanelWidthMode(
  widthMode: PanelWidthMode | undefined,
  fitContent: boolean | undefined,
): PanelWidthMode {
  if (widthMode) {
    return widthMode;
  }
  return fitContent ? 'fit-content' : 'at-least-trigger';
}

// ── Return type ───────────────────────────────────────────────

export interface UseFloatingPanelReturn {
  context: ReturnType<typeof useFloating>['context'];
  refs: ReturnType<typeof useFloating>['refs'];
  x: number;
  y: number;
  strategy: ReturnType<typeof useFloating>['strategy'];
  update: () => void;

  mounted: boolean;
  visible: boolean;
  placement: Placement;
  arrowUp: boolean;
  arrowDown: boolean;

  triggerRef: RefObject<HTMLElement | null>;
  arrowScrollDirRef: RefObject<'up' | 'down' | null>;
  floatingStyleRef: RefObject<Record<string, any>>;
  initializingRef: RefObject<boolean>;

  computePlacement: () => void;
  updateArrows: (element: HTMLElement) => void;
  setReferenceRef: (node: HTMLElement | null) => void;
  setMounted: Dispatch<SetStateAction<boolean>>;

  /**
   * Panel corner radius: CONTAINER-CAP on the panel's own padding,
   * lowered to the trigger's measured drawn radius once open when that arc
   * is smaller, so the panel never rounds past the control it hangs from.
   */
  dropdownRadius: string | number;
  hasBorder: boolean;
  knobProps: ReturnType<typeof useResolvedKnobs>['knobProps'];
}

// ── Hook ──────────────────────────────────────────────────────

/** A box paints a corner if it draws a radius, a border or a background. */
function paintsACorner(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  if (Number.parseFloat(cs.borderTopLeftRadius) > 0) {
    return true;
  }
  if (Number.parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') {
    return true;
  }
  const bg = cs.backgroundColor;
  return !!bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
}

/**
 * The element the panel ANCHORS to is not always the element that PAINTS.
 * `FloatingPanelWeb` hands `setReferenceRef` to a layout-only
 * `<View>` wrapping the caller's `trigger` slot — it carries cursor and
 * opacity and draws nothing — so reading its computed radius returns 0px and
 * `min(0, h/2, w/2)` pins the panel to a square corner at EVERY stop, not
 * just at `full`. Select and Combobox escape it only because they spread the
 * reference onto `InputParts.Box`, which is the painted control itself.
 *
 * Positioning still measures the wrapper (that is the cover contract's box —
 * a ColorPicker read from its swatch would measure the swatch's inset).
 * Only the ARC descends: to the outermost box that shares the anchor's own
 * top-left corner and actually paints one. Nothing painted → null, so the
 * caller falls back to the clamped token rather than to zero.
 */
function paintedCornerBox(root: HTMLElement): HTMLElement | null {
  if (paintsACorner(root)) {
    return root;
  }
  const rootRect = root.getBoundingClientRect();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    if (Math.abs(rect.left - rootRect.left) > 1 || Math.abs(rect.top - rootRect.top) > 1) {
      continue;
    }
    if (paintsACorner(el)) {
      return el;
    }
  }
  return null;
}

/**
 * OVERLAY_ANCHOR_GAP rule — radius equality: a panel that aligns to (or
 * covers) its trigger must draw the SAME corner arc as the trigger at the
 * shared corner region. Token equality is not enough — CSS shrinks
 * over-large radii to fit the box, so a `full` ($12 → 50px) trigger draws
 * ~22px arcs on a 44px-high field while a token-styled panel would draw its
 * own, different arc. Measure the trigger's effective (drawn) radius
 * instead and hand that px value to the panel.
 *
 * Exported for `useFloatingPanel.test.tsx`: the arc is measured, not
 * declared, so the only way to lock it is to feed it real boxes.
 */
export function measureDrawnRadius(el: HTMLElement): number | null {
  const box = paintedCornerBox(el);
  if (!box) {
    return null;
  }
  const raw = parseFloat(getComputedStyle(box).borderTopLeftRadius);
  if (!Number.isFinite(raw)) {
    return null;
  }
  const rect = box.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return Math.min(raw, rect.height / 2, rect.width / 2);
}

export function useFloatingPanel({
  open,
  onOpenChange,
  disabled,
  onBeforeOpen,
  repositionRef,
  scrollBoundaryRef,
  middleware: middlewareProp,
  useAutoUpdate: useAutoUpdateProp = true,
  wheelGrowRef,
  widthMode: widthModeProp,
  fitContent,
  compact,
  freeOverlay = false,
}: UseFloatingPanelOptions): UseFloatingPanelReturn {
  const widthMode = resolvePanelWidthMode(widthModeProp, fitContent);
  const { knobProps } = useResolvedKnobs({ compact });
  const hasBorder = knobProps.borderRadius.borderWidth > 0;
  // Floating panels are filed under CONTAINER-CAP, so the class value is
  // the ceiling. Below it the panel keeps the trigger's drawn arc (see
  // measureDrawnRadius) once measured on open.
  const [measuredRadius, setMeasuredRadius] = useState<number | null>(null);
  const radiusStop = radiusStopFromToken(knobProps.borderRadius.borderRadius);
  const panelPadPx = getTokenValue(knobProps.panelPadding.padding as Parameters<typeof getTokenValue>[0], 'space');
  const radiusCap =
    radiusStop && typeof panelPadPx === 'number'
      ? resolveRadiusClass('CONTAINER-CAP', radiusStop, { paddingPx: panelPadPx })
      : undefined;
  const dropdownRadius =
    radiusCap === undefined
      ? (measuredRadius ?? clampDropdownRadius(knobProps.borderRadius.borderRadius))
      : Math.min(measuredRadius ?? radiusCap, radiusCap);

  // ── State ─────────────────────────────────────────────────

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [arrowUp, setArrowUp] = useState(false);
  const [arrowDown, setArrowDown] = useState(false);
  const [placement, setPlacement] = useState<Placement>('bottom-start');

  // ── Stable refs for callbacks (avoids cascading recreations) ──

  const onBeforeOpenRef = useRef(onBeforeOpen);
  onBeforeOpenRef.current = onBeforeOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // ── Refs ──────────────────────────────────────────────────

  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const arrowScrollDirRef = useRef<'up' | 'down' | null>(null);
  const floatingStyleRef = useRef<Record<string, any>>({});
  const initializingRef = useRef(false);
  const needsSetupRef = useRef(true);

  // ── Placement ─────────────────────────────────────────────

  const computePlacement = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') {
      return;
    }
    const rect = el.getBoundingClientRect();
    setPlacement(rect.top > window.innerHeight - rect.bottom ? 'top-start' : 'bottom-start');
  }, []);

  // ── Arrow state ───────────────────────────────────────────

  const updateArrows = useCallback((element: HTMLElement) => {
    const up = element.scrollTop > scrollArrowThreshold;
    const down = element.scrollTop < element.scrollHeight - element.clientHeight - scrollArrowThreshold;
    setArrowUp((prev) => (prev !== up ? up : prev));
    setArrowDown((prev) => (prev !== down ? down : prev));
  }, []);

  // ── Open / close setup ────────────────────────────────────

  const setupForOpen = useCallback(() => {
    computePlacement();
    if (canUseDom && triggerRef.current) {
      setMeasuredRadius(freeOverlay ? null : measureDrawnRadius(triggerRef.current));
    }
    onBeforeOpenRef.current?.();
    if (closingTimerRef.current) {
      clearTimeout(closingTimerRef.current);
    }
    floatingStyleRef.current = {};
    initializingRef.current = true;
    setMounted(true);
  }, [computePlacement, freeOverlay]);

  // ── Lifecycle effect ──────────────────────────────────────

  useEffect(() => {
    if (open) {
      if (needsSetupRef.current) {
        setupForOpen();
      }
      needsSetupRef.current = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setVisible(true);
        }),
      );
    } else {
      setVisible(false);
      setArrowUp(false);
      setArrowDown(false);
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
      }
      closingTimerRef.current = setTimeout(() => {
        setMounted(false);
      }, panelAnimationDuration);
    }
  }, [open, setupForOpen]);

  useEffect(
    () => () => {
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
      }
    },
    [],
  );

  // ── Floating UI setup ─────────────────────────────────────

  const defaultMiddleware: Middleware[] = [
    // Cover ruling: the family ATTACHES to its trigger. Zero.
    offset({ mainAxis: OVERLAY_ATTACH_GAP }),
    // Horizontal collision handling: panels anchored near the right viewport
    // edge (e.g. a ColorPicker in the last table column) shift back into view
    // instead of clipping. Vertical placement is handled by computePlacement.
    shift({ padding: panelViewportPadding }),
    ...(widthMode === 'fit-content'
      ? []
      : [
          size({
            apply({
              rects: {
                reference: { width },
              },
              elements,
            }) {
              // Width modes. `at-least-trigger` writes only min-width,
              // so content may still grow the panel wider; `match-trigger`
              // pins all three so the panel is the trigger's width EXACTLY,
              // for content narrower AND wider than it.
              //
              // Any oversize on an anchored listbox breaks the flush
              // start-alignment (a wider panel near the viewport edge gets
              // shift()ed off the trigger's x) and lets trigger decorations
              // peek around the panel as ghosted edges.
              const style: Record<string, number> =
                widthMode === 'match-trigger' ? { minWidth: width, width, maxWidth: width } : { minWidth: width };
              Object.assign(floatingStyleRef.current, style);
              elements.floating.style.minWidth = `${width}px`;
              if (widthMode === 'match-trigger') {
                elements.floating.style.width = `${width}px`;
                elements.floating.style.maxWidth = `${width}px`;
              }
            },
            padding: panelViewportPadding,
          }),
        ]),
  ];

  const { x, y, strategy, context, refs, update } = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      if (disabled && nextOpen) {
        return;
      }
      if (nextOpen) {
        needsSetupRef.current = false;
        setupForOpen();
        const el = refs.floating.current;
        if (el) {
          el.scrollTop = 0;
        }
      }
      onOpenChangeRef.current(nextOpen);
    },
    strategy: 'fixed',
    placement,
    whileElementsMounted: useAutoUpdateProp ? autoUpdate : undefined,
    middleware: middlewareProp ?? defaultMiddleware,
  });

  // ── Ref setup ─────────────────────────────────────────────

  const setReferenceRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
      refs.setReference(node);
    },
    [refs],
  );

  // ── Page scroll lock ──────────────────────────────────────

  useLayoutEffect(() => {
    if (!open || !mounted || !canUseDom) {
      return;
    }
    const scrollY = window.scrollY;
    const floatingEl = refs.floating.current;
    if (!floatingEl) {
      return;
    }

    const preventScroll = (e: WheelEvent) => {
      if (floatingEl.contains(e.target as Node)) {
        if (wheelGrowRef && Math.abs(e.deltaY) > 0) {
          wheelGrowRef.current = true;
          repositionRef?.current?.();
        }
        // Use scrollBoundaryRef if provided (nested scroll), else use floating element.
        // When content is short (no scroll), both boundaries are "hit" so we always prevent.
        const scrollEl = scrollBoundaryRef?.current ?? floatingEl;
        const atTop = scrollEl.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = scrollEl.scrollTop >= scrollEl.scrollHeight - scrollEl.clientHeight - 1 && e.deltaY > 0;
        if (atTop || atBottom) {
          e.preventDefault();
        }
        return;
      }
      // A nested panel is portaled outside this one; its own lock decides.
      if (containsAcrossPanels(floatingEl, e.target)) {
        return;
      }
      e.preventDefault();
    };
    const preventKeyScroll = (e: KeyboardEvent) => {
      if (containsAcrossPanels(floatingEl, e.target)) {
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Space', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const preventTouchScroll = (e: TouchEvent) => {
      if (containsAcrossPanels(floatingEl, e.target)) {
        return;
      }
      e.preventDefault();
    };

    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });

    document.addEventListener('wheel', preventScroll, { passive: false, capture: true });
    document.addEventListener('keydown', preventKeyScroll, { capture: true });
    document.addEventListener('touchmove', preventTouchScroll, { passive: false, capture: true });
    return () => {
      document.removeEventListener('wheel', preventScroll, { capture: true });
      document.removeEventListener('keydown', preventKeyScroll, { capture: true });
      document.removeEventListener('touchmove', preventTouchScroll, { capture: true });
    };
  }, [open, mounted, refs, scrollBoundaryRef, wheelGrowRef, repositionRef]);

  // ── Close on offscreen + reposition on scroll / resize ────

  useEffect(() => {
    if (!open || !canUseDom) {
      return;
    }
    let rafId = 0;
    const throttled = () => {
      if (rafId) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const trig = triggerRef.current;
        if (trig) {
          const rect = trig.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) {
            onOpenChangeRef.current(false);
            return;
          }
        }
        repositionRef?.current?.();
      });
    };
    window.addEventListener('scroll', throttled, { passive: true });
    window.addEventListener('resize', throttled, { passive: true });
    return () => {
      window.removeEventListener('scroll', throttled);
      window.removeEventListener('resize', throttled);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [open, repositionRef]);

  // ── Resize sync ───────────────────────────────────────────

  useLayoutEffect(() => {
    if (!canUseDom) {
      return;
    }
    window.addEventListener('resize', update);
    if (open) {
      update();
    }
    return () => {
      window.removeEventListener('resize', update);
    };
  }, [update, open]);

  return {
    context,
    refs,
    x: roundToDevicePixel(x),
    y: roundToDevicePixel(y),
    strategy,
    update,
    mounted,
    visible,
    placement,
    arrowUp,
    arrowDown,
    triggerRef,
    arrowScrollDirRef,
    floatingStyleRef,
    initializingRef,
    computePlacement,
    updateArrows,
    setReferenceRef,
    setMounted,
    dropdownRadius,
    hasBorder,
    knobProps,
  };
}
