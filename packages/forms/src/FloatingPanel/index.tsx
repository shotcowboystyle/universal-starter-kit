import { useClick, useDismiss, useInteractions } from '@floating-ui/react';
import {
  OVERLAY_ANCHOR_GAP,
  OVERLAY_ATTACH_GAP,
  OVERLAY_BREAKPOINT,
  useResolvedKnobs,
  wasKeyboardFocus,
  ensureKeyboardModalityTracking,
} from '@repo/theme';
import type { ReactNode, RefObject, UIEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isWeb, Sheet, View, YStack } from 'tamagui';

import { ScrollArrow } from '../shared/floatingList';
import { useReturnFocusOnClose, useSheetModalFocus } from '../shared/focusManagement';
import { useSheetEscapeDismiss } from '../shared/useSheetEscapeDismiss';
import { zIndex } from '../shared/zIndex';

import { isNestedPanelAction, type PanelActionEvent } from './nestedAction';
import { PanelPortal } from './PanelPortal';
import {
  contextMenuPoint,
  pointOpensUp,
  pointPanelLeft,
  referenceCornerPoint,
  type ContextMenuEventLike,
  type PanelPoint,
} from './pointAnchor';
import { useFloatingPanel, panelTransition, panelViewportPadding } from './useFloatingPanel';
import type { PanelWidthMode } from './useFloatingPanel';

type PointerOpenEvent = PanelActionEvent & { button?: number; target?: unknown };

export { floatingPanelActionProps, isNestedPanelAction } from './nestedAction';

// Re-export hook for Select / Combobox / external consumers
export {
  useFloatingPanel,
  panelAnimationDuration,
  panelGrowDuration,
  panelTransition,
  panelViewportPadding,
  panelAnchorOffset,
  resolvePanelWidthMode,
} from './useFloatingPanel';
export type { PanelWidthMode, UseFloatingPanelOptions, UseFloatingPanelReturn } from './useFloatingPanel';

// ── Types ─────────────────────────────────────────────────────

export interface FloatingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Native only: the modal is presented and its inputs can receive focus. */
  onNativeShow?: () => void;
  /** Suppress delayed trigger focus when a consumer handles close focus itself. Web only. */
  skipReturnFocusRef?: RefObject<boolean>;
  trigger: ReactNode;
  /**
   * Optional control rendered beside the trigger but OUTSIDE the native press
   * capture (e.g. DatePicker/ColorPicker clear). On native the trigger subtree
   * uses pointerEvents="none" so XGroup cannot steal the open gesture; anything
   * that must keep its own onPress belongs here.
   */
  triggerEnd?: ReactNode;
  children: ReactNode;
  /**
   * Wrap children in Sheet.ScrollView / RN ScrollView. For list overflow
   * (Select / Combobox option lists), not gesture editors (ColorPicker,
   * DatePicker, TimePicker, DatetimePicker, maps, signature). Gesture
   * surfaces must not sit in a scrollport: a hue, date-wheel, map,
   * or signature drag otherwise scrolls the sheet instead of driving the
   * control. If a picker is taller than the sheet it overflows — acceptable;
   * overflow/scroll is for non-interactive lists.
   */
  scrollable?: boolean;
  disabled?: boolean;
  /**
   * Force Sheet mode (slide-up panel) even on desktop.
   * When undefined: Sheet on native and below `$sm` (viewport < 640,
   * OVERLAY_BREAKPOINT), floating panel from `$sm` up.
   */
  sheet?: boolean;
  /**
   * Sizing mode for the web floating panel.
   * - `"grow"` (default): opens from the trigger to the nearest viewport
   *    edge, then grows as the user scrolls.
   * - `"fill"`: opens at the maximum available viewport size immediately.
   *    If content is smaller it shrinks to fit (same as "grow" visually).
   */
  sizing?: 'grow' | 'fill';
  /**
   * How the panel's width relates to the trigger it opened from.
   * `"fit-content"` ignores the trigger, `"match-trigger"` is the trigger's
   * width exactly, `"at-least-trigger"` (default) is max(trigger, content).
   * A panel narrower than the control you clicked is not reachable, so
   * anything opened from a field-shaped trigger takes the floor.
   */
  widthMode?: PanelWidthMode;
  /**
   * @deprecated Pass `widthMode` instead — the boolean cannot express
   * `"match-trigger"`. `true` → `"fit-content"`, `false`/undefined →
   * `"at-least-trigger"`. An explicit `widthMode` always wins.
   */
  fitContent?: boolean;
  /**
   * Content padding for both sheet and web floating panel.
   * Use "none" for self-contained widgets (ColorPicker, DatePicker, TimePicker)
   * that handle their own internal spacing.
   */
  contentPadding?: 'none' | 'default';
  /**
   * The content sits one density step below the page, as the
   * calendar does. The web panel's radius caps at that step's padding
   * (CONTAINER-CAP), since a `contentPadding="none"` widget pads itself there.
   */
  compact?: boolean;
  /**
   * Tamagui transition token for sheet/overlay animations.
   */
  transition?: string;
  /**
   * Fixed header rendered above the scrollable content (e.g. search bar in Combobox).
   * Only applies in sheet mode.
   */
  header?: ReactNode;
  /**
   * Native sheet mode: open the sheet at its full height (85% of the window)
   * with the scroll area filling it, instead of content-driven height.
   * For search-driven panels whose result list streams in as the user types
   * (Awesomebar, Link fields) a content-fit sheet opens as a sliver showing
   * only the search input. Web small-viewport sheets get the tall treatment
   * from `scrollable` (percent snap points) instead.
   */
  sheetFill?: boolean;
  /**
   * Props passed to Sheet.ScrollView when scrollable. Use for onScroll (e.g. infinite load).
   */
  scrollViewProps?: Record<string, unknown>;
  /**
   * Native-only (iOS/Android): explicit VoiceOver/TalkBack name, value, and
   * hint for the sheet trigger Pressable. On native the trigger subtree is
   * pointerEvents="none", so its aria wiring never reaches the screen reader —
   * the strings must live on the Pressable itself. Web ignores this.
   */
  triggerA11y?: { label?: string; value?: string; hint?: string };
  /**
   * Stretch keeps the whole field pressable by default. Content lets an
   * adornment trigger hug its content inside a composite field.
   */
  triggerSizing?: 'stretch' | 'content';
  /**
   * How the trigger opens the panel. `"press"` (default) is click/tap.
   * `"contextmenu"` is the ContextMenu gesture: web `contextmenu` (right-click
   * / Shift+F10), native long-press. Primary click does not open. Same overlay
   * stack — not a second positioning engine. The floating panel opens AT the
   * gesture's point as a free overlay (`OVERLAY_ANCHOR_GAP` from it, flipping
   * at the viewport edges); a keyboard open has no point and opens from the
   * trigger's bottom start corner.
   */
  openOn?: 'press' | 'contextmenu';
}

