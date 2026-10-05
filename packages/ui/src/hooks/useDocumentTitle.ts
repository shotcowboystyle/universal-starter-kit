/**
 * useDocumentTitle — "document titles are reverse breadcrumbs".
 *
 * Composes "Leaf – Section – App" from a breadcrumb-ordered trail (root
 * first, exactly as passed to `<Breadcrumbs items>`) and assigns it to
 * `document.title` on web. Native (and SSR) is a no-op — there is no
 * `document`. An empty composed title never blanks the current one.
 */

import { useEffect, useMemo } from 'react';

/** Anything with a breadcrumb-style label (BreadcrumbItem is assignable). */
export interface DocumentTitlePart {
  label?: string | null;
}

/**
 * Breadcrumb-ordered trail (root → leaf). Plain strings and items with a
 * `label` are accepted; empty / nullish parts are dropped.
 */
export type DocumentTitleTrail = ReadonlyArray<DocumentTitlePart | string | null | undefined> | null;

/** En dash with hair spaces: "Leaf – Section – App". */
export const DOCUMENT_TITLE_SEPARATOR = ' – ';

/**
 * Pure composition: reverse the trail (leaf first) and join. Exported for
 * unit tests and non-hook callers.
 */
export function composeDocumentTitle(
  trail: DocumentTitleTrail | undefined,
  separator: string = DOCUMENT_TITLE_SEPARATOR,
): string {
  if (!trail) {
    return '';
  }
  const labels = trail
    .map((part) => (typeof part === 'string' ? part : (part?.label ?? '')))
    .map((label) => label.trim())
    .filter(Boolean);
  return labels.reverse().join(separator);
}

export interface UseDocumentTitleOptions {
  /** Separator between parts. Default `" – "`. */
  separator?: string;
  /** Pass false to compose without assigning `document.title`. */
  enabled?: boolean;
}

/**
 * Sets `document.title` to the reverse of the given breadcrumb trail.
 * Returns the composed title (empty string when the trail has no labels —
 * in that case the current document title is left untouched).
 *
 * @example
 * // breadcrumbs = [{ label: "Desk" }, { label: "Pokemon" }, { label: "Pikachu" }]
 * useDocumentTitle(breadcrumbs); // document.title === "Pikachu – Pokemon – Desk"
 */
export function useDocumentTitle(trail: DocumentTitleTrail | undefined, options: UseDocumentTitleOptions = {}): string {
  const { separator = DOCUMENT_TITLE_SEPARATOR, enabled = true } = options;
  const title = useMemo(() => composeDocumentTitle(trail, separator), [trail, separator]);

  useEffect(() => {
    if (!enabled || !title) {
      return;
    }
    // Web-only (native wires the equivalent through navigation
    // titles, not this hook). `document` is absent on React Native and SSR.
    if (typeof document === 'undefined') {
      return;
    }
    document.title = title;
  }, [title, enabled]);

  return title;
}
