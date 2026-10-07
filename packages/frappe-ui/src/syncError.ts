/**
 * Human message for a failed collection subscription fetch, reported through
 * `onSyncError` (the collection itself swallows these — without surfacing
 * them a live view just looks empty). 403 gets permission wording.
 */
export function describeSyncError(
  err: unknown,
  doctype: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const status = (err as { status?: number })?.status;
  if (status === 403) {
    return t('You do not have permission to view {{doctype}}', { doctype });
  }
  const message = err instanceof Error ? err.message : undefined;
  return message ?? t('Failed to load {{doctype}}', { doctype });
}
