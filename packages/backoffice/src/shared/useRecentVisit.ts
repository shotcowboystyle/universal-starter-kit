/**
 * Write side of the shared desk recent store ("frappe-desk-recent") for
 * plain navigation. The awesomebar/command palette already writes recent
 * when it navigates, but sidebar/list navigation never did — so the
 * workspace "Continue where you left off" strip stayed empty for anyone who
 * doesn't use the palette. Screens call this on mount (and whenever the
 * visited path changes) so every doctype-list and document visit lands in
 * the same store the palette, sidebar recent, and the workspace strip read.
 *
 * Label vocabulary follows the existing writers: doctype lists use the bare
 * doctype (command-palette navigation items), documents use
 * "{doctype}: {name}" (frappe-ui DeskFormPage precedent).
 */
import { addToRecent } from '@repo/frappe-ui';
import { useEffect } from 'react';

export interface RecentVisit {
  label: string;
  path: string;
}

/**
 * Record a visit in the shared recent store. Pass `undefined` to skip
 * (create mode, fixture/story mode). Dedup/cap is owned by `addToRecent`.
 */
export function useRecentVisit(visit: RecentVisit | undefined): void {
  const label = visit?.label;
  const path = visit?.path;
  useEffect(() => {
    if (!label || !path) {
      return;
    }
    addToRecent({ label, path });
  }, [label, path]);
}
