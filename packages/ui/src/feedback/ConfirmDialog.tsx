/**
 * ConfirmDialog — blocking confirm / cancel overlay.
 *
 * Always `role="alertdialog"`. Modal Dialog provides the focus trap; Escape
 * cancels. Pointer-outside light-dismiss is disabled (blocking confirm).
 * `destructive` paints the confirm button with the danger (error) theme.
 *
 * Focus (Radix AlertDialog / WAI-ARIA APG / macOS NSAlert):
 * the panel is not a control — auto-focus on open never paints a ring on
 * the frame. Keyboard-origin open moves focus to the first tab stop (Cancel,
 * or a body field) with a ring. Pointer-origin open parks on the panel
 * unless the first stop is a text field (typing is next).
 *
 * Action rules: cancel never renders disabled — `cancelDisabled` is ignored
 * by design (`cancel-disabled` DEV warn). Cancel + confirm are the
 * two sanctioned actions; extra pressables in the body DEV-warn
 * `dialog-too-many-actions` unless `allowManyActions` ejects.
 */

import { Button } from '@repo/forms';
import {
  ensureKeyboardModalityTracking,
  useResolvedKnobs,
  warnCancelDisabled,
  warnDialogTooManyActions,
  wasKeyboardFocus,
} from '@repo/theme';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Dialog, Paragraph, XStack, YStack, isWeb, type TamaguiElement } from 'tamagui';

import { countActionsInTree } from '../shared/actionScan';
import { useTranslation } from '../shared/i18n';
import { useKeyboardInset } from '../shared/useKeyboardInset';
import { useReturnFocusOnClose } from '../shared/useReturnFocusOnClose';
import { DialogContent, DialogOverlay } from '../surfaces';

const TAB_STOPS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function asHtml(node: unknown): HTMLElement | null {
  return node instanceof HTMLElement ? node : null;
}

function panelNode(ref: unknown): HTMLElement | null {
  const fromRef = asHtml(ref);
  if (fromRef) {
    return fromRef;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  return document.querySelector<HTMLElement>('[data-mp-confirm-dialog]');
}

function isTextEntry(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (el.isContentEditable) {
    return true;
  }
  const role = el.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    return true;
  }
  return Boolean(el.querySelector("input, textarea, [contenteditable='true']"));
}

function firstTabStop(root: HTMLElement): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>(TAB_STOPS);
  for (const el of nodes) {
    if (el === root) {
      continue;
    }
    if (el.getAttribute('aria-hidden') === 'true') {
      continue;
    }
    if (typeof el.closest === 'function' && el.closest('[data-focus-skip]')) {
      continue;
    }
    return el;
  }
  return null;
}

