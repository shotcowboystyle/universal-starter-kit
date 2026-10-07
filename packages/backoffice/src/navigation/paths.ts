/**
 * Backoffice route paths.
 *
 * Route map (relative to the mount `basePath`, default "/backoffice"):
 *   {base}                          → home (default workspace)
 *   {base}/[slug]                   → workspace page OR doctype list (runtime-resolved)
 *   {base}/[slug]/view/[view]       → alternate doctype views (report, kanban, …)
 *   {base}/[slug]/new               → new document (optional `?d=` JSON prefill)
 *   {base}/[slug]/[name]            → document form page
 *
 * Slugs follow frappe's router slugs: lowercase, spaces → dashes
 * ("Sales Order" → "sales-order").
 *
 * Surfaces inside the package MUST build paths through
 * `useBackofficeConfig().paths` (basePath-aware). The default-bound helpers
 * at the bottom exist for host apps mounted at the canonical "/backoffice"
 * prefix — their template-literal return types match one-router's generated
 * typed-route unions so they can be passed straight to router.push and
 * <Link href>.
 */

export const BACKOFFICE_BASE = '/backoffice';

export type BackofficeSubPath = `${typeof BACKOFFICE_BASE}/${string}`;
export type BackofficePath = typeof BACKOFFICE_BASE | BackofficeSubPath;

export const BACKOFFICE_VIEWS = ['list', 'report', 'kanban', 'calendar', 'tree', 'image', 'dashboard'] as const;

export type BackofficeView = (typeof BACKOFFICE_VIEWS)[number];

export function isBackofficeView(value: string): value is BackofficeView {
  return (BACKOFFICE_VIEWS as readonly string[]).includes(value);
}

/** frappe.router.slug: "Sales Order" → "sales-order" */
export function toSlug(name: string): string {
  return name.toLowerCase().replaceAll(' ', '-');
}

/** Best-effort display name from a slug: "sales-order" → "Sales Order" */
export function slugToDisplayName(slug: string): string {
  return slug.replaceAll('-', ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse the `?d=` new-doc defaults query (urlencoded JSON object). The
 * router usually decodes the param already, so the raw value is tried first.
 * Malformed or non-object input degrades to no defaults.
 */
export function parseDocDefaults(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) {
      candidates.push(decoded);
    }
  } catch {
    // raw is not percent-encoded — the direct candidate covers it
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // not JSON in this shape — try the next candidate
    }
  }
  return undefined;
}

/** Path builders bound to a mount prefix. */
export interface BackofficePaths {
  /** The mount prefix these builders are bound to (no trailing slash). */
  base: string;
  home(): string;
  workspace(workspaceName: string): string;
  list(doctype: string): string;
  view(doctype: string, view: BackofficeView): string;
  /**
   * New-document route. Optional `defaults` become the create form's initial
   * field values, carried as `?d=<urlencoded JSON object>` — desk parity for
   * creating from context (kanban column "+", calendar day click, …).
   */
  newDoc(doctype: string, defaults?: Record<string, unknown>): string;
  form(doctype: string, name: string): string;
  /** Query/Script Report page (desk /app/query-report/<name>). */
  queryReport(reportName: string): string;
}

export function createBackofficePaths(basePath: string = BACKOFFICE_BASE): BackofficePaths {
  const base = basePath.replace(/\/+$/, '') || '/';
  const prefix = base === '/' ? '' : base;
  return {
    base,
    home: () => base,
    workspace: (workspaceName) => `${prefix}/${toSlug(workspaceName)}`,
    list: (doctype) => `${prefix}/${toSlug(doctype)}`,
    view: (doctype, view) =>
      view === 'list' ? `${prefix}/${toSlug(doctype)}` : `${prefix}/${toSlug(doctype)}/view/${view}`,
    newDoc: (doctype, defaults) => {
      const path = `${prefix}/${toSlug(doctype)}/new`;
      if (!defaults || Object.keys(defaults).length === 0) {
        return path;
      }
      return `${path}?d=${encodeURIComponent(JSON.stringify(defaults))}`;
    },
    form: (doctype, name) => `${prefix}/${toSlug(doctype)}/${encodeURIComponent(name)}`,
    queryReport: (reportName) => `${prefix}/query-report/${encodeURIComponent(reportName)}`,
  };
}

// ---------------------------------------------------------------------------
// Default-bound helpers ("/backoffice" prefix — one-router typed-route compat)
// ---------------------------------------------------------------------------

const defaultPaths = createBackofficePaths(BACKOFFICE_BASE);

export function homePath(): BackofficePath {
  return defaultPaths.home() as BackofficePath;
}

export function workspacePath(workspaceName: string): BackofficeSubPath {
  return defaultPaths.workspace(workspaceName) as BackofficeSubPath;
}

export function listPath(doctype: string): BackofficeSubPath {
  return defaultPaths.list(doctype) as BackofficeSubPath;
}

export function viewPath(doctype: string, view: BackofficeView): BackofficeSubPath {
  return defaultPaths.view(doctype, view) as BackofficeSubPath;
}

export function newDocPath(doctype: string, defaults?: Record<string, unknown>): BackofficeSubPath {
  return defaultPaths.newDoc(doctype, defaults) as BackofficeSubPath;
}

export function formPath(doctype: string, name: string): BackofficeSubPath {
  return defaultPaths.form(doctype, name) as BackofficeSubPath;
}

export const QUERY_REPORT_BASE = '/backoffice/query-report';

/** `/backoffice/query-report/<encoded report name>` (desk /app/query-report/<name>). */
export function queryReportPath(reportName: string): BackofficeSubPath {
  return defaultPaths.queryReport(reportName) as BackofficeSubPath;
}
