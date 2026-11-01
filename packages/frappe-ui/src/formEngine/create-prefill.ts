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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- prefill values are DocType-defined; keys and types are only known from runtime meta
type PrefillValues = Record<string, unknown>;

const prefills = new Map<string, PrefillValues>();

export const setCreatePrefill = (doctype: string, values: PrefillValues): void => {
  prefills.set(doctype, values);
};

export const takeCreatePrefill = (doctype: string): PrefillValues | undefined => {
  const values = prefills.get(doctype);
  if (values) {
    prefills.delete(doctype);
  }
  return values;
};
