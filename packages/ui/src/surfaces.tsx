import { Preset, Surface, useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { createContext, forwardRef, useContext, useEffect } from 'react';
import {
  AlertDialog,
  Dialog,
  isWeb,
  Popover,
  Sheet,
  useDialogContext,
  View,
  type DialogContentProps as TamaguiDialogContentProps,
  type DialogOverlayProps as TamaguiDialogOverlayProps,
  type TamaguiElement,
  type ViewProps,
} from 'tamagui';
export { Card, CardFooter, CardHeader } from './Card';
export type { CardFooterProps, CardHeaderProps, CardProps, SurfaceTier } from './Card';

/**
 * Knob-aware surface wrappers.
 *
 * These apply the knob surface-tier recipes (`cardSurface`,
 * `elevatedSurface`, `featureSurface`) plus `gap` / `panelPadding` by
 * default so consumers don't need to manually spread knob props for the
 * common cases.  All applied props can be overridden via the usual
 * Tamagui prop spread.
 *
 * Every house component consumes knobs, so these carry the plain names
 * (`Card`, `Panel`, ...). They shadow the raw tamagui primitives in the
 * package export; the unthemed originals stay reachable via the
 * `tamagui` import path.
 */

// ── Nested scale ─────────────────────────────────────────────────────────
// Polaris / Primer: the deeper a surface nests, the tighter its padding
// and control chrome. Compact density steps size+space down one level.
// Never wrap `density: "comfortable"` inside a compact ancestor — that
// would step nested controls UP.

function NestedScale({ density, children }: { density: string; children: ReactNode }) {
  if (density === 'compact') {
    return children;
  }
  return <Preset overrides={{ density: 'compact' }}>{children}</Preset>;
}

// ── Overlay frame focus ──────────────────────────────────────────────────
// Radix Dialog.Content / Primer Dialog are tabIndex=-1 and auto-focused on
// open. The frame is not a control: UA :focus-visible must not ring the
// panel. Inner controls ring on keyboard-origin focus.

const overlayFrameFocus = {
  outlineWidth: 0,
  outlineStyle: 'none' as any,
};

const overlayFrameFocusStyle = {
  outlineWidth: 0,
  outlineStyle: 'none' as any,
} as const;

// ── Overlay open focus ───────────────────────────────────────────────────
// Tamagui 2.7's FocusScope decides "focus is not inside yet", waits for
// idle (up to 200 ms), then focuses the first tabbable that does not
// already hold focus: a click into a field during that wait had focus
// moved to another control, so the typing that followed went there. The
// house handler checks and focuses in one step. With no tabbable yet,
// tamagui's deferred path still runs. Dialog content sits in a native
// <dialog> whose show() puts focus inside before the check in browsers,
// so there FocusScope never calls the handler; useDialogShowFocus does
// when show() left focus on something that is not a tab stop.

function isTabbableWithin(node: HTMLElement, container: HTMLElement): boolean {
  if (node.tabIndex < 0 || node.hidden || node.tagName === 'A') {
    return false;
  }
  if ((node as HTMLInputElement).disabled) {
    return false;
  }
  if (node instanceof HTMLInputElement && node.type === 'hidden') {
    return false;
  }
  if (getComputedStyle(node).visibility === 'hidden') {
    return false;
  }
  for (let el: HTMLElement | null = node; el && el !== container; el = el.parentElement) {
    if (getComputedStyle(el).display === 'none') {
      return false;
    }
  }
  return true;
}

function focusFirstTabbableOnOpen(event: Event): void {
  const container = event.currentTarget;
  if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) {
    return;
  }
  const first = Array.from(container.querySelectorAll<HTMLElement>('*')).find((node) =>
    isTabbableWithin(node, container),
  );
  if (!first) {
    return;
  }
  event.preventDefault();
  first.focus({ preventScroll: true });
  if (first instanceof HTMLInputElement) {
    first.select();
  }
}

type OpenAutoFocus = (event: Event) => void;

/** The caller's handler runs first; its `preventDefault()` skips the house open focus. */
function withHouseOpenFocus(onOpenAutoFocus?: OpenAutoFocus): OpenAutoFocus {
  return (event) => {
    onOpenAutoFocus?.(event);
    if (!event.defaultPrevented) {
      focusFirstTabbableOnOpen(event);
    }
  };
}

const DIALOG_SHOW_FOCUS_EVENT = 'mp.dialogShowFocus';

