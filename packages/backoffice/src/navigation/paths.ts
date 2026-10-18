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

export const isBackofficeView = (value: string): value is BackofficeView =>
  BACKOFFICE_VIEWS.some((view) => view === value);

/** frappe.router.slug: "Sales Order" → "sales-order" */
export const toSlug = (name: string): string => name.toLowerCase().replaceAll(' ', '-');

/** Best-effort display name from a slug: "sales-order" → "Sales Order" */
export const slugToDisplayName = (slug: string): string =>
  slug.replaceAll('-', ' ').replaceAll(/\b\w/gu, (c) => c.toUpperCase());

/**
 * Parse the `?d=` new-doc defaults query (urlencoded JSON object). The
 * router usually decodes the param already, so the raw value is tried first.
 * Malformed or non-object input degrades to no defaults.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- new-doc defaults are arbitrary DocField values keyed by fieldname
export const parseDocDefaults = (raw: string | undefined): Record<string, unknown> | undefined => {
  if (raw === undefined || raw === '') {
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
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSON.parse output is the I/O boundary this function parses
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // SAFETY: parsed is a non-null, non-array object from JSON.parse, so every key holds a JSON value
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
        return parsed as Record<string, unknown>;
      }
    } catch {
      // not JSON in this shape — try the next candidate
    }
  }
  return undefined;
};

/** Path builders bound to a mount prefix. */
export interface BackofficePaths {
  /** The mount prefix these builders are bound to (no trailing slash). */
  base: string;
  home: () => string;
  workspace: (workspaceName: string) => string;
  list: (doctype: string) => string;
  view: (doctype: string, view: BackofficeView) => string;
  /**
   * New-document route. Optional `defaults` become the create form's initial
   * field values, carried as `?d=<urlencoded JSON object>` — desk parity for
   * creating from context (kanban column "+", calendar day click, …).
   */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- arbitrary DocField values keyed by fieldname
  newDoc: (doctype: string, defaults?: Record<string, unknown>) => string;
  form: (doctype: string, name: string) => string;
  /** Query/Script Report page (desk /app/query-report/<name>). */
  queryReport: (reportName: string) => string;
}

// oxlint-disable-next-line sonarjs/super-linear-regex -- anchored single-class run; mount prefixes are short config strings
const TRAILING_SLASHES = /\/+$/u;

export const createBackofficePaths = (basePath: string = BACKOFFICE_BASE): BackofficePaths => {
  const base = basePath.replace(TRAILING_SLASHES, '') || '/';
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
};

// ---------------------------------------------------------------------------
// Default-bound helpers ("/backoffice" prefix — one-router typed-route compat)
// ---------------------------------------------------------------------------

const defaultPaths = createBackofficePaths(BACKOFFICE_BASE);

const isBackofficeSubPath = (path: string): path is BackofficeSubPath => path.startsWith(`${BACKOFFICE_BASE}/`);

/** Narrows a default-bound builder result; every builder output starts with the "/backoffice/" prefix. */
const toSubPath = (path: string): BackofficeSubPath => {
  if (isBackofficeSubPath(path)) {
    return path;
  }
  throw new Error(`Expected a ${BACKOFFICE_BASE} sub-path, got "${path}"`);
};

export const homePath = (): BackofficePath => BACKOFFICE_BASE;

export const workspacePath = (workspaceName: string): BackofficeSubPath =>
  toSubPath(defaultPaths.workspace(workspaceName));

export const listPath = (doctype: string): BackofficeSubPath => toSubPath(defaultPaths.list(doctype));

export const viewPath = (doctype: string, view: BackofficeView): BackofficeSubPath =>
  toSubPath(defaultPaths.view(doctype, view));

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- arbitrary DocField values keyed by fieldname
export const newDocPath = (doctype: string, defaults?: Record<string, unknown>): BackofficeSubPath =>
  toSubPath(defaultPaths.newDoc(doctype, defaults));

export const formPath = (doctype: string, name: string): BackofficeSubPath =>
  toSubPath(defaultPaths.form(doctype, name));

export const QUERY_REPORT_BASE = '/backoffice/query-report';

/** `/backoffice/query-report/<encoded report name>` (desk /app/query-report/<name>). */
export const queryReportPath = (reportName: string): BackofficeSubPath =>
  toSubPath(defaultPaths.queryReport(reportName));
