/**
 * SheetModal — modal bottom sheet (web).
 *
 * Anatomy follows Apple HIG sheets (grabber, medium detent, swipe-to-dismiss),
 * Radix Dialog (role=dialog, aria-modal, focus in/trap/return, Escape), and
 * gorhom Bottom Sheet (overlay tap, snap-to-bottom, header + scroll body).
 *
 * Native twin: ./index.native.tsx (RN Modal — tamagui Sheet cannot re-present
 * on device). Dismissal: overlay tap / snap-to-bottom / Escape.
 */

import { zIndex } from '@repo/forms';
import { useResolvedKnobs, wasKeyboardFocus } from '@repo/theme';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { isWeb, Sheet, View } from 'tamagui';

import { DialogRegionContext, SheetFrame } from '../surfaces';

export interface SheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ReactNode;
  /** Fixed content above the (scrollable) body, e.g. the sheet title. */
  header?: ReactNode;
  /** Percent snap point. Web: the Sheet's snap point. Native: a drag detent. */
  snapPoint?: number;
  /** Wrap children in the sheet's scroll container. */
  scrollable?: boolean;
  /**
   * Opt the body into the sheet's remaining height instead of sizing it to
   * its content. A consumer-owned viewport (a virtualized list, a measured
   * workspace) cannot bootstrap from an intrinsic host: it reports zero and
   * then mounts nothing. Off by default, so existing sheets are unchanged.
   */
  fill?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const IN_DIALOG_REGION = { inDialogRegion: true } as const;

/*
 * Fill: the web frame already has a definite height from the Sheet's
 * percent snap point, so fill only opens the body chain inside it. A flex
 * basis on the frame itself would replace that height, not extend it.
 */
const fillSlot = { flex: 1, minHeight: 0 } as const;
const nonShrinking = { flexShrink: 0 } as const;

/** The sheet frame is not a control. Auto-focus must not paint a ring. */
const frameRingReset = {
  outlineWidth: 0,
  outlineStyle: 'none' as const,
  focusStyle: { outlineWidth: 0, outlineStyle: 'none' as const },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: 'none' as const },
};

function useSheetFrameFocus(open: boolean, frameRef: RefObject<HTMLElement | null>) {
  const prevRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (isWeb && typeof document !== 'undefined') {
    if (open && !wasOpenRef.current) {
      prevRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = open;
  }

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined' || !open) {
      return;
    }
    const frame = frameRef.current;
    const restore = () => {
      if (typeof document === 'undefined') {
        return;
      }
      const target = prevRef.current;
      if (!target || !target.isConnected) {
        return;
      }
      const ae = document.activeElement;
      const dropped =
        !ae || ae === document.body || ae === document.documentElement || !!frameRef.current?.contains(ae);
      if (dropped) {
        target.focus({
          preventScroll: true,
          focusVisible: wasKeyboardFocus(),
        } as FocusOptions);
      }
    };
    if (!frame || typeof frame.addEventListener !== 'function') {
      return () => {
        requestAnimationFrame(() => requestAnimationFrame(restore));
        setTimeout(restore, 320);
      };
    }

    const focusIn = () => {
      if (typeof document === 'undefined') {
        return;
      }
      if (frame.contains(document.activeElement)) {
        return;
      }
      const first = frame.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? frame).focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    };
    let innerRaf = 0;
    const raf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(focusIn);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return;
      }
      const focusables = Array.from(frame.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === frame)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    frame.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(innerRaf);
      frame.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => requestAnimationFrame(restore));
      setTimeout(restore, 320);
    };
  }, [open, frameRef]);
}

function useSheetEscapeDismiss(open: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (!isWeb || !open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      onDismissRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
}

export function SheetModal({
  open,
  onOpenChange,
  children,
  header,
  snapPoint = 60,
  scrollable,
  fill = false,
}: SheetModalProps) {
  const { knobProps } = useResolvedKnobs();
  const transition = knobProps.transition;
  const titleId = useId();
  const frameRef = useRef<HTMLElement | null>(null);

  useSheetFrameFocus(open, frameRef);
  useSheetEscapeDismiss(open, () => {
    onOpenChange(false);
  });

  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      snapPointsMode="percent"
      snapPoints={[snapPoint]}
      transition={transition}
      zIndex={zIndex.sheet}>
      <Sheet.Overlay
        backgroundColor="$shadow6"
        transition={transition}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      {/* Apple grabber: 36×5 capsule, muted fill, VoiceOver resize affordance. */}
      <Sheet.Handle
        backgroundColor="$color8"
        opacity={0.45}
        height={5}
        width={36}
        borderRadius={100}
        aria-label="Resize"
      />
      <SheetFrame
        ref={frameRef as never}
        {...({
          tabIndex: -1,
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': header ? titleId : undefined,
        } as Record<string, unknown>)}
        {...knobProps.gap}
        borderBottomLeftRadius={0}
        borderBottomRightRadius={0}
        overflow="hidden"
        {...frameRingReset}>
        <DialogRegionContext.Provider value={IN_DIALOG_REGION}>
          {header ? (
            <View id={titleId} {...(fill ? nonShrinking : null)}>
              {header}
            </View>
          ) : null}
          {fill ? (
            <View testID="sheet-modal-body" {...fillSlot}>
              {scrollable ? (
                <Sheet.ScrollView testID="sheet-modal-scroll" {...fillSlot}>
                  {children}
                </Sheet.ScrollView>
              ) : (
                children
              )}
            </View>
          ) : scrollable ? (
            <Sheet.ScrollView testID="sheet-modal-scroll">{children}</Sheet.ScrollView>
          ) : (
            children
          )}
          <View style={{ height: 'env(safe-area-inset-bottom)' }} {...(fill ? nonShrinking : null)} />
        </DialogRegionContext.Provider>
      </SheetFrame>
    </Sheet>
  );
}