/**
 * Chromium and WebKit's `<dialog>.show()` focuses the first focusable
 * descendant, so a tabIndex -1 frame (the house Input's group frame, a
 * tabIndex -1 panel) takes focus; Firefox and the HTML spec take the first
 * tab stop. When focus sits on something that is not a tab stop, run
 * `onOpenAutoFocus` against the content the way FocusScope would. The
 * content is found by its id because FocusScope clones it with its own ref,
 * so a ref passed to `Dialog.Content` never attaches on web. Passive effects
 * run after the portal's layout-effect `show()`. Mirror of the forms hook.
 */
function useDialogShowFocus(onOpenAutoFocus: OpenAutoFocus): void {
  const { open, contentId } = useDialogContext();
  useEffect(() => {
    if (!open || !contentId || !isWeb || typeof document === 'undefined') {
      return;
    }
    const content = document.getElementById(contentId);
    const focused = document.activeElement;
    if (!content || !(focused instanceof HTMLElement)) {
      return;
    }
    if (!content.contains(focused) || focused.tabIndex >= 0) {
      return;
    }
    content.addEventListener(DIALOG_SHOW_FOCUS_EVENT, onOpenAutoFocus, { once: true });
    content.dispatchEvent(new CustomEvent(DIALOG_SHOW_FOCUS_EVENT, { cancelable: true }));
  }, [open, contentId]);
}

/**
 * The house open focus for a raw `Dialog.Content`, which `DialogContent` and
 * `AlertDialogContent` already run: render it inside the content. When
 * `<dialog>.show()` left focus off a tab stop, the caller's `onOpenAutoFocus`
 * runs, then the first tabbable takes focus.
 */
export function DialogShowFocus({ onOpenAutoFocus }: { onOpenAutoFocus?: OpenAutoFocus }): null {
  useDialogShowFocus(withHouseOpenFocus(onOpenAutoFocus));
  return null;
}

// Card frame lives in ./Card (NestedScale only; no Tint); the parts
// live in ./CardHeader and ./CardFooter and are re-exported through ./Card.

// ── Dialog region context ───────────────────────────────────────────────

export interface DialogRegionContextValue {
  /** True inside a dialog surface — dialog action rules apply. */
  inDialogRegion: boolean;
}

/**
 * `DialogContent` and `AlertDialogContent` provide this automatically. Wrap custom dialog-like
 * surfaces (sheet-as-dialog, hand-rolled dialog chrome) so their action rows
 * inherit dialog rules such as the max-2-actions cap.
 */
export const DialogRegionContext = createContext<DialogRegionContextValue>({
  inDialogRegion: false,
});

export function useDialogRegionContext(): DialogRegionContextValue {
  return useContext(DialogRegionContext);
}

export function useIsInDialogRegion(): boolean {
  return useDialogRegionContext().inDialogRegion;
}

const IN_DIALOG_REGION: DialogRegionContextValue = { inDialogRegion: true };

// ── DialogContent ────────────────────────────────────────────────────────

const overlayEnterExit = { opacity: 0, y: -4, scale: 0.97 } as const;

export const DialogContent = forwardRef<TamaguiElement, TamaguiDialogContentProps & { children?: ReactNode }>(
  function DialogContent({ children, ...props }, ref) {
    return (
      <Surface size="md">
        <DialogContentInner ref={ref} {...props}>
          {children}
        </DialogContentInner>
      </Surface>
    );
  },
);

const DialogContentInner = forwardRef<TamaguiElement, TamaguiDialogContentProps & { children?: ReactNode }>(
  function DialogContentInner({ children, onOpenAutoFocus, ...props }, ref) {
    const { knobProps } = useResolvedKnobs({ component: 'DialogContent' });
    const openFocus = withHouseOpenFocus(onOpenAutoFocus);
    useDialogShowFocus(openFocus);
    // ThemeableStack unstyled:false defaults `elevate: true`, which paints
    // getElevation(size) — `$true` is a control stop. `elevate={false}` leaves
    // the overlay ladder in `elevatedSurface` as the only shadow.
    // Geometry (panelPadding 18, containerRadius 9, border 1px) stays on the
    // recipe fragments below.
    return (
      <Dialog.Content
        ref={ref}
        {...knobProps.elevatedSurface}
        {...knobProps.containerRadius}
        {...knobProps.panelPadding}
        {...knobProps.gap}
        elevate={false}
        transition={knobProps.transition}
        enterStyle={overlayEnterExit}
        exitStyle={overlayEnterExit}
        {...overlayFrameFocus}
        focusStyle={overlayFrameFocusStyle}
        focusVisibleStyle={overlayFrameFocusStyle}
        onOpenAutoFocus={openFocus}
        {...props}>
        <DialogRegionContext.Provider value={IN_DIALOG_REGION}>
          <NestedScale density={knobProps.density}>{children}</NestedScale>
        </DialogRegionContext.Provider>
      </Dialog.Content>
    );
  },
);

