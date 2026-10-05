/**
 * Pure severity × scope × blocking → surface router.
 *
 * Devs declare *what happened*; this picks *how it appears*. Side-effecting
 * delivery lives in `notify.ts` so unit tests can assert the table without
 * mounting hosts.
 */

import { TOAST_ACTION_MIN_MS } from '../Toast/store';

export type NotifySeverity = 'info' | 'success' | 'warning' | 'error';
export type NotifyScope = 'page' | 'section' | 'field';
export type NotifySurface = 'toast' | 'banner' | 'alert' | 'dialog';

export interface NotifyAction {
  label: string;
  onPress: () => void;
}

export interface NotifyEvent {
  severity: NotifySeverity;
  scope: NotifyScope;
  /** Target one inline region instead of broadcasting to every region of the scope. */
  region?: string;
  /** Escalate to a blocking dialog (error/warning only). Ignored for info/success. */
  blocking?: boolean;
  action?: NotifyAction;
  title?: string;
  body: string;
  /**
   * Eject: override the severity-gated dismissibility. House default: error
   * banners are NOT dismissible (they persist until the error state clears);
   * every other surface/severity is dismissible.
   */
  dismissible?: boolean;
}

/** Toast intent mapping: info rides accent (same as Alert's info→accent theme). */
export type NotifyToastIntent = 'accent' | 'success' | 'warning' | 'error';

export interface NotifyRoute {
  surface: NotifySurface;
  severity: NotifySeverity;
  scope: NotifyScope;
  region?: string;
  /** Toast intent (info → accent). Banner/alert/dialog use `severity` as Alert intent. */
  toastIntent: NotifyToastIntent;
  title?: string;
  body: string;
  action?: NotifyAction;
  /**
   * Auto-dismiss for toast surfaces. `0` = persistent.
   * Errors never auto-dismiss; action toasts stay ≥10s.
   */
  duration: number | undefined;
  dismissible: boolean;
}

function toastDuration(action?: NotifyAction): number | undefined {
  return action ? TOAST_ACTION_MIN_MS : undefined;
}

/**
 * Decide the feedback surface for a semantic event.
 *
 * Routing table:
 * | severity | scope           | blocking | surface                          |
 * |----------|-----------------|----------|----------------------------------|
 * | success  | *               | *        | toast                            |
 * | info     | page            | *        | toast                            |
 * | info     | section \| field| *        | alert (inline)                   |
 * | warning  | *               | true     | dialog                           |
 * | warning  | page            | false    | banner (sticky)                  |
 * | warning  | section \| field| false    | alert (inline)                   |
 * | error    | *               | true     | dialog                           |
 * | error    | page            | false    | banner (sticky)                  |
 * | error    | section \| field| false    | alert (inline)                   |
 *
 * Errors never route to an auto-dismissing toast.
 */
export function routeNotify(event: NotifyEvent): NotifyRoute {
  const { severity, scope, blocking = false, action, title, body } = event;
  const toastIntent: NotifyToastIntent = severity === 'info' ? 'accent' : severity;
  const base = {
    severity,
    scope,
    ...(event.region != null ? { region: event.region } : {}),
    toastIntent,
    title,
    body,
    action,
    dismissible: event.dismissible ?? true,
  } as const;

  if (blocking && (severity === 'error' || severity === 'warning')) {
    return { ...base, surface: 'dialog', duration: 0 };
  }

  if (severity === 'success') {
    return { ...base, surface: 'toast', duration: toastDuration(action) };
  }

  if (severity === 'info') {
    if (scope === 'page') {
      return { ...base, surface: 'toast', duration: toastDuration(action) };
    }
    return { ...base, surface: 'alert', duration: 0 };
  }

  // warning | error — non-blocking
  if (scope === 'page') {
    // House dismissibility gate: error banners persist until the error state
    // clears — no close (X) by default. Warning banners stay dismissible.
    return {
      ...base,
      surface: 'banner',
      duration: 0,
      dismissible: event.dismissible ?? severity !== 'error',
    };
  }
  return { ...base, surface: 'alert', duration: 0 };
}
