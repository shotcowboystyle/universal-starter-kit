/**
 * One-shot create-mode prefill hand-off.
 *
 * Two producers, one mechanism:
 * - Duplicate and Amend navigate to `newDocPath(doctype)` and stash the
 *   copied values here (in-memory only — a refresh honestly falls back to
 *   a blank form; no URL-size limits for large docs).
 * - NewDocRouteScreen stashes parsed `?d=` URL defaults (kanban column "+",
 *   calendar day click, connections "+") before rendering the form — those
 *   survive refresh because the URL re-stashes them.
 *
 * The create-mode form (useFormEngine seeding) consumes and clears the
 * stash on mount, merging it over meta defaults. Last stash per doctype
 * wins, so a `?d=` navigation cannot double-apply with a stale
 * Duplicate/Amend hand-off.
 */

const prefills = new Map<string, Record<string, unknown>>();

export function setCreatePrefill(doctype: string, values: Record<string, unknown>): void {
  prefills.set(doctype, values);
}

export function takeCreatePrefill(doctype: string): Record<string, unknown> | undefined {
  const values = prefills.get(doctype);
  if (values) {
    prefills.delete(doctype);
  }
  return values;
}