/** Inner stops a keyboard-open should land on. House Button is a
 *  `div[role=button][tabindex=0]`, so `[tabindex]` covers it. */
const PANEL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The panel/sheet frame is not a control. Auto-focus on open must
 *  not paint a ring on the chrome; the first inner control rings only when
 *  the open was keyboard-origin. */
const panelChromeFocus = {
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
} as const;

function useKeyboardFocusIntoPanel(
  open: boolean,
  frameRef: { current: HTMLElement | null },
  keyboardOpenRef?: { current: boolean },
) {
  useEffect(() => {
    if (!open || !isWeb) {
      return;
    }
    const focusFirst = () => {
      const frame = frameRef.current;
      if (!frame) {
        return;
      }
      if (!wasKeyboardFocus() && !keyboardOpenRef?.current) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLElement && frame.contains(active) && active !== frame) {
        return;
      }
      const first = frame.querySelector<HTMLElement>(PANEL_FOCUSABLE);
      if (!first || first === frame) {
        return;
      }
      first.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
    };
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(focusFirst);
    });
    const timeout = setTimeout(focusFirst, 0);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(timeout);
    };
  }, [open, frameRef, keyboardOpenRef]);
}

/**
 * Viewport origin of the box a `position: fixed` panel is laid out against.
 * The top/left math is in viewport coordinates, which is only right while that
 * box is the viewport. An ancestor with a transform, filter, perspective,
 * paint containment or container query becomes the containing block instead.
 * PanelPortal lifts the panel out of scroll views, but a panel hosted in a
 * transformed dialog still lays out against that dialog. A `display: contents`
 * node has no box, so its computed `contain` (Tamagui's theme span) is ignored.
 */
function fixedContainingBlockOrigin(element: HTMLElement): { top: number; left: number } {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.display === 'contents') {
      continue;
    }
    const set = (value: string | undefined, initial: string) => !!value && value !== initial;
    const captures =
      set(cs.transform, 'none') ||
      set(cs.perspective, 'none') ||
      set(cs.filter, 'none') ||
      set(cs.backdropFilter, 'none') ||
      set(cs.containerType, 'normal') ||
      /transform|perspective|filter/.test(cs.willChange) ||
      /paint|layout|strict|content/.test(cs.contain);
    if (captures) {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top + node.clientTop - node.scrollTop,
        left: rect.left + node.clientLeft - node.scrollLeft,
      };
    }
  }
  return { top: 0, left: 0 };
}