// ── DialogOverlay ────────────────────────────────────────────────────────

// A scrim only fades — sliding or scaling a full-bleed backdrop reads as a
// glitch, so this stays opacity-only rather than reusing `overlayEnterExit`.
const scrimFade = { opacity: 0 } as const;

/**
 * Knob-aware dialog scrim. Bare `Dialog.Overlay` carries no transition, so
 * the backdrop popped in and out while the content faded (enter/exit
 * styles without a resolved token are dead code on the css driver). Pairs
 * with `DialogContent`; `transition` drops to undefined at `animation=none`
 * and under `prefers-reduced-motion`, which is the instant path.
 */
export const DialogOverlay = forwardRef<TamaguiElement, TamaguiDialogOverlayProps & { children?: ReactNode }>(
  function DialogOverlay({ children, ...props }, ref) {
    const { knobProps } = useResolvedKnobs();
    return (
      <Dialog.Overlay
        ref={ref}
        backgroundColor="$shadow6"
        transition={knobProps.transition}
        enterStyle={scrimFade}
        exitStyle={scrimFade}
        {...props}>
        {children}
      </Dialog.Overlay>
    );
  },
);

// ── AlertDialogContent ───────────────────────────────────────────────────
// Tamagui's AlertDialog.Content is Dialog.Content under a different name:
// the styled frame bakes `elevate: true` (plus bg/border/radius/padding).
// `unstyled` drops that chrome so elevatedSurface is the only surface source.

export const AlertDialogContent = forwardRef<TamaguiElement, TamaguiDialogContentProps & { children?: ReactNode }>(
  function AlertDialogContent({ children, ...props }, ref) {
    return (
      <Surface size="md">
        <AlertDialogContentInner ref={ref} {...props}>
          {children}
        </AlertDialogContentInner>
      </Surface>
    );
  },
);

const AlertDialogContentInner = forwardRef<TamaguiElement, TamaguiDialogContentProps & { children?: ReactNode }>(
  function AlertDialogContentInner({ children, ...props }, ref) {
    const { knobProps } = useResolvedKnobs({ component: 'AlertDialogContent' });
    useDialogShowFocus(withHouseOpenFocus(props.onOpenAutoFocus));
    return (
      <AlertDialog.Content
        ref={ref}
        unstyled
        {...knobProps.elevatedSurface}
        {...knobProps.containerRadius}
        {...knobProps.panelPadding}
        {...knobProps.gap}
        elevate={false}
        transition={knobProps.transition}
        enterStyle={overlayEnterExit}
        exitStyle={overlayEnterExit}
        {...overlayFrameFocus}
        focusStyle={overlayFrameFocusStyle}
        focusVisibleStyle={overlayFrameFocusStyle}
        {...props}>
        <DialogRegionContext.Provider value={IN_DIALOG_REGION}>
          <NestedScale density={knobProps.density}>{children}</NestedScale>
        </DialogRegionContext.Provider>
      </AlertDialog.Content>
    );
  },
);

export const AlertDialogOverlay = forwardRef<TamaguiElement, TamaguiDialogOverlayProps & { children?: ReactNode }>(
  function AlertDialogOverlay({ children, ...props }, ref) {
    const { knobProps } = useResolvedKnobs();
    return (
      <AlertDialog.Overlay
        ref={ref}
        backgroundColor="$shadow6"
        transition={knobProps.transition}
        enterStyle={scrimFade}
        exitStyle={scrimFade}
        {...props}>
        {children}
      </AlertDialog.Overlay>
    );
  },
);

// ── PopoverContent ───────────────────────────────────────────────────────
// OVERLAY_ANCHOR_GAP rule (theme/layoutTokens): free popovers size to
// content, start-aligned to their anchor with the shared gap (the caller's
// tamagui <Popover offset={OVERLAY_ANCHOR_GAP}>), flipping/shifting at
// viewport edges. This frame is the overlay's single surface owner —
// border comes from the elevatedSurface recipe and radius from the
// containerRadius cap spread over it; children must not draw their own
// outer border.

