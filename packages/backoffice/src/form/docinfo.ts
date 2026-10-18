/**
 * Docinfo permission normalization.
 *
 * The docinfo fetch itself lives in shared/use-docinfo (one deduped
 * get_docinfo per document shared by the sidebar / timeline / form screen);
 * the unused local `useDocInfo` getdoc loader was pruned by the integrator.
 *
 * NOTE: this bench returns `permissions: {"null": 0}` for token-auth users —
 * an upstream quirk. `normalizeDocPermissions` treats a payload without a
 * real `read` key as unusable and callers fall back to meta role rules.
 */

/**
 * Returns per-doc permission flags when the payload is usable, else
 * undefined (fall back to meta role rules). See module note on the
 * `{"null": 0}` quirk.
 */
export const normalizeDocPermissions = (
  permissions: Record<string, number> | undefined,
): Record<string, number> | undefined => {
  if (!permissions) {
    return undefined;
  }
  if (!('read' in permissions)) {
    return undefined;
  }
  return permissions;
};
