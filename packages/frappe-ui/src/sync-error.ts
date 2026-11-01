/**
 * Human message for a failed collection subscription fetch, reported through
 * `onSyncError` (the collection itself swallows these — without surfacing
 * them a live view just looks empty). 403 gets permission wording.
 */
export const describeSyncError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever the collection's fetch threw; narrowed below
  err: unknown,
  doctype: string,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- i18next interpolation options are arbitrary named values
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  // SAFETY: optional read of `status`; a non-object or missing field yields undefined, which falls through below
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const status = (err as { status?: number })?.status;
  if (status === 403) {
    return t('You do not have permission to view {{doctype}}', { doctype });
  }
  const message = err instanceof Error ? err.message : undefined;
  return message ?? t('Failed to load {{doctype}}', { doctype });
};
