/**
 * Desk form layout engine — moved to
 * `@repo/frappe-ui/src/formEngine/formLayout` (MPO-15).
 *
 * The exported `FrappeForm` needed the same tab / section / depends_on /
 * permlevel / fetch_from resolution the desk uses, and backoffice sits a
 * tier ABOVE frappe-ui, so the engine could not be reached from there. It
 * lives in frappe-ui now. This module re-exports it so the barrel and the
 * `@repo/backoffice/src/form/formLayout` deep import keep
 * resolving unchanged; the specs moved with the implementation.
 */

export { buildCopyValues, buildCreateDefaults, buildFormTabs, isPromptNamed } from '@repo/frappe-ui';
export type { BuildTabsOptions, FormTab } from '@repo/frappe-ui';