type PopoverContentProps = ViewProps & {
  children?: ReactNode;
  /** Runs first; `preventDefault()` skips the house open focus. */
  onOpenAutoFocus?: OpenAutoFocus;
};

export const PopoverContent = forwardRef<TamaguiElement, PopoverContentProps>(function PopoverContent(
  { children, onOpenAutoFocus, ...props },
  ref,
) {
  const { knobProps } = useResolvedKnobs({ component: 'PopoverContent' });
  return (
    <Popover.Content
      ref={ref}
      {...knobProps.elevatedSurface}
      {...knobProps.containerRadius}
      transition={knobProps.transition}
      enterStyle={overlayEnterExit}
      exitStyle={overlayEnterExit}
      {...overlayFrameFocus}
      focusStyle={overlayFrameFocusStyle}
      focusVisibleStyle={overlayFrameFocusStyle}
      onOpenAutoFocus={withHouseOpenFocus(onOpenAutoFocus)}
      {...props}>
      <NestedScale density={knobProps.density}>{children}</NestedScale>
    </Popover.Content>
  );
});

// ── SheetFrame ───────────────────────────────────────────────────────────
// Overlay chrome (SF-OVERLAY / E-OVERLAY): elevatedSurface binds border +
// elevation even at `none`. The modal scrim is not a substitute. Fill is
// `$background` (scheme token — never an invented hex, and not the shared
// recipe's `$color1`) so the sheet tracks the page. Motion driver lives on
// the Frame; SheetModal also drives the Sheet root.

export const SheetFrame = forwardRef<TamaguiElement, ViewProps & { children?: ReactNode }>(function SheetFrame(
  { children, ...props },
  ref,
) {
  const { knobProps } = useResolvedKnobs({ component: 'SheetFrame' });
  const frameProps = {
    ref,
    ...knobProps.elevatedSurface,
    ...knobProps.containerRadius,
    backgroundColor: '$background',
    ...knobProps.panelPadding,
    transition: knobProps.transition,
    ...overlayFrameFocus,
    focusStyle: overlayFrameFocusStyle,
    focusVisibleStyle: overlayFrameFocusStyle,
    ...props,
  };
  return (
    <Sheet.Frame {...frameProps}>
      <NestedScale density={knobProps.density}>{children}</NestedScale>
    </Sheet.Frame>
  );
});

// ── SheetModal ───────────────────────────────────────────────────────────
// Modal bottom-sheet presentation: tamagui Sheet on web, RN Modal on native
// (raw `Sheet modal` cannot (re)present from a trigger tap on device — the
// FloatingPanel-proven workaround). Lives in ./SheetModal (platform pair).

export { SheetModal } from './SheetModal';
export type { SheetModalProps } from './SheetModal';

// ── Panel ────────────────────────────────────────────────────────────────
// Polaris Card / Primer Box: bordered elevated frame. Spec class SF-OVERLAY
// (`elevatedSurface` + cap + padding + gap). Nested chrome steps down once.

export const Panel = forwardRef<TamaguiElement, ViewProps & { children?: ReactNode }>(function Panel(
  { children, ...props },
  ref,
) {
  const { knobProps } = useResolvedKnobs({ component: 'Panel' });
  const viewProps = {
    ref,
    ...knobProps.elevatedSurface,
    ...knobProps.containerRadius,
    ...knobProps.panelPadding,
    ...knobProps.gap,
    ...props,
  };
  return (
    <View {...viewProps}>
      <NestedScale density={knobProps.density}>{children}</NestedScale>
    </View>
  );
});

// ── Deprecated Knob* aliases ─────────────────────────────────────────────
// The Knob prefix was a tautology (every house component is knob driven).
// These aliases keep old imports working; a later sweep removes them.

/** @deprecated Use `CardProps` instead. */
export type { CardProps as KnobCardProps } from './Card';
/** @deprecated Use `Card` instead. */
export { Card as KnobCard } from './Card';
/** @deprecated Use `DialogContent` instead. */
export const KnobDialogContent = DialogContent;
/** @deprecated Use `PopoverContent` instead. */
export const KnobPopoverContent = PopoverContent;
/** @deprecated Use `SheetFrame` instead. */
export const KnobSheetFrame = SheetFrame;
/** @deprecated Use `Panel` instead. */
export const KnobPanel = Panel;
