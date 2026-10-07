/** Shared backoffice types — contracts between the backoffice surfaces. */

/** Result of resolving a URL slug to a navigable target. */
export type SlugTarget =
  | { status: 'loading' }
  | { status: 'resolved'; kind: 'workspace'; workspace: string }
  | { status: 'resolved'; kind: 'doctype'; doctype: string }
  | { status: 'not-found'; slug: string };

/** A frappe filter tuple: [fieldname, operator, value]. */
export type FrappeFilter = [string, string, unknown];

/** Filters exchanged between the list surface components. */
export type FrappeFilters = FrappeFilter[];
