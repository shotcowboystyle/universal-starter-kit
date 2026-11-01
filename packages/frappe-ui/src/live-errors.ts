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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- inspects a caught error, which is untyped by nature
export const isPermissionError = (error: unknown): boolean => {
  // SAFETY: both fields are optional and only read through optional chaining, so a primitive or nullish error reads as undefined
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const candidate = error as { status?: number; exc_type?: unknown } | undefined;
  if (candidate?.status === 403 || candidate?.status === 401) {
    return true;
  }
  if (candidate?.exc_type === 'PermissionError') {
    return true;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- a non-Error throw is stringified best-effort for message matching
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /permission|not permitted|forbidden/iu.test(message);
};

/** True when `detail` is a developer-mode python traceback, not a sentence. */
const isTracebackDetail = (detail: string): boolean => /Traceback \(most recent call last\)/iu.test(detail);

/**
 * The server's own sentence for a refusal, for a permission state's
 * description: undefined when there is none or it is a python traceback.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- reads a caught error, which is untyped by nature
export const refusalReason = (error: unknown): string | undefined => {
  // oxlint-disable-next-line typescript/no-base-to-string -- a non-Error throw is stringified best-effort as the reason
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return detail && !isTracebackDetail(detail) ? detail : undefined;
};

/**
 * Normalizes an initial-sync failure into an Error with an honest,
 * user-facing message. `permissionMessage` / `genericMessage` come from the
 * caller so components keep i18n ownership.
 *
 * A leaked `exc` traceback (the sentence `HttpClient` used to prefer) is
 * dropped rather than appended — report / list chrome must never render a
 * python stack at the user. A readable server sentence is kept as detail.
 */
export const toLiveLoadError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- normalizes a caught error, which is untyped by nature
  error: unknown,
  { permissionMessage, genericMessage }: { permissionMessage: string; genericMessage: string },
): Error => {
  // oxlint-disable-next-line typescript/no-base-to-string -- a non-Error throw is stringified best-effort as detail
  const detail = error instanceof Error ? error.message : String(error ?? '');
  const lead = isPermissionError(error) ? permissionMessage : genericMessage;
  const usable = detail && detail !== lead && !isTracebackDetail(detail) ? detail : '';
  const message = usable ? `${lead}: ${usable}` : lead;
  const normalized = new Error(message);
  if (error instanceof Error && error.stack !== undefined && error.stack !== '') {
    normalized.stack = error.stack;
  }
  return normalized;
};
