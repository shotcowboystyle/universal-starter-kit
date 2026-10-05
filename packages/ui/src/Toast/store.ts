/**
 * Module-level toast store.
 *
 * Lives outside React so `useToast()` works from anywhere (no extra provider
 * to mount — the @tamagui/toast ToastProvider machinery is self-contained
 * inside <ToastViewport />). Subscribers are notified on every mutation via
 * useSyncExternalStore-compatible subscribe/getSnapshot.
 *
 * ## Expiry policy (house defaults, resolved at show time)
 *
 * | intent            | default duration      | dismiss affordance          |
 * |-------------------|-----------------------|-----------------------------|
 * | accent / success  | 5s (TOAST_DEFAULT_MS) | optional (default shown)    |
 * | warning           | 8s (TOAST_WARNING_MS) | optional (default shown)    |
 * | error             | 12s (TOAST_ERROR_MS)  | FORCED — always shown       |
 * | any + action      | ≥10s (ACTION_MIN)     | per intent                  |
 * | sticky            | never auto-expires    | FORCED — always shown       |
 *
 * Errors persist longer than success but still auto-expire at the ceiling —
 * a toast is transient feedback, not a status surface (page-scoped errors
 * belong on the notify() banner route). `sticky: true` is the explicit
 * caller opt-out, and a sticky or error toast can never ship without its
 * close affordance: an unremovable overlay card would sit over live UI
 * forever (the iOS drawer-blocking defect this policy retires).
 */

export type ToastIntent = 'accent' | 'success' | 'warning' | 'error';

/** House auto-dismiss for accent/success toasts (one-liner confirmations). */
export const TOAST_DEFAULT_MS = 5_000;
/** Warnings hold a little longer than confirmations. */
export const TOAST_WARNING_MS = 8_000;
/** Error ceiling: persists longer, but still expires unless `sticky`. */
export const TOAST_ERROR_MS = 12_000;
/** Minimum auto-dismiss when a toast carries an action (Polaris). */
export const TOAST_ACTION_MIN_MS = 10_000;

export interface ToastActionOptions {
  /** Button label, e.g. "Undo" */
  label: string;
  /** Called when the action button is pressed (the toast then dismisses) */
  onPress: () => void;
  /**
   * Screen-reader alternative describing how to perform the action without
   * the button (Radix altText). Defaults to the label.
   */
  altText?: string;
}

export interface ToastShowOptions {
  /** Short headline. Required — a toast with no title has nothing to announce. */
  title: string;
  /** Optional supporting copy */
  description?: string;
  /** Semantic intent — colors the accent bar + icon. Default "accent". */
  intent?: ToastIntent;
  /**
   * Auto-dismiss after this many ms. Omit for the house per-intent default
   * (5s accent/success, 8s warning, 12s error). `0` or `Infinity` are the
   * legacy persistent escape and resolve to `sticky`.
   */
  duration?: number;
  /**
   * Keep the toast until explicitly dismissed. Forces the dismiss (X)
   * affordance — a sticky toast without one would be unremovable.
   */
  sticky?: boolean;
  /** Optional action button (e.g. Undo) */
  action?: ToastActionOptions;
  /**
   * Show the close (X) button. Default true. Ignored (forced true, DEV warn)
   * for error and sticky toasts — those must stay dismissable by hand.
   */
  dismissible?: boolean;
  /** Stable id — re-showing the same id replaces the existing toast */
  id?: string;
}

export interface ToastEntry extends Omit<ToastShowOptions, 'duration' | 'sticky'> {
  id: string;
  intent: ToastIntent;
  dismissible: boolean;
  /** Resolved auto-dismiss in ms; `0` = persistent (sticky). */
  duration: number;
  /** Never auto-expires (explicit opt-in or legacy duration 0/Infinity). */
  sticky: boolean;
  /** false while the exit animation plays, then the entry is removed */
  open: boolean;
}

/** How long closed entries linger so the exit animation can play. */
export const TOAST_EXIT_MS = 320;