function applyOpenFocus(panel: HTMLElement) {
  const keyboard = wasKeyboardFocus();
  const first = firstTabStop(panel);
  const toControl = Boolean(first && (keyboard || isTextEntry(first)));
  const target = toControl && first ? first : panel;
  target.focus({
    preventScroll: true,
    focusVisible: keyboard && toControl,
  } as FocusOptions);
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Dialog title (also labels the alertdialog). */
  title: ReactNode;
  /** Body copy. Prefer this over `children` for simple string bodies. */
  body?: ReactNode;
  /** Alternate body slot (e.g. richer content). Ignored when `body` is set. */
  children?: ReactNode;
  /** Confirm button label (default "Confirm"). */
  confirmLabel?: string;
  /** Cancel button label (default "Cancel"). */
  cancelLabel?: string;
  /** Fired when the confirm button is pressed (dialog closes after). */
  onConfirm?: () => void;
  /** Fired when cancel / Escape closes the dialog. */
  onCancel?: () => void;
  /**
   * Danger confirm — error-themed primary.
   * Use for irreversible / high-severity actions. Wins over `warning`.
   */
  destructive?: boolean;
  /** Warning-themed confirm (caution). Ignored when `destructive`. */
  warning?: boolean;
  /** Disable the confirm button (e.g. typed-confirm gate until text matches). */
  confirmDisabled?: boolean;
  /**
   * Explains why confirm is gated (e.g. the typed-confirm hint).
   * Renders as visible text under the confirm button via the Button
   * `disabledReason` affordance; without it, a gated confirm DEV-warns
   * `bare-disabled`.
   */
  confirmDisabledReason?: string;
  /**
   * IGNORED by design. The cancel action never renders disabled,
   * even while `confirmDisabled` gates the confirm button. Passing `true`
   * emits the `cancel-disabled` DEV warn and marks the cancel button with
   * `data-mp-cancel-disabled-ignored` (the button stays enabled).
   */
  cancelDisabled?: boolean;
  /**
   * Eject — acknowledges more than 2 actions rendered by the
   * dialog (extra pressables in `body` / `children`) and silences the
   * `dialog-too-many-actions` DEV warn.
   */
  allowManyActions?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  children,
  confirmLabel: confirmLabelProp,
  cancelLabel: cancelLabelProp,
  onConfirm,
  onCancel,
  destructive = false,
  warning = false,
  confirmDisabled = false,
  confirmDisabledReason,
  cancelDisabled = false,
  allowManyActions = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const confirmLabel = confirmLabelProp ?? t('Confirm');
  const keyboardInset = useKeyboardInset();
  const cancelLabel = cancelLabelProp ?? t('Cancel');
  const description = body ?? children;
  const contentRef = useRef<TamaguiElement | null>(null);
  /** Distinguishes confirm close from Escape/cancel so onCancel isn't double-fired. */
  const closeReason = useRef<'confirm' | 'cancel' | null>(null);

  ensureKeyboardModalityTracking();

  // ConfirmDialog is always opened programmatically
  // (no Dialog.Trigger), so Tamagui's focus scope cannot restore focus on
  // close — without this, Escape/cancel dropped focus on <body>.
  useReturnFocusOnClose(open);

  // Cancel is never disabled — the prop is deliberately not wired.
  useEffect(() => {
    warnCancelDisabled({ disabled: cancelDisabled, component: 'ConfirmDialog' });
  }, [cancelDisabled]);

  // Cancel + confirm are the 2 sanctioned actions; pressables
  // smuggled into the body push the count over the cap.
  useEffect(() => {
    if (!open) {
      return;
    }
    warnDialogTooManyActions({
      count: 2 + countActionsInTree(description),
      allowManyActions,
      component: 'ConfirmDialog',
    });
  }, [open, description, allowManyActions]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (closeReason.current !== 'confirm') {
        onCancel?.();
      }
      closeReason.current = null;
    }
    onOpenChange?.(next);
  };

  const handleOpenAutoFocus = useCallback((event: Event) => {
    if (!isWeb) {
      return;
    }
    event.preventDefault();
    const panel = panelNode(contentRef.current);
    if (panel) {
      applyOpenFocus(panel);
    }
  }, []);

  // Radix onOpenAutoFocus is the web path; this effect covers jsdom and the
  // frame where the portal ref is not ready in the auto-focus callback.
  useEffect(() => {
    // RN 0.83 also exposes HTMLElement, but native refs have no DOM query API.
    if (!open || !isWeb) {
      return;
    }
    let cancelled = false;
    let frames = 0;
    const run = () => {
      if (cancelled) {
        return;
      }
      const panel = panelNode(contentRef.current);
      if (!panel) {
        if (frames++ < 8) {
          requestAnimationFrame(run);
        }
        return;
      }
      applyOpenFocus(panel);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog modal open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal paddingBottom={keyboardInset || undefined}>
        <DialogOverlay key="overlay" />
        <DialogContent
          ref={contentRef}
          key="content"
          // Polaris small modal / macOS alert: fixed alert width, not shrink-wrap.
          width="90%"
          maxWidth={420}
          role="alertdialog"
          tabIndex={-1}
          // The frame is not a control. Own the no-ring contract here
          // so panel auto-focus cannot paint even if DialogContent changes.
          outlineWidth={0}
          focusStyle={{ outlineWidth: 0 }}
          focusVisibleStyle={{ outlineWidth: 0 }}
          // Test / automation hook for confirm tone (theme class names vary by runtime).
          data-tone={destructive ? 'destructive' : warning ? 'warning' : 'default'}
          data-mp-confirm-dialog=""
          data-density={knobProps.density}
          data-size={knobProps.size}
          // Blocking confirm: no light-dismiss. Escape still cancels via
          // Dialog's default escape → onOpenChange(false).
          onPointerDownOutside={(e) => {
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onOpenAutoFocus={handleOpenAutoFocus}>
          <Dialog.Title {...knobProps.label} {...knobProps.heading} color="$color12">
            {title}
          </Dialog.Title>
          {description != null ? (
            <Dialog.Description asChild>
              {typeof description === 'string' || typeof description === 'number' ? (
                <Paragraph {...knobProps.body} {...knobProps.label} color="$color12">
                  {description}
                </Paragraph>
              ) : (
                <YStack {...knobProps.gap}>{description}</YStack>
              )}
            </Dialog.Description>
          ) : null}
          <XStack {...knobProps.gap} justifyContent="flex-end" alignItems="flex-start" flexWrap="wrap">
            <Button
              chromeless
              compact
              // Never disabled; `cancelDisabled` requests are ignored.
              data-mp-cancel-disabled-ignored={cancelDisabled ? 'true' : undefined}
              onPress={() => {
                closeReason.current = 'cancel';
                handleOpenChange(false);
              }}>
              {cancelLabel}
            </Button>
            <Button
              compact
              accent={!destructive && !warning}
              error={destructive}
              warning={!destructive && warning}
              actionRole="primary"
              disabled={confirmDisabled || undefined}
              // Gated confirm explains itself (visible reason,
              // no hover) instead of dangling as a bare-disabled dead end.
              disabledReason={confirmDisabled ? confirmDisabledReason : undefined}
              aria-disabled={confirmDisabled || undefined}
              data-mp-confirm-disabled={confirmDisabled ? 'true' : undefined}
              onPress={() => {
                if (confirmDisabled) {
                  return;
                }
                closeReason.current = 'confirm';
                onConfirm?.();
                handleOpenChange(false);
              }}>
              {confirmLabel}
            </Button>
          </XStack>
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
}
