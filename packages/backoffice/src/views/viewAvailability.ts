// Meta-derived view availability — the single source of truth for which
// backoffice views a doctype's switcher offers (desk ListViewSelect parity,
// frappe/public/js/frappe/list/list_view_select.js @ frappe 15.8.1).
//
// Desk's per-view conditions, verified against the live bench (getdoctype
// RPC payloads + the desk switcher itself — see
// p-results/audit-view-switcher-meta.md):
//   List / Report / Dashboard — unconditional.
//   Tree     — frappe.treeview_settings[doctype] (registered by the meta's
//              `__tree_js` asset) OR meta.is_tree.
//   Image    — meta.image_field only (desk `list_view.meta.image_field`).
//              A stray Attach Image field is not an image view.
//   Kanban   — a visible Select field with options. Desk offers Kanban
//              unconditionally (except File) and dead-ends doctypes without
//              a Select field in a "No Select Field Found" modal. A board
//              cannot even be created without a Select field, so that shape
//              is truly unsupported and we hide it. A doctype WITH a Select
//              field but no Kanban Board doc is supported but unconfigured:
//              it stays visible, and KanbanView offers "Create board"
//              rather than an empty board.
//   Calendar — desk gates on frappe.views.calendar[doctype], populated by
//              evaluating the meta's `__calendar_js` asset. A Date field
//              alone is not a calendar config (Activity Log has
//              communication_date and must not grow a Calendar tab).
// Desk-only views the backoffice does not implement (Gantt, Inbox, Map,
// File manager) are out of scope — BACKOFFICE_VIEWS does not contain them.
import { BACKOFFICE_VIEWS } from '../navigation/paths';
import type { BackofficeView } from '../navigation/paths';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';

import { detectSelectField } from './viewMeta';

/** Views offered for every doctype (desk parity: condition literally true). */
const UNCONDITIONAL_VIEWS: ReadonlySet<BackofficeView> = new Set(['list', 'report', 'dashboard']);

/**
 * Can this doctype render `view` at all? (The meta preconditions above.)
 * "Supported but unconfigured" — e.g. a Select field but no Kanban Board
 * doc — is supported: config docs gate configuration, never availability.
 */
export function isViewSupported(view: BackofficeView, meta: DoctypeMeta): boolean {
  switch (view) {
    case 'list':
    case 'report':
    case 'dashboard': {
      return true;
    }
    case 'tree': {
      return Boolean(meta.is_tree) || Boolean(meta.__tree_js);
    }
    case 'image': {
      return Boolean(meta.image_field);
    }
    case 'kanban': {
      return Boolean(detectSelectField(meta));
    }
    case 'calendar': {
      return Boolean(meta.__calendar_js);
    }
  }
}

export interface DeriveAvailableViewsOptions {
  /**
   * The view being rendered right now — always kept in the result so the
   * switcher stays honest about where you are (e.g. a deep link to
   * /view/tree on a flat doctype, which renders its own unsupported state).
   */
  current?: BackofficeView;
  /** Host allowlist (capabilities.views.allow ∩ any per-screen allowlist). */
  allow?: readonly BackofficeView[];
}

/**
 * The views a doctype's switcher offers, in canonical BACKOFFICE_VIEWS
 * order. Pure: fixture meta in, view list out. While meta is still loading
 * (`undefined`), only the unconditional views are offered — conditional
 * views stay hidden until meta confirms them rather than flashing in and
 * out.
 */
export function deriveAvailableViews(
  meta: DoctypeMeta | undefined,
  options: DeriveAvailableViewsOptions = {},
): BackofficeView[] {
  const { current, allow } = options;
  return BACKOFFICE_VIEWS.filter((candidate) => {
    if (candidate === current) {
      return true;
    }
    if (allow && !allow.includes(candidate)) {
      return false;
    }
    if (!meta) {
      return UNCONDITIONAL_VIEWS.has(candidate);
    }
    return isViewSupported(candidate, meta);
  });
}