function isRtl(): boolean {
  return isWeb && typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';
}

function panelTransformOrigin(placement: string): string {
  const rtl = isRtl();
  const atStart = !placement.endsWith('end');
  const originX = atStart === !rtl ? 'left' : 'right';
  const originY = placement.startsWith('top') ? 'bottom' : 'top';
  return `${originY} ${originX}`;
}

// ── FloatingPanel ─────────────────────────────────────────────

// Canonical float↔sheet pivot (theme `layoutBreakpoints.medium` = Tamagui
// v5 `$sm` 640). Same pivot as DataTable's
// card↔grid switch, so one viewport never mixes idioms.
const overlayFloatBreakpoint = OVERLAY_BREAKPOINT;

/**
 * Viewport-based float↔sheet check that updates on resize (useMedia may not
 * re-render on resize). Name kept for API compatibility; "gtSm" reads as
 * "wide enough to float" (≥ OVERLAY_BREAKPOINT), not the dead v4 media key.
 */
function subscribeViewport(listener: () => void) {
  if (!isWeb || typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener('resize', listener);
  return () => {
    window.removeEventListener('resize', listener);
  };
}

function viewportSnapshot() {
  return isWeb && typeof window !== 'undefined' && window.innerWidth > overlayFloatBreakpoint;
}

const serverViewportSnapshot = () => false;

export function useViewportGtSm() {
  return useSyncExternalStore(subscribeViewport, viewportSnapshot, serverViewportSnapshot);
}

export function FloatingPanel(props: FloatingPanelProps) {
  // Install modality tracking during render so the Enter that opens
  // the panel is already classified as keyboard-origin when focus moves in.
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const viewportGtSm = useViewportGtSm();
  // SSR and the hydration render use the same sheet structure. The viewport
  // snapshot switches to floating after hydration when the browser is wide.
  const shouldUseSheet = props.sheet ?? (!isWeb || !viewportGtSm);

  if (shouldUseSheet) {
    return <FloatingPanelSheet {...props} />;
  }
  return <FloatingPanelWeb {...props} />;
}

// ── Sheet (mobile / native / forced) ──────────────────────────

/**
 * A closed tamagui Sheet keeps its children mounted and parks the frame
 * below the viewport, so state inside survives a reopen. Parked, the frame
 * must leave the accessibility tree and the Tab order.
 */
function useParkedFrameInert(open: boolean, frameRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const frame = frameRef.current;
    if (!frame || typeof frame.setAttribute !== 'function') {
      return;
    }
    if (open) {
      frame.removeAttribute('inert');
      frame.removeAttribute('aria-hidden');
    } else {
      frame.setAttribute('inert', '');
      frame.setAttribute('aria-hidden', 'true');
    }
  }, [open, frameRef]);
}