let entries: ToastEntry[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function getToasts(): ToastEntry[] {
  return entries;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function intentDefaultDuration(intent: ToastIntent): number {
  if (intent === 'error') {
    return TOAST_ERROR_MS;
  }
  if (intent === 'warning') {
    return TOAST_WARNING_MS;
  }
  return TOAST_DEFAULT_MS;
}

/**
 * Resolve the expiry + dismissibility policy for a show() payload.
 * Exported for tests — the table above is the contract.
 */
export function resolveToastPolicy(options: ToastShowOptions): {
  duration: number;
  sticky: boolean;
  dismissible: boolean;
} {
  const intent = options.intent ?? 'accent';
  const hasAction = options.action != null;
  const sticky = options.sticky === true || options.duration === 0 || options.duration === Number.POSITIVE_INFINITY;

  let duration: number;
  if (sticky) {
    duration = 0;
  } else {
    const base = options.duration ?? intentDefaultDuration(intent);
    duration = hasAction ? Math.max(base, TOAST_ACTION_MIN_MS) : base;
  }

  // Error + sticky toasts must carry the close affordance: without expiry
  // (or with the long error ceiling) the X is the user's only way out.
  const mustStayDismissible = sticky || intent === 'error';
  let dismissible = options.dismissible ?? true;
  if (mustStayDismissible && !dismissible) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[toast] dismissible: false ignored for ${sticky ? 'sticky' : 'error'} toast ` +
          `"${options.title}" — persistent toasts must stay dismissable by hand.`,
      );
    }
    dismissible = true;
  }

  return { duration, sticky, dismissible };
}

/** Show a toast. Returns its id (usable with `dismissToast`). */
export function showToast(options: ToastShowOptions): string {
  const id = options.id ?? `mp-toast-${++counter}`;
  const pendingRemoval = removalTimers.get(id);
  if (pendingRemoval) {
    clearTimeout(pendingRemoval);
    removalTimers.delete(id);
  }
  const { duration, sticky, dismissible } = resolveToastPolicy(options);
  const entry: ToastEntry = {
    intent: 'accent',
    ...options,
    duration,
    sticky,
    dismissible,
    id,
    open: true,
  };
  entries = [...entries.filter((e) => e.id !== id), entry];
  emit();
  return id;
}

/** Dismiss one toast (plays exit animation, then removes the entry). */
export function dismissToast(id: string): void {
  const entry = entries.find((e) => e.id === id);
  if (!entry || !entry.open) {
    return;
  }
  entries = entries.map((e) => (e.id === id ? { ...e, open: false } : e));
  emit();
  removalTimers.set(
    id,
    setTimeout(() => {
      removalTimers.delete(id);
      entries = entries.filter((e) => e.id !== id);
      emit();
    }, TOAST_EXIT_MS),
  );
}

/** Dismiss every visible toast. */
export function dismissAllToasts(): void {
  // Snapshot first — dismissToast reassigns `entries` while we iterate.
  const snapshot = entries;
  for (const entry of snapshot) {
    if (entry.open) {
      dismissToast(entry.id);
    }
  }
}

/** Hard-reset the store (tests / story decorators). */
export function resetToasts(): void {
  for (const timer of removalTimers.values()) {
    clearTimeout(timer);
  }
  removalTimers.clear();
  entries = [];
  emit();
}

// ── Viewport singleton registry ───────────────────────────────
//
// The store is module-level, so two mounted <ToastViewport /> hosts would
// each render every toast (double cards, double announcements). The first
// mounted viewport owns rendering; later mounts no-op (DEV warn) and take
// over automatically when the owner unmounts — so a screen-level viewport
// (a list screen) and a shell-level one (an app shell) can coexist.

let viewportClaimants: string[] = [];
const viewportListeners = new Set<() => void>();
let warnedDuplicateViewport = false;

function emitViewport() {
  for (const listener of viewportListeners) {
    listener();
  }
}

/** @internal Claim viewport ownership (first claimant renders). */
export function claimToastViewport(id: string): void {
  if (viewportClaimants.includes(id)) {
    return;
  }
  viewportClaimants = [...viewportClaimants, id];
  if (viewportClaimants.length > 1 && !warnedDuplicateViewport && process.env.NODE_ENV !== 'production') {
    warnedDuplicateViewport = true;
    console.warn(
      '[toast] a second ToastViewport mounted — the first mounted viewport renders ' +
        'and this one no-ops. Mount one viewport at the app shell (NotifyHost includes it).',
    );
  }
  emitViewport();
}

/** @internal Release a claim; the next claimant (if any) takes over. */
export function releaseToastViewport(id: string): void {
  if (!viewportClaimants.includes(id)) {
    return;
  }
  viewportClaimants = viewportClaimants.filter((claimant) => claimant !== id);
  emitViewport();
}

/** @internal Current owning viewport id (undefined while none mounted). */
export function getToastViewportOwner(): string | undefined {
  return viewportClaimants[0];
}

/** @internal Subscribe to ownership changes (useSyncExternalStore shape). */
export function subscribeToastViewport(listener: () => void): () => void {
  viewportListeners.add(listener);
  return () => {
    viewportListeners.delete(listener);
  };
}

/** @internal test helper */
export function __resetToastViewportRegistry(): void {
  viewportClaimants = [];
  warnedDuplicateViewport = false;
  emitViewport();
}
