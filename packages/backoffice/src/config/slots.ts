import type { ReactNode } from 'react';

/**
 * Host render-prop slots — the highest-leverage replacement points. Slots
 * are provider-level (they apply everywhere the surface renders); when a
 * slot is undefined the built-in rendering is used.
 */
export interface BackofficeSlots {
  /**
   * Replace the shell navbar CONTENT (inside the styled banner bar).
   * `defaultContent` is the built-in navbar row (home button, awesomebar,
   * bell/help/user chrome) so hosts can wrap instead of rebuild.
   */
  renderShellHeader?: (context: { defaultContent: ReactNode }) => ReactNode;
  /** Rendered at the bottom of the workspace sidebar (rail and drawer). */
  renderSidebarFooter?: () => ReactNode;
  /** Replace the list screen's empty state. (Consumed by the list surface.) */
  renderListEmpty?: (context: { doctype: string }) => ReactNode;
  /**
   * Replace the document form header row. (Consumed by the form surface.)
   * `name` is undefined for new (unsaved) documents.
   */
  renderFormHeader?: (context: { doctype: string; name?: string; defaultContent: ReactNode }) => ReactNode;
}
