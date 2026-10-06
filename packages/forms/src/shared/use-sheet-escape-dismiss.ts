import { useEffect, useRef } from 'react';
import { isWeb } from 'tamagui';

/**
 * Dismiss a modal Sheet on Escape (web only).
 *
 * Tamagui's Sheet has no key handling of its own — Dialog dismisses via
 * Dismissable, Sheet does not — so keyboard users cannot close sheet-mode
 * popups and the exit slide is unreachable from the keyboard
 * (dismissal intent). Bubble-phase listener: inner popups (menus,
 * comboboxes) that own Escape call stopPropagation()/preventDefault() and
 * keep the sheet open.
 */
export const useSheetEscapeDismiss = (enabled: boolean, onDismiss: () => void) => {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  useEffect(() => {
    const target = isWeb && enabled ? window : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      onDismissRef.current();
    };
    target?.addEventListener('keydown', onKeyDown);
    return () => {
      target?.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
};