function FloatingPanelSheet({
  open,
  onOpenChange,
  skipReturnFocusRef,
  trigger,
  triggerEnd,
  triggerSizing = 'stretch',
  children,
  scrollable,
  disabled,
  contentPadding = 'default',
  transition: transitionProp,
  header,
  scrollViewProps,
  openOn = 'press',
}: FloatingPanelProps) {
  const { knobProps } = useResolvedKnobs();
  // Honor animation=none (undefined) — do not hardcode "medium".
  const transition = transitionProp ?? knobProps.transition;
  const [position, setPosition] = useState(0);

  const handleOpenChange = (next: boolean) => {
    if (disabled) {
      return;
    }
    // Every open starts at the top snap point — not wherever the previous
    // drag left the sheet (a stale low snap reintroduces the sliver-open).
    if (next) {
      setPosition(0);
    }
    onOpenChange(next);
  };
  // Tamagui Sheet has no key handling (unlike the web floating mode, which
  // dismisses on Escape) — wire the dismissal intent here too.
  useSheetEscapeDismiss(open, () => {
    handleOpenChange(false);
  });
  // Sheet has no focus scope — move focus into the
  // frame on open, trap Tab while open, return focus to the trigger on close.
  const sheetFrameRef = useRef<HTMLElement | null>(null);
  useParkedFrameInert(open, sheetFrameRef);
  useSheetModalFocus(open, sheetFrameRef, skipReturnFocusRef);
  useKeyboardFocusIntoPanel(open, sheetFrameRef);

  const framePadding = contentPadding === 'none' ? '$0' : knobProps.panelPadding.padding;
  const frameGap = contentPadding === 'none' ? undefined : knobProps.gapLg.gap;

  // `trigger` is a SLOT: this wrapper is what opens the sheet, so the press has
  // to travel from the slot's content out to here. Tamagui's press wrapper
  // calls `e.stopPropagation()` on any component carrying its own
  // `onPress`/`onClick` (`@tamagui/web` `createComponent`, the `onPress`
  // branch), so a PRESSABLE trigger — a Button — swallowed the click and the
  // sheet never opened, by pointer OR by keyboard. Capture runs before any
  // descendant handler, and also catches the click Button synthesizes for
  // Enter/Space. Web-only: capture is a DOM concept, and the native
  // half owns the gesture outright (index.native.tsx puts the trigger subtree
  // behind `pointerEvents="none"` so nothing in it can claim the responder).
  //
  // Both openers below are `true`, never `!open`. React installs its capture
  // and bubble root listeners separately, so a discrete click flushes the
  // capture update BEFORE the bubble handler reads `open`, and a toggle there
  // shut the sheet it had just opened. Nothing is lost: the sheet is modal, so
  // its overlay covers the trigger and the toggle could only ever have run
  // with `open === false`.
  const openFromTrigger = (event?: PanelActionEvent) => {
    if (event && isNestedPanelAction(event)) {
      return;
    }
    handleOpenChange(true);
  };
  const isContextMenu = openOn === 'contextmenu';
  const triggerActivation = isWeb
    ? isContextMenu
      ? ({
          onContextMenu: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            openFromTrigger();
          },
        } as Record<string, unknown>)
      : ({ onClickCapture: openFromTrigger } as Record<string, unknown>)
    : undefined;

  return (
    <>
      <View flexDirection="row" alignItems="center" width={triggerSizing === 'content' ? 'auto' : '100%'}>
        <View
          flex={triggerSizing === 'content' ? undefined : 1}
          minWidth={0}
          {...(isContextMenu ? undefined : { onPress: openFromTrigger })}
          cursor={disabled ? 'not-allowed' : 'pointer'}
          opacity={disabled ? 0.5 : 1}
          {...triggerActivation}>
          {trigger}
        </View>
        {triggerEnd}
      </View>
      <Sheet
        modal
        open={open}
        onOpenChange={handleOpenChange}
        snapPoints={scrollable ? [92, 50, 25] : undefined}
        snapPointsMode={scrollable ? 'percent' : 'fit'}
        dismissOnSnapToBottom
        position={position}
        onPositionChange={setPosition}
        zIndex={zIndex.sheet}
        transition={transition}>
        <Sheet.Overlay
          transition={transition}
          backgroundColor="$shadow6"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle />
        <Sheet.Frame
          // Sheet.Frame forwards its ref at runtime; the styled prop type
          // just omits `ref`, hence the cast. tabIndex -1 makes the frame a
          // programmatic focus target without joining the tab order.
          {...({ ref: sheetFrameRef, tabIndex: -1 } as Record<string, unknown>)}
          {...knobProps.elevatedSurface}
          borderBottomLeftRadius={0}
          borderBottomRightRadius={0}
          {...panelChromeFocus}
          padding={framePadding}
          gap={frameGap}>
          {header}
          {scrollable ? (
            <Sheet.ScrollView flex={header ? 1 : undefined} {...scrollViewProps}>
              {children}
            </Sheet.ScrollView>
          ) : (
            children
          )}
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

// ── Web floating panel (desktop) ──────────────────────────────

function FloatingPanelWeb({
  open,
  onOpenChange,
  skipReturnFocusRef,
  trigger,
  children,
  disabled,
  sizing = 'grow',
  widthMode,
  fitContent,
  compact,
  contentPadding = 'default',
  openOn = 'press',
}: FloatingPanelProps) {
  const isFill = sizing === 'fill';
  const isContextMenu = openOn === 'contextmenu';
  const overlayStyleRef = useRef<{ top: number; left?: number; maxHeight: number } | null>(null);
  const pinnedTopRef = useRef(0);
  const pinnedHeightRef = useRef(0);
  const grownRef = useRef(false);
  const growUpOnlyRef = useRef(false);
  const growDownOnlyRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const keyboardOpenRef = useRef(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const anchorPointRef = useRef<PanelPoint | null>(null);
  const pointPlacementRef = useRef<{ dropup: boolean; alignEnd: boolean } | null>(null);

  const repositionFnRef = useRef<(() => void) | null>(null);

  const resetPosition = () => {
    overlayStyleRef.current = null;
    pinnedTopRef.current = 0;
    pinnedHeightRef.current = 0;
    grownRef.current = false;
    growUpOnlyRef.current = false;
    growDownOnlyRef.current = false;
    lastScrollTopRef.current = 0;
    pointPlacementRef.current = null;
  };

  const panel = useFloatingPanel({
    open,
    onOpenChange,
    disabled,
    repositionRef: repositionFnRef,
    wheelGrowRef: isFill ? undefined : grownRef,
    widthMode: widthMode ?? (isContextMenu && fitContent === undefined ? 'fit-content' : undefined),
    fitContent,
    compact,
    freeOverlay: isContextMenu,
    onBeforeOpen: resetPosition,
  });

  // Floating-ui useDismiss has no focus manager — when
  // Escape (or outside click on empty space) closes the panel while focus is
  // inside it, focus falls to <body>. Return it to the pre-open element
  // (the trigger's focusable). Deliberate focus moves elsewhere are kept.
  useReturnFocusOnClose(open, skipReturnFocusRef);
  useKeyboardFocusIntoPanel(open && panel.mounted, panel.refs.floating, keyboardOpenRef);
  useEffect(() => {
    if (open) {
      return;
    }
    keyboardOpenRef.current = false;
    anchorPointRef.current = null;
  }, [open]);

  const repositionOverlay = useCallback(() => {
    const dropdownElement = panel.refs.floating.current;
    const trig = panel.triggerRef.current;
    if (!dropdownElement || !trig) {
      return;
    }

    const isInitial = panel.initializingRef.current;
    if (isInitial) {
      dropdownElement.style.transition = 'none';
    }

    if (pinnedTopRef.current === 0 && pinnedHeightRef.current === 0) {
      dropdownElement.scrollTop = 0;
    }

    const point = isContextMenu ? (anchorPointRef.current ?? referenceCornerPoint(trig, isRtl())) : null;
    const triggerBounds = point ? { top: point.y, bottom: point.y } : trig.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const cs = getComputedStyle(dropdownElement);
    const borderTopWidth = parseFloat(cs.borderTopWidth) || 0;
    const borderBottomWidth = parseFloat(cs.borderBottomWidth) || 0;
    const totalBorderWidth = borderTopWidth + borderBottomWidth;
    const scrollContentHeight = dropdownElement.scrollHeight;
    const totalContentHeight = scrollContentHeight + totalBorderWidth;
    const liveTransition = panel.knobProps.transition ? panelTransition : 'none';
    const containingBlock = fixedContainingBlockOrigin(dropdownElement);

    let isDropup = panel.placement.startsWith('top');
    let cssLeft: number | undefined;
    if (point) {
      const bounds = {
        top: panelViewportPadding,
        left: panelViewportPadding,
        right: (document.documentElement.clientWidth || window.innerWidth) - panelViewportPadding,
        bottom: viewportHeight - panelViewportPadding,
      };
      // Measured at the viewport's left edge: a fixed box near the right edge
      // shrinks to the room left of it, and that is not the menu's width.
      // offsetWidth, not the client rect: the opening frame is scaled 0.96.
      dropdownElement.style.left = `${-containingBlock.left}px`;
      const width = dropdownElement.offsetWidth;
      const { left, alignEnd } = pointPanelLeft(point, width, bounds, isRtl());
      cssLeft = left - containingBlock.left;
      dropdownElement.style.left = `${cssLeft}px`;
      pointPlacementRef.current = {
        dropup:
          pointPlacementRef.current?.dropup ?? pointOpensUp(point, totalContentHeight, bounds, OVERLAY_ANCHOR_GAP),
        alignEnd,
      };
      isDropup = pointPlacementRef.current.dropup;
    }
    // Cover ruling: the panel ATTACHES to the trigger it was opened
    // from. `OVERLAY_ATTACH_GAP` is 0, so the panel's top edge coincides with
    // the trigger's bottom edge (and its bottom with the trigger's top when
    // dropping up) instead of floating 4px clear of it. A context menu opened
    // at a point is a FREE overlay and keeps `OVERLAY_ANCHOR_GAP` from it.
    const gap = point ? OVERLAY_ANCHOR_GAP : OVERLAY_ATTACH_GAP;
    const belowTop = triggerBounds.bottom + gap;
    const aboveBottom = triggerBounds.top - gap;

    if (isFill) {
      const available = isDropup
        ? aboveBottom - panelViewportPadding
        : viewportHeight - belowTop - panelViewportPadding;
      let height = Math.min(totalContentHeight, Math.max(0, available));
      height = Math.max(Math.min(120, Math.max(0, available)), height);
      const top = isDropup ? aboveBottom - height : belowTop;
      const cssTop = top - containingBlock.top;

      const cached = overlayStyleRef.current;
      if (!cached || cached.top !== cssTop || cached.left !== cssLeft || cached.maxHeight !== height) {
        dropdownElement.style.top = `${cssTop}px`;
        dropdownElement.style.maxHeight = `${height}px`;
        dropdownElement.style.height = '';
        overlayStyleRef.current = { top: cssTop, left: cssLeft, maxHeight: height };
        void dropdownElement.offsetHeight;
      }

      panel.initializingRef.current = false;
      void dropdownElement.offsetHeight;
      if (isInitial) {
        dropdownElement.style.transition = liveTransition;
      }
      requestAnimationFrame(() => {
        if (dropdownElement) {
          panel.updateArrows(dropdownElement);
          requestAnimationFrame(() => {
            if (dropdownElement) {
              panel.updateArrows(dropdownElement);
            }
          });
        }
      });
      return;
    }

    const idealTop = isDropup ? aboveBottom - totalContentHeight : belowTop;
    const idealBottom = idealTop + totalContentHeight;
    const pinnedTop = Math.max(panelViewportPadding, idealTop);
    const pinnedBottom = Math.min(viewportHeight - panelViewportPadding, idealBottom);
    const pinnedHeight = Math.max(120, pinnedBottom - pinnedTop);

    if (pinnedTopRef.current === 0 && pinnedHeightRef.current === 0) {
      pinnedTopRef.current = pinnedTop;
      pinnedHeightRef.current = pinnedHeight;
    }

    let top = pinnedTopRef.current;
    let height = pinnedHeightRef.current;

    if (grownRef.current) {
      const canDown = Math.max(0, viewportHeight - panelViewportPadding - (top + height));
      height += canDown;
      const canUp = Math.max(0, top - panelViewportPadding);
      top -= canUp;
      height += canUp;
    }

    if (growUpOnlyRef.current) {
      const canUp = Math.max(0, top - panelViewportPadding);
      top -= canUp;
      height += canUp;
    }
    if (growDownOnlyRef.current) {
      const canDown = Math.max(0, viewportHeight - panelViewportPadding - (top + height));
      height += canDown;
    }

    height = Math.min(height, viewportHeight - top - panelViewportPadding);
    height = Math.min(height, totalContentHeight);
    height = Math.max(120, height);

    // When grown but content is shorter than viewport: anchor dropdown to bottom (gap above), dropup to top (gap below)
    const availableViewport = viewportHeight - 2 * panelViewportPadding;
    if ((grownRef.current || growUpOnlyRef.current || growDownOnlyRef.current) && height < availableViewport) {
      if (isDropup) {
        top = panelViewportPadding;
      } else {
        top = viewportHeight - panelViewportPadding - height;
      }
    }

    const cssTop = top - containingBlock.top;
    const cached = overlayStyleRef.current;
    if (!cached || cached.top !== cssTop || cached.left !== cssLeft || cached.maxHeight !== height) {
      dropdownElement.style.top = `${cssTop}px`;
      dropdownElement.style.maxHeight = `${height}px`;
      dropdownElement.style.height = '';
      overlayStyleRef.current = { top: cssTop, left: cssLeft, maxHeight: height };
      void dropdownElement.offsetHeight;
    }

    panel.initializingRef.current = false;
    void dropdownElement.offsetHeight;
    if (isInitial) {
      dropdownElement.style.transition = liveTransition;
    }
    requestAnimationFrame(() => {
      if (dropdownElement) {
        panel.updateArrows(dropdownElement);
        requestAnimationFrame(() => {
          if (dropdownElement) {
            panel.updateArrows(dropdownElement);
          }
        });
      }
    });
  }, [
    isFill,
    isContextMenu,
    panel.placement,
    panel.refs,
    panel.triggerRef,
    panel.updateArrows,
    panel.knobProps.transition,
  ]);

  repositionFnRef.current = repositionOverlay;

  const click = useClick(panel.context, {
    event: 'mousedown',
    enabled: !isContextMenu,
  });
  const dismiss = useDismiss(panel.context, {
    // Use 'click' instead of default 'pointerdown' so scrolling to the bottom
    // (e.g. via wheel/trackpad or scroll arrow hover) doesn't trigger outside-press.
    outsidePressEvent: 'click',
    // Disable ancestor scroll dismissal - we handle scroll locking ourselves
    // and don't want internal scroll at boundaries to close the panel.
    ancestorScroll: false,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  useLayoutEffect(() => {
    if (!open || !panel.mounted) {
      return;
    }
    repositionOverlay();
  }, [open, panel.mounted, repositionOverlay, panel.y]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!open || !panel.mounted || !isFill || !content || typeof ResizeObserver === 'undefined') {
      return;
    }
    // Matching the trigger width can rewrap content after the panel's first
    // height measurement. Observe the content, not the clamped viewport, so a
    // later open or result change uses its actual height without a resize loop.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        repositionOverlay();
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [open, panel.mounted, isFill, repositionOverlay]);

  const handleScroll = useCallback(
    (event: UIEvent) => {
      const el = event.target as HTMLElement;
      panel.updateArrows(el);
      if (isFill) {
        return;
      }
      if (panel.initializingRef.current) {
        lastScrollTopRef.current = el.scrollTop;
        return;
      }
      const arrowDir = panel.arrowScrollDirRef.current;
      if (arrowDir) {
        panel.arrowScrollDirRef.current = null;
        lastScrollTopRef.current = el.scrollTop;
        if (arrowDir === 'down') {
          growUpOnlyRef.current = true;
        } else {
          growDownOnlyRef.current = true;
        }
        repositionFnRef.current?.();
        return;
      }
      const delta = el.scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = el.scrollTop;
      if (delta !== 0) {
        grownRef.current = true;
        repositionFnRef.current?.();
      }
    },
    [isFill, panel.updateArrows],
  );

  // animation=none → no CSS tween (same contract as knobProps.transition === undefined)
  const webTransition = panel.knobProps.transition ? panelTransition : 'none';

  // `elevatedSurface` carries a web-only `style: { boxShadow }`.
  // Two `style` props on one element do NOT merge — the later
  // spread replaces the earlier — so spreading the complete fragment after the
  // positioning style silently dropped `position: fixed`, `top`, `left`,
  // `zIndex` and `overflow`, and every web FloatingPanel rendered in normal
  // flow, pushing the page down instead of floating over it. Measured on
  // origin/main 048289071: DatePicker's panel sat at trigger.bottom + 5.39 (the
  // field container's flex gap), not the contract's 0.
  // The complete fragment still goes on the element (AGENTS.md) — its style is
  // folded into the positioning style rather than competing with it.
  const { style: elevatedSurfaceStyle, ...elevatedSurfaceProps } = panel.knobProps.elevatedSurface;

  // Same slot problem as the sheet branch, but only half of it lands here. The
  // POINTER path survives, because `useClick(..., { event: "mousedown" })`
  // listens on mousedown and Tamagui only stops the click. The KEYBOARD path
  // did not: activation arrives as the click Button synthesizes for Enter/Space,
  // which is swallowed at the Button, while floating-ui's own keydown
  // handler stands down on a button target expecting exactly that click.
  //
  // Gated to SYNTHESIZED clicks. A real pointer click must keep falling through
  // to floating-ui's mousedown toggle, or pressing an open panel's trigger
  // would re-open what the mousedown just closed. `detail` is the
  // discriminator, measured rather than assumed: a pointer click carries the click
  // count, `element.click()` and native keyboard activation carry 0.
  const openFromSynthesizedClick = useCallback(
    (event: { detail: number } & PanelActionEvent) => {
      if (disabled || isContextMenu || event.detail !== 0 || isNestedPanelAction(event)) {
        return;
      }
      // detail 0 is keyboard/programmatic activation. Count it as
      // keyboard-origin so the first inner control rings.
      keyboardOpenRef.current = true;
      onOpenChange(true);
    },
    [disabled, isContextMenu, onOpenChange],
  );

  const openFromContextMenu = (
    event: ContextMenuEventLike & {
      preventDefault: () => void;
      nativeEvent?: ContextMenuEventLike;
    },
  ) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    anchorPointRef.current = contextMenuPoint(event.nativeEvent ?? event, panel.triggerRef.current, isRtl());
    if (!open) {
      onOpenChange(true);
      return;
    }
    resetPosition();
    panel.initializingRef.current = true;
    repositionOverlay();
  };

  // useClick's mousedown opener calls preventDefault, so a pointer open never
  // focuses the trigger the way a pressed button is focused. The render that
  // opens the panel then captures whatever held focus before, often <body> or
  // another trigger, and Escape returns there. Focus the pressed
  // control first so the capture is the trigger, as for a keyboard open.
  const focusTriggerOnPointerOpen = (event: PointerOpenEvent) => {
    if (open || disabled || isContextMenu || event.button !== 0 || !isWeb) {
      return;
    }
    const reference = panel.triggerRef.current;
    if (!reference) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const pressed = target?.closest<HTMLElement>(PANEL_FOCUSABLE);
    const focusable =
      pressed && reference.contains(pressed) ? pressed : reference.querySelector<HTMLElement>(PANEL_FOCUSABLE);
    focusable?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  };

  const referenceProps = getReferenceProps({
    ref: panel.setReferenceRef,
    onClickCapture: openFromSynthesizedClick,
    ...(isContextMenu ? { onContextMenu: openFromContextMenu } : {}),
  });
  // Guard the composed floating-ui openers, after hook handlers are merged.
  // Declining leaves each action's own events and focus defaults intact.
  for (const name of ['onMouseDown', 'onClick', 'onKeyDown', 'onKeyUp'] as const) {
    const handler = referenceProps[name];
    if (typeof handler === 'function') {
      referenceProps[name] = (event: PanelActionEvent) => {
        if (isNestedPanelAction(event)) {
          return;
        }
        if (name === 'onMouseDown') {
          focusTriggerOnPointerOpen(event as PointerOpenEvent);
        }
        handler(event);
      };
    }
  }

  return (
    <>
      <View
        {...referenceProps}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        // The cover contract is stated as a relation between the panel's top
        // edge and THIS element's bottom edge — the box floating-ui anchors
        // to, which is the whole trigger, not whatever glyph inside it was
        // clicked. Marking it keeps the measurement unambiguous (a ColorPicker
        // read from its swatch measures the swatch's inset, not the gap).
        // Same idiom TreeSelect already uses for `data-fp-panel`.
        data-fp-reference="">
        {trigger}
      </View>

      {panel.mounted && (
        <PanelPortal anchor={panel.triggerRef.current}>
          <YStack
            {...getFloatingProps({
              ref: panel.refs.setFloating,
              style: {
                ...elevatedSurfaceStyle,
                position: panel.strategy,
                top: overlayStyleRef.current?.top ?? panel.y ?? 0,
                left: overlayStyleRef.current?.left ?? panel.x ?? 0,
                scrollbarWidth: 'none' as any,
                zIndex: zIndex.dropdown,
                overflow: 'auto',
                ...panel.floatingStyleRef.current,
                ...(overlayStyleRef.current ? { maxHeight: overlayStyleRef.current.maxHeight } : {}),
                opacity: panel.visible ? 1 : 0,
                // `none`, not scale(1): any transform makes this panel the
                // containing block of a nested panel's `position: fixed`, which
                // then positions against this box and is clipped by its scroll.
                transform: panel.visible ? 'none' : 'scale(0.96)',
                transition: webTransition,
                transformOrigin: panelTransformOrigin(
                  pointPlacementRef.current
                    ? `${pointPlacementRef.current.dropup ? 'top' : 'bottom'}-${pointPlacementRef.current.alignEnd ? 'end' : 'start'}`
                    : panel.placement,
                ),
              },
              onScroll: handleScroll,
              onTransitionEnd: (event) => {
                if (
                  event.target === event.currentTarget &&
                  (event.propertyName === 'height' || event.propertyName === 'max-height')
                ) {
                  panel.updateArrows(event.currentTarget);
                }
              },
            })}
            data-testid="floating-panel-viewport"
            data-fp-panel=""
            {...panelChromeFocus}
            pointerEvents={panel.visible ? 'auto' : 'none'}
            {...elevatedSurfaceProps}
            // Complete elevatedSurface fragment above is the ONLY surface source
            // (SF-OVERLAY "including border and elevation", Round 2 docket).
            // The one layered exception is anatomy, not surface: the dropdown
            // radius clamp (same shape as Card's containerRadius over
            // elevatedSurface) keeps list rows unclipped at large radius knobs.
            borderRadius={panel.dropdownRadius}
            paddingVertical={0}>
            <ScrollArrow
              direction="up"
              scrollRef={panel.refs.floating}
              visible={panel.arrowUp}
              arrowScrollDirRef={panel.arrowScrollDirRef}
            />
            <View
              ref={contentRef as any}
              {...(contentPadding !== 'none' ? panel.knobProps.panelPadding : undefined)}
              {...(contentPadding !== 'none' ? panel.knobProps.gapLg : undefined)}>
              {children}
            </View>
            <ScrollArrow
              direction="down"
              scrollRef={panel.refs.floating}
              visible={panel.arrowDown}
              arrowScrollDirRef={panel.arrowScrollDirRef}
            />
          </YStack>
        </PanelPortal>
      )}
    </>
  );
}
