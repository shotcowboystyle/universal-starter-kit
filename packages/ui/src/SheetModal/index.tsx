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
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { isWeb, Sheet, View } from 'tamagui';
import type { TamaguiElement } from 'tamagui';

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

const noCleanup = (): void => undefined;

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

/** `focusVisible` is not yet in lib.dom's FocusOptions. */
const focusOptions = (focusVisible: boolean): FocusOptions & { focusVisible: boolean } => ({
  preventScroll: true,
  focusVisible,
});

const restoreAfterClose = (restore: () => void) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(restore);
  });
  setTimeout(restore, 320);
};

const useSheetFrameFocus = (open: boolean, frameRef: RefObject<TamaguiElement | null>) => {
  // Captured during render (not in an effect): by the time effects run, the
  // sheet's own focus handling may already have moved focus off the opener.
  const [wasOpen, setWasOpen] = useState(false);
  const [prevFocus, setPrevFocus] = useState<HTMLElement | null>(null);
  if (isWeb && 'document' in globalThis && open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const active = document.activeElement;
      setPrevFocus(active instanceof HTMLElement ? active : null);
    }
  }

  useEffect(() => {
    if (!isWeb || !open) {
      return noCleanup;
    }
    const frame = frameRef.current;
    const restore = () => {
      if (!prevFocus?.isConnected) {
        return;
      }
      const ae = document.activeElement;
      const { current } = frameRef;
      const focusLost = !ae || ae === document.body || ae === document.documentElement;
      const dropped = focusLost || (current instanceof HTMLElement && current.contains(ae));
      if (dropped) {
        prevFocus.focus(focusOptions(wasKeyboardFocus()));
      }
    };
    if (!(frame instanceof HTMLElement)) {
      return () => {
        restoreAfterClose(restore);
      };
    }

    const focusIn = () => {
      if (frame.contains(document.activeElement)) {
        return;
      }
      const first = frame.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? frame).focus(focusOptions(false));
    };
    let innerRaf = 0;
    const raf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(focusIn);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return;
      }
      const focusables = [...frame.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      );
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      const [first, ...rest] = focusables;
      const last = rest.at(-1) ?? first;
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
      restoreAfterClose(restore);
    };
  }, [open, frameRef, prevFocus]);
};

const useSheetEscapeDismiss = (open: boolean, onDismiss: () => void) => {
  const onDismissRef = useRef(onDismiss);
  useLayoutEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!isWeb || !open) {
      return noCleanup;
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
};

export const SheetModal = ({
  open,
  onOpenChange,
  children,
  header,
  snapPoint = 60,
  scrollable,
  fill = false,
}: SheetModalProps) => {
  const { knobProps } = useResolvedKnobs();
  const { transition } = knobProps;
  const titleId = useId();
  const frameRef = useRef<TamaguiElement | null>(null);
  const hasHeader = Boolean(header);
  const fillOnly = fill ? nonShrinking : null;

  useSheetFrameFocus(open, frameRef);
  useSheetEscapeDismiss(open, () => {
    onOpenChange(false);
  });

  const scrollBody = (
    <Sheet.ScrollView
      testID="sheet-modal-scroll"
      {...(fill ? fillSlot : null)}>
      {children}
    </Sheet.ScrollView>
  );
  const plainBody = scrollable ? scrollBody : children;
  const body = fill ? (
    <View
      testID="sheet-modal-body"
      {...fillSlot}>
      {plainBody}
    </View>
  ) : (
    plainBody
  );

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
        ref={frameRef}
        tabIndex={-1}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SheetFrame is a Tamagui styled view, not a DOM tag; the dialog role has to ride its props
        role="dialog"
        aria-modal
        aria-labelledby={hasHeader ? titleId : undefined}
        {...knobProps.gap}
        borderBottomLeftRadius={0}
        borderBottomRightRadius={0}
        overflow="hidden"
        {...frameRingReset}>
        <DialogRegionContext.Provider value={IN_DIALOG_REGION}>
          {hasHeader ? (
            <View
              id={titleId}
              {...fillOnly}>
              {header}
            </View>
          ) : null}
          {body}
          <View
            style={{ height: 'env(safe-area-inset-bottom)' }}
            {...fillOnly}
          />
        </DialogRegionContext.Provider>
      </SheetFrame>
    </Sheet>
  );
};
