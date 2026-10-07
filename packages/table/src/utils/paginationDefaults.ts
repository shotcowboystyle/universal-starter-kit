/**
 * DG-TBL-04 — pagination smart defaults.
 *
 * Default pageSize 25 with options 10/25/50/100.
 * Persistence rides the existing URL-state / saved-view patterns
 * (`syncWithUrl`, `useTableViews`) — no separate storage invented here.
 */

/** Default rows per page (DG-TBL-04). */
export const DEFAULT_PAGE_SIZE = 25;

/** Default page-size selector options (DG-TBL-04). */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Infinite mode: how many rows before the tail the next-page append triggers.
 * Prefetch already has page N+1 in cache, so this lead only hides append work.
 */
export const INFINITE_TRIGGER_ROWS = 5;

export type DefaultPageSizeOption = (typeof DEFAULT_PAGE_SIZE_OPTIONS)[number];
