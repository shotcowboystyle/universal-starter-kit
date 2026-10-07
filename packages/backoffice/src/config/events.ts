/**
 * Host event bus — `onEvent` on the provider receives every notable thing
 * the embedded backoffice does, so host apps can sync their own chrome,
 * analytics, or state.
 */

export type BackofficeEvent =
  /** Any navigation performed through the backoffice navigator. */
  | { type: 'navigate'; path: string; mode: 'push' | 'replace' | 'back' }
  /** A document form was opened. */
  | { type: 'doc-opened'; doctype: string; name: string }
  /** A document was saved (`isNew` for first inserts). */
  | { type: 'doc-saved'; doctype: string; name: string; isNew?: boolean }
  /** A document was deleted. */
  | { type: 'doc-deleted'; doctype: string; name: string }
  /** A surface caught an operational error worth surfacing to the host. */
  | { type: 'error'; error: unknown; context?: string };

export type BackofficeEventHandler = (event: BackofficeEvent) => void;
