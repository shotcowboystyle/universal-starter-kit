/**
 * Error helpers shared by the live-wired list components (FrappeTable,
 * FrappeList, FrappeListView, FrappeTreeView).
 *
 * The frappe client throws `FrappeError` (with `status`) from REST paths and
 * PermissionError-shaped errors from the live change-feed endpoints
 * (`live.live.api.list_since` / `backfill`). These helpers normalize both
 * into an `Error` whose message honestly distinguishes "you can't see this"
 * from "the load failed".
 */

/**
 * True when the error is an auth/permission rejection: a 403 or 401, a
 * PermissionError `exc_type`, or a PermissionError-shaped message.
 */
export function isPermissionError(error: unknown): boolean {
  const shaped = error as { status?: number; exc_type?: unknown } | undefined;
  if (shaped?.status === 403 || shaped?.status === 401) {
    return true;
  }
  if (shaped?.exc_type === 'PermissionError') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /permission|not permitted|forbidden/i.test(message);
}

/** True when `detail` is a developer-mode python traceback, not a sentence. */
function isTracebackDetail(detail: string): boolean {
  return /Traceback \(most recent call last\)/i.test(detail);
}

/**
 * The server's own sentence for a refusal, for a permission state's
 * description: undefined when there is none or it is a python traceback.
 */
export function refusalReason(error: unknown): string | undefined {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return detail && !isTracebackDetail(detail) ? detail : undefined;
}

/**
 * Normalizes an initial-sync failure into an Error with an honest,
 * user-facing message. `permissionMessage` / `genericMessage` come from the
 * caller so components keep i18n ownership.
 *
 * A leaked `exc` traceback (the sentence `HttpClient` used to prefer) is
 * dropped rather than appended — report / list chrome must never render a
 * python stack at the user. A readable server sentence is kept as detail.
 */
export function toLiveLoadError(
  error: unknown,
  { permissionMessage, genericMessage }: { permissionMessage: string; genericMessage: string },
): Error {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  const lead = isPermissionError(error) ? permissionMessage : genericMessage;
  const usable = detail && detail !== lead && !isTracebackDetail(detail) ? detail : '';
  const message = usable ? `${lead}: ${usable}` : lead;
  const normalized = new Error(message);
  if (error instanceof Error && error.stack) {
    normalized.stack = error.stack;
  }
  return normalized;
}
