/**
 * Web-guarded platform hooks for the form view. Every DOM access is behind
 * a `typeof window/document` guard so native (Hermes) and GNOME (GJS, no
 * DOM) builds never touch browser globals. External links ride the
 * platform-split openUrl (web window.open / native Linking / GNOME Gio).
 */

import { openUrl } from '@repo/platform';
import { useEffect, useRef } from 'react';

import { useBackofficeConfig } from '../config/BackofficeProvider';
import type { BackofficeNavigationBlocker } from '../config/BackofficeProvider';

/** Cmd/Ctrl+S → save (web only; native uses the toolbar button). */
export function useSaveShortcut(enabled: boolean, onSave: () => void): void {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [enabled]);
}

/**
 * Ctrl/Cmd+↑ / Ctrl/Cmd+↓ → previous / next document (web only — desk's
 * form pager shortcuts). Enabled only while the pager has list context, so
 * the browser's default scroll behavior survives everywhere else.
 */
export function useDocPagerShortcuts(enabled: boolean, onPrev: () => void, onNext: () => void): void {
  const handlersRef = useRef({ onPrev, onNext });
  handlersRef.current = { onPrev, onNext };

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        handlersRef.current.onPrev();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handlersRef.current.onNext();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [enabled]);
}

const NOOP_BLOCKER: BackofficeNavigationBlocker = {
  blocked: false,
  proceed: () => {},
  reset: () => {},
};

function useNoopNavigationBlocker(): BackofficeNavigationBlocker {
  return NOOP_BLOCKER;
}

/**
 * Router-level dirty guard for navigations that bypass the screen's
 * `navigate()` wrapper: browser back/forward on web (history pop) and the
 * native back gesture/button. The actual blocker is host-injected through
 * `BackofficeProvider integrations.useNavigationBlocker` (the one-adapter
 * ships `useOneNavigationBlocker`); without one, only the in-app
 * navigate() guard applies. The injected hook must be referentially stable
 * for the provider's lifetime (rules of hooks).
 */
export function useNavigationDirtyGuard(isDirty: boolean): BackofficeNavigationBlocker {
  const { integrations } = useBackofficeConfig();
  const useNavigationBlocker = integrations?.useNavigationBlocker ?? useNoopNavigationBlocker;
  return useNavigationBlocker(isDirty);
}

/** beforeunload dirty guard (web only). */
export function useBeforeUnloadGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome requires returnValue to be set for the native prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);
}

/**
 * Open a URL externally: new browser tab on web, system browser via
 * Linking on iOS/Android, desktop handler on GNOME (platform openUrl
 * twins). NOTE: bench URLs (printview) open unauthenticated off-web —
 * the system browser has no app session.
 */
export function openInNewTab(url: string): boolean {
  openUrl(url, '_blank');
  return true;
}

/** External-URL capability — platform openUrl has a twin on every target. */
export function canOpenNewTab(): boolean {
  return true;
}

/**
 * Ctrl/Cmd+J → Jump to field (web only — desk's form shortcut). Disabled
 * while the jump dialog is already open so the search field can type "j".
 */
export function useJumpToFieldShortcut(enabled: boolean, onJump: () => void): void {
  const jumpRef = useRef(onJump);
  jumpRef.current = onJump;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== 'j') {
        return;
      }
      event.preventDefault();
      jumpRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [enabled]);
}
