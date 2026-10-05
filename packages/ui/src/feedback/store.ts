/**
 * Module-level store for notify() banner / inline alert / dialog surfaces.
 * Toast delivery uses the existing Toast store (`showToast`).
 */

import type { NotifyAction, NotifyScope, NotifySeverity, NotifySurface } from './route';

export interface FeedbackEntry {
  id: string;
  surface: Exclude<NotifySurface, 'toast'>;
  severity: NotifySeverity;
  scope: NotifyScope;
  region?: string;
  title?: string;
  body: string;
  action?: NotifyAction;
  dismissible: boolean;
}

let entries: FeedbackEntry[] = [];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function getFeedback(): FeedbackEntry[] {
  return entries;
}

export function subscribeFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pushFeedback(entry: Omit<FeedbackEntry, 'id'> & { id?: string }): string {
  const id = entry.id ?? `mp-feedback-${++counter}`;
  const next: FeedbackEntry = {
    ...entry,
    dismissible: entry.dismissible ?? true,
    id,
  };
  // Dialogs replace any open dialog; banners/alerts stack.
  if (next.surface === 'dialog') {
    entries = [...entries.filter((e) => e.surface !== 'dialog'), next];
  } else {
    entries = [...entries, next];
  }
  emit();
  return id;
}

export function dismissFeedback(id: string): void {
  const before = entries.length;
  entries = entries.filter((e) => e.id !== id);
  if (entries.length !== before) {
    emit();
  }
}

export function dismissFeedbackBySurface(surface: FeedbackEntry['surface']): void {
  const before = entries.length;
  entries = entries.filter((e) => e.surface !== surface);
  if (entries.length !== before) {
    emit();
  }
}

export function dismissFeedbackByRegion(region: string): void {
  const before = entries.length;
  entries = entries.filter((entry) => entry.region !== region);
  if (entries.length !== before) {
    emit();
  }
}

/** Hard-reset (tests / story decorators). */
export function resetFeedback(): void {
  entries = [];
  emit();
}
