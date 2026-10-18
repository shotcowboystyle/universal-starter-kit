/**
 * Global backoffice keyboard shortcuts (web only).
 *
 * INTEGRATION: the shell (user-owned) should call this once near the root of
 * the desk chrome and wire `onFocusSearch` to the awesomebar, e.g.:
 *
 *   useBackofficeShortcuts({ onFocusSearch: () => focusAwesomebar() });
 *
 * Bindings (keep chrome/help-shortcuts-dialog.tsx in sync):
 *   - Mod+K / Mod+G → onFocusSearch (opens the command palette)
 *     While the palette input holds focus, the same chord is handled inside
 *     CommandPalette (editable targets are ignored here) and toggles closed.
 *
 * SSR / native / GJS safe: no-ops when there is no DOM document. Events from
 * editable targets (inputs, textareas, selects, contenteditable) are ignored
 * so typing is never hijacked. Cleans up its listener on unmount.
 */
import { useEffect, useRef } from 'react';

export interface BackofficeShortcutHandlers {
  /** Focus the awesomebar / global search (Mod+K, Mod+G). */
  onFocusSearch?: () => void;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const useBackofficeShortcuts = (handlers: BackofficeShortcutHandlers): void => {
  // Ref keeps the listener stable while consumers pass inline handler objects.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (typeof document === 'undefined' || !('addEventListener' in document)) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'k' || key === 'g') {
        const { onFocusSearch } = handlersRef.current;
        if (!onFocusSearch) {
          return;
        }
        event.preventDefault();
        onFocusSearch();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
};
