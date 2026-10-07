// GNOME-target shim for @repo/frappe-ui.
//
// The real barrel re-exports the whole desk surface — FrappeDashboard,
// FrappeKanban, the field registry — none of which has a GJS story, and
// its native-condition build has shipped self-inconsistent (index.native
// re-exporting names FrappeDashboard.native does not export), which fails
// the bundle before GJS-safety is even the question.
//
// Screens on this target consume exactly one thing from the package:
// FrappeProvider / useFrappeConfig, so re-export the provider module
// alone. It is GJS-inert — React context plus a type-only import of
// @repo/frappe.
//
// Deep `…/src/*` path rather than the bare package name, which is
// aliased to this file and would loop.

export * from '@repo/frappe-ui/src/FrappeProvider';
