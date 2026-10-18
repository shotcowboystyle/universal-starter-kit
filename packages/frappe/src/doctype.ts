/**
 * DocType metadata hooks for @repo/frappe
 *
 * Provides hooks for fetching and caching DocType schemas, searching linked
 * documents, and searching across DocTypes for navigation (Awesomebar).
 */

import { getCookie } from '@repo/platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HttpClient } from './core/http';
import { FrappeError } from './core/types';
import type { AuthConfig } from './core/types';
import type { FrappeConnectionConfig } from './pacer';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Every fieldtype a Frappe bench serves: the options of `DocField.fieldtype`.
 */
export const stockFieldTypes = [
  'Autocomplete',
  'Attach',
  'Attach Image',
  'Barcode',
  'Button',
  'Check',
  'Code',
  'Color',
  'Column Break',
  'Currency',
  'Data',
  'Date',
  'Datetime',
  'Duration',
  'Dynamic Link',
  'Float',
  'Fold',
  'Geolocation',
  'HTML',
  'HTML Editor',
  'Heading',
  'Icon',
  'Image',
  'Int',
  'JSON',
  'Link',
  'Long Text',
  'Markdown Editor',
  'Password',
  'Percent',
  'Phone',
  'Rating',
  'Read Only',
  'Section Break',
  'Select',
  'Signature',
  'Small Text',
  'Tab Break',
  'Table',
  'Table MultiSelect',
  'Text',
  'Text Editor',
  'Time',
] as const;

/**
 * Fieldtypes no bench serves. frappe-ui's field registry renders them for
 * hand-written meta, so they belong to the union: the registry must never
 * accept a fieldtype the meta model forbids (MPO-15).
 */
export const customFieldTypes = [
  'Date Range',
  'Mention',
  'OTP',
  'Progress',
  'Radio',
  'Slider',
  'Switch',
  'Toggle Group',
] as const;

/** Every fieldtype a `DocTypeField` may carry, and all `registerField` accepts. */
export const frappeFieldTypes = [...stockFieldTypes, ...customFieldTypes] as const;

export type FrappeFieldType = (typeof frappeFieldTypes)[number];

/**
 * One DocField row as `frappe.desk.form.load.getdoctype` sends it. This is
 * the only field model: the desk form engine, the list surfaces and
 * `useDocTypeMeta` all read it. Flags stay the server's `0 | 1`, and the
 * index signature carries the keys no surface reads yet.
 */
export interface DocTypeField {
  fieldname: string;
  fieldtype: FrappeFieldType;
  label?: string;
  /** Link target DocType, Select options, or Table child DocType */
  options?: string;
  required?: 0 | 1;
  unique?: 0 | 1;
  hidden?: 0 | 1;
  read_only?: 0 | 1;
  bold?: 0 | 1;
  in_list_view?: 0 | 1;
  in_standard_filter?: 0 | 1;
  in_global_search?: 0 | 1;
  allow_in_quick_entry?: 0 | 1;
  allow_on_submit?: 0 | 1;
  no_copy?: 0 | 1;
  set_only_once?: 0 | 1;
  report_hide?: 0 | 1;
  /** For Section Break fields: whether the section is collapsible */
  collapsible?: 0 | 1;
  collapsible_depends_on?: string;
  /** Conditional visibility expression (e.g. `eval:doc.status=="Active"`) */
  depends_on?: string;
  mandatory_depends_on?: string;
  read_only_depends_on?: string;
  fetch_from?: string;
  fetch_if_empty?: 0 | 1;
  permlevel?: number;
  length?: number;
  precision?: string | number;
  default?: string;
  description?: string;
  /** For Link fields: comma-separated search fields */
  search_fields?: string;
  idx?: number;
  [key: string]: unknown;
}

/** Role permission row from the DocType meta. */
export interface DocTypePermission {
  role?: string;
  permlevel?: number;
  read?: 0 | 1;
  write?: 0 | 1;
  create?: 0 | 1;
  delete?: 0 | 1;
  submit?: 0 | 1;
  cancel?: 0 | 1;
  amend?: 0 | 1;
  print?: 0 | 1;
  email?: 0 | 1;
  share?: 0 | 1;
  if_owner?: 0 | 1;
  [key: string]: unknown;
}

/** DocType Link child row (Connections tab). Probed: `group` arrives null when unset. */
export interface DocTypeLink {
  name?: string;
  link_doctype: string;
  link_fieldname: string;
  group?: string | null;
  hidden?: 0 | 1;
  is_child_table?: 0 | 1;
  parent_doctype?: string;
  table_fieldname?: string;
  [key: string]: unknown;
}

/** A column in a form section, containing an ordered list of fields */
export interface FormColumn {
  fields: DocTypeField[];
}

/** A section in the form layout, containing one or more columns */
export interface FormSection {
  label?: string;
  collapsible?: boolean;
  /** Whether this section represents a Tab Break */
  tab?: boolean;
  columns: FormColumn[];
}

/** DocType meta as `frappe.desk.form.load.getdoctype` sends it (loose: the server is the source of truth). */
export interface DocTypeMeta {
  doctype?: string;
  name: string;
  module?: string;
  issingle?: 0 | 1;
  istable?: 0 | 1;
  is_submittable?: 0 | 1;
  is_tree?: 0 | 1;
  /** Desk treeview_settings asset (`{doctype}_tree.js`) — gates Tree. */
  __tree_js?: string;
  /** Desk calendar_settings asset (`{doctype}_calendar.js`) — gates Calendar. */
  __calendar_js?: string;
  is_virtual?: 0 | 1;
  editable_grid?: 0 | 1;
  track_changes?: 0 | 1;
  quick_entry?: 0 | 1;
  autoname?: string;
  naming_rule?: string;
  allow_rename?: 0 | 1;
  allow_copy?: 0 | 1;
  read_only?: 0 | 1;
  in_create?: 0 | 1;
  hide_toolbar?: 0 | 1;
  max_attachments?: number;
  title_field?: string;
  image_field?: string;
  search_fields?: string;
  sort_field?: string;
  sort_order?: string;
  icon?: string;
  document_type?: string;
  /** May arrive as a JSON string or an already-parsed array. */
  field_order?: string[] | string;
  /** Flat list of all fields (`useDocTypeMeta` orders them by `field_order`) */
  fields: DocTypeField[];
  permissions?: DocTypePermission[];
  links?: DocTypeLink[];
  states?: ({ title?: string; color?: string } & Record<string, unknown>)[];
  /** Layout tree parsed from the break fields. `useDocTypeMeta` fills it; a raw getdoctype doc has none. */
  sections?: FormSection[];
  [key: string]: unknown;
}

/** A search result for a Link field */
export interface LinkSearchResult {
  /** The document name (ID) */
  value: string;
  /** The display label (server `label` when the doctype shows its title in links, else the name) */
  label: string;
  /** Ranked description from the server (title field / matched context), like stock Frappe */
  description?: string;
}

/** Options for the `useLinkSearch` hook */
export interface LinkSearchOptions {
  /** Search query text */
  query?: string;
  /**
   * Restrict matching to one field (maps to `search_link`'s `searchfield`).
   * Extra entries are ignored — the server owns multi-field ranking now.
   */
  searchFields?: string[];
  /** Additional Frappe filters (server-side, on top of the doctype's link query) */
  filters?: Record<string, unknown> | [string, string, unknown][];
  /** Maximum results / `page_length` (default 20) */
  limit?: number;
  /**
   * Fetch the first page when the query is empty (stock Frappe behavior on
   * focus). Default false: empty query returns no results and no request.
   */
  allowEmptyQuery?: boolean;
  /** Gate searching entirely (e.g. only while the picker is open). Default true. */
  enabled?: boolean;
  /** Debounce before hitting the server, in ms (default 300) */
  debounceMs?: number;
  /** Doctype of the form the link sits on (server `reference_doctype`, feeds link queries) */
  referenceDoctype?: string;
}

/** A navigation suggestion from DocType search */
export interface DocTypeSearchResult {
  /** Display label (e.g. "Pokemon List", "New Pokemon") */
  label: string;
  /** The DocType name */
  doctype: string;
  /** Suggestion type */
  type: 'list' | 'report' | 'new';
}

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

/** Cache for parsed DocType metadata, keyed by "{baseURL}:{doctype}" */
const metaCache = new Map<string, DocTypeMeta>();

/** Cache for the full list of DocTypes, keyed by baseURL */
const docTypeListCache = new Map<string, DocTypeListItem[]>();
// In-flight DocType-list fetch per baseURL: the desk mounts two consumers
// (Awesomebar + DeskSidebar) simultaneously and they must share one request.
const docTypeListFetches = new Map<string, Promise<DocTypeListItem[]>>();

interface DocTypeListItem {
  name: string;
  module: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Utility: parseDependsOn
// ---------------------------------------------------------------------------

/**
 * Parse a Frappe `depends_on` expression into an evaluable function.
 *
 * Handles expressions like:
 * - `eval:doc.status=="Active"` — JS expression with `doc` bound
 * - `doc.field_name` — truthy check on a field value
 * - `eval:doc.field1 && doc.field2` — compound boolean
 *
 * @param expression - The depends_on expression string, or undefined
 * @returns A function that evaluates the expression given a document object
 */
export function parseDependsOn(expression?: string): (doc: Record<string, unknown>) => boolean {
  if (!expression) {
    return () => true;
  }

  const trimmed = expression.trim();

  if (trimmed.startsWith('eval:')) {
    const code = trimmed.slice(5).trim();
    try {
      const fn = new Function('doc', `return !!(${code})`) as (doc: Record<string, unknown>) => boolean;
      return (doc: Record<string, unknown>) => {
        try {
          return fn(doc);
        } catch {
          return false;
        }
      };
    } catch {
      return () => false;
    }
  }

  // Expression containing "doc." — evaluate as JS (e.g. "doc.status")
  if (trimmed.includes('doc.')) {
    try {
      const fn = new Function('doc', `return !!(${trimmed})`) as (doc: Record<string, unknown>) => boolean;
      return (doc: Record<string, unknown>) => {
        try {
          return fn(doc);
        } catch {
          return false;
        }
      };
    } catch {
      return () => false;
    }
  }

  // Bare field reference (e.g. "enabled") — truthy check on doc[fieldname]
  return (doc) => !!doc[trimmed];
}

// ---------------------------------------------------------------------------
// Utility: parseFormLayout
// ---------------------------------------------------------------------------

/**
 * Parse a flat array of DocType fields into a structured `FormSection[]` layout.
 *
 * Algorithm:
 * 1. Start with an implicit first section (no label) containing one column.
 * 2. `Section Break` → start a new section.
 * 3. `Column Break` → start a new column within the current section.
 * 4. `Tab Break` → start a new section with `tab: true`.
 * 5. All other fields → add to the current column (skip hidden fields).
 * 6. Drop empty leading sections (see below) so meta that begins with a
 *    Section Break doesn't produce an empty card before the first real one.
 *
 * @param fields - Flat list of DocType fields, ordered by field_order or position
 * @returns Structured layout tree of sections and columns
 */
export function parseFormLayout(fields: DocTypeField[]): FormSection[] {
  const sections: FormSection[] = [];
  let currentSection: FormSection = { columns: [{ fields: [] }] };
  sections.push(currentSection);

  for (const field of fields) {
    switch (field.fieldtype) {
      case 'Section Break': {
        currentSection = {
          label: field.label,
          collapsible: !!field.collapsible,
          columns: [{ fields: [] }],
        };
        sections.push(currentSection);
        break;
      }

      case 'Column Break': {
        currentSection.columns.push({ fields: [] });
        break;
      }

      case 'Tab Break': {
        currentSection = {
          label: field.label,
          tab: true,
          columns: [{ fields: [] }],
        };
        sections.push(currentSection);
        break;
      }

      default: {
        if (!field.hidden) {
          const lastColumn = currentSection.columns.at(-1);
          lastColumn?.fields?.push?.(field);
        }
        break;
      }
    }
  }

  // Skip empty leading sections: a doctype whose first field is a Section
  // Break (or whose leading fields are all hidden) otherwise keeps the
  // implicit fieldless first section, which renders as an empty card before
  // the first real section. Keep one section for a fieldless doctype so
  // consumers always receive at least one.
  while (sections.length > 1 && sections[0].columns.every((col) => col.fields.length === 0)) {
    sections.shift();
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createHttpClient(config: FrappeConnectionConfig): HttpClient | undefined {
  if (!config.baseURL) {
    return undefined;
  }
  const authConfig: AuthConfig | undefined = config.auth
    ? {
        useToken: config.auth.useToken,
        token: config.auth.token,
        type: config.auth.type as AuthConfig['type'],
      }
    : undefined;
  return new HttpClient(config.baseURL, authConfig);
}

/**
 * True when requests on this connection reach Frappe as Guest: it names a
 * token source, the source resolves empty (signed out), and no Frappe desk
 * session cookie names a user. A cookie-only connection names no token
 * source, so it is never judged here.
 */
async function connectsAsGuest(auth: FrappeConnectionConfig['auth']): Promise<boolean> {
  if (!auth?.useToken || !auth.token) {
    return false;
  }
  const token = typeof auth.token === 'function' ? await auth.token() : auth.token;
  if (token) {
    return false;
  }
  const user = getCookie('user_id');
  return !user || user === 'Guest';
}

function orderFields(fields: DocTypeField[], fieldOrder: string[]): DocTypeField[] {
  const fieldMap = new Map(fields.map((f) => [f.fieldname, f]));
  const ordered: DocTypeField[] = [];
  const seen = new Set<string>();

  for (const name of fieldOrder) {
    const field = fieldMap.get(name);
    if (field) {
      ordered.push(field);
      seen.add(name);
    }
  }

  // Append any fields not listed in field_order
  for (const field of fields) {
    if (!seen.has(field.fieldname)) {
      ordered.push(field);
    }
  }

  return ordered;
}

function parseRawDocTypeMeta(raw: DocTypeMeta): DocTypeMeta {
  const fields = raw.fields.map((field) => ({ ...field }));

  // field_order may be a JSON string or an already-parsed array
  let fieldOrder: string[] | undefined;
  if (typeof raw.field_order === 'string') {
    try {
      fieldOrder = JSON.parse(raw.field_order);
    } catch {
      fieldOrder = undefined;
    }
  } else if (Array.isArray(raw.field_order)) {
    fieldOrder = raw.field_order;
  }

  const orderedFields = fieldOrder ? orderFields(fields, fieldOrder) : fields;

  return {
    ...raw,
    sort_field: raw.sort_field ?? 'modified',
    sort_order: raw.sort_order ?? 'DESC',
    fields: orderedFields,
    permissions: raw.permissions ?? [],
    sections: parseFormLayout(orderedFields),
  };
}

/**
 * Cache identity for a connection. A fixtures-only connection has no
 * baseURL, so it is keyed by its FixtureProvider instance instead — two
 * corpora must not share one cached DocType (the cross-test pollution the
 * SyncModule cache already avoids the same way).
 */
const fixtureConnectionIds = new WeakMap<object, string>();
let nextFixtureConnectionId = 0;

function connectionKey(config: FrappeConnectionConfig): string {
  if (config.baseURL) {
    return config.baseURL;
  }
  const { fixtures } = config;
  if (!fixtures) {
    return '';
  }
  let id = fixtureConnectionIds.get(fixtures);
  if (!id) {
    id = `fixtures#${++nextFixtureConnectionId}`;
    fixtureConnectionIds.set(fixtures, id);
  }
  return id;
}

/**
 * Setup pattern for a stable HttpClient ref, following the same pattern
 * used in `useDebouncedSearch` for DbModule.
 */
function useHttpClientRef(config: FrappeConnectionConfig | undefined): React.RefObject<HttpClient | undefined> {
  const httpRef = useRef<HttpClient | undefined>(undefined);
  const configKeyRef = useRef('');
  const configKey = config
    ? `${config.baseURL}:${config.auth?.useToken ? 't' : ''}:${config.auth?.token ?? ''}:${config.auth?.type ?? ''}`
    : '';

  if (config && configKey !== configKeyRef.current) {
    httpRef.current = createHttpClient(config);
    configKeyRef.current = configKey;
  }
  if (!config) {
    httpRef.current = undefined;
    configKeyRef.current = '';
  }

  return httpRef;
}

// ---------------------------------------------------------------------------
// Hook: useDocTypeMeta
// ---------------------------------------------------------------------------

/**
 * Fetch and cache DocType metadata (schema, fields, layout, permissions).
 *
 * Metadata comes from `frappe.desk.form.load.getdoctype`, the whitelisted RPC
 * the Desk itself uses, so ordinary users load forms too — the REST
 * `/api/resource/DocType/<name>` route reads the DocType *document* and is
 * System-Manager-only. That route stays as a fallback for desk-less sites
 * where the RPC is not registered. When `config.fixtures` carries a "DocType"
 * entry for the doctype it is used instead and no request is made.
 *
 * Neither route is open to Guest. A signed-out connection (its token source
 * resolves empty and no desk session cookie names a user) gets a 403
 * `FrappeError` without a request, so callers keep their Guest fallbacks.
 *
 * Responses are cached per-session in memory keyed by `{baseURL}:{doctype}`.
 * The `refetch` function clears the cache entry and forces a fresh fetch.
 *
 * @param config - Frappe connection config, or undefined to disable
 * @param doctype - The DocType name to fetch metadata for
 * @returns `{ meta, isLoading, error, refetch }`
 *
 * @example
 * ```tsx
 * function PokemonForm() {
 *   const { meta, isLoading } = useDocTypeMeta(config, "Pokemon");
 *   if (isLoading) return <Spinner />;
 *   return meta?.sections?.map(section => (
 *     <FormSection key={section.label} section={section} />
 *   ));
 * }
 * ```
 */
export function useDocTypeMeta(
  config: FrappeConnectionConfig | undefined,
  doctype: string,
): {
  meta: DocTypeMeta | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const cacheKey = config ? `${connectionKey(config)}:${doctype}` : '';

  const [meta, setMeta] = useState<DocTypeMeta | undefined>(() => (cacheKey ? metaCache.get(cacheKey) : undefined));
  const [isLoading, setIsLoading] = useState(() => !!config && !!doctype && !(cacheKey && metaCache.has(cacheKey)));
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  // Synchronize state when cache key changes (doctype or baseURL changed)
  const prevCacheKeyRef = useRef(cacheKey);
  if (cacheKey !== prevCacheKeyRef.current) {
    prevCacheKeyRef.current = cacheKey;
    const cached = cacheKey ? metaCache.get(cacheKey) : undefined;
    if (cached) {
      setMeta(cached);
      setIsLoading(false);
    } else {
      setMeta(undefined);
      setIsLoading(!!config && !!doctype);
    }
    setError(null);
  }

  const httpRef = useHttpClientRef(config);

  useEffect(() => {
    if (!config || !doctype) {
      return;
    }

    const key = `${connectionKey(config)}:${doctype}`;
    // Already have cached data (synchronized during render)
    if (metaCache.has(key)) {
      return;
    }

    const http = httpRef.current;
    // No client AND no corpus: nothing can answer, so park rather than
    // dial `undefined` (a fixtures-only host has no baseURL by design).
    if (!http && !config.fixtures) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        // Fixture hosts (stories/tests) keep the getdoctype-shaped meta doc in
        // the provider's "DocType" collection — the same convention the
        // backoffice meta loader uses. Providers that stub only documents fall
        // through to the network below.
        const fromFixtures = config.fixtures
          ? ((await config.fixtures.getDoc('DocType', doctype)) as DocTypeMeta | null)
          : null;
        if (cancelled) {
          return;
        }

        let raw = fromFixtures?.fields ? fromFixtures : undefined;

        if (!raw) {
          if (!http) {
            // Fixtures-only host: there is no server behind the corpus, so a
            // missing DocType entry is the honest end of the road.
            throw new Error(`DocType "${doctype}" is not in the fixture corpus and no baseURL is configured`);
          }

          // Both routes below are closed to Guest, so a signed-out reader
          // gets the 403 without the request (MPO-322).
          if (await connectsAsGuest(config.auth)) {
            if (cancelled) {
              return;
            }
            throw new FrappeError(`Sign in to load the ${doctype} schema`, 403);
          }

          // `getdoctype` is the whitelisted RPC the Desk itself loads form
          // metadata with, and every logged-in user may call it. Reading
          // `/api/resource/DocType/<name>` instead asks for the DocType
          // *document*, which only System Manager holds read permission on, so
          // ordinary users got a 403 PermissionError — and Frappe's
          // developer-mode traceback rendered into the UI instead of a form.
          const response = await http.get<{ docs?: DocTypeMeta[] }>('/api/method/frappe.desk.form.load.getdoctype', {
            doctype,
          });

          if (cancelled) {
            return;
          }

          // docs[0] is the requested doctype; docs[1..] are its child tables.
          const docs = response.payload?.docs;
          raw = docs?.find((doc) => doc?.name === doctype) ?? docs?.[0];

          if (!raw) {
            // Sites that expose the REST API without the desk leave the RPC
            // above unregistered, so it answers with no `docs`. The document
            // route still serves meta there, and such a site's API clients are
            // typically System Managers, who may read it.
            const rest = await http.get<{ data?: DocTypeMeta }>(`/api/resource/DocType/${encodeURIComponent(doctype)}`);

            if (cancelled) {
              return;
            }

            raw = rest.payload?.data;
          }
        }

        if (!raw) {
          throw new Error(`No data returned for DocType "${doctype}"`);
        }

        const parsed = parseRawDocTypeMeta(raw);
        metaCache.set(key, parsed);
        setMeta(parsed);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setError(error instanceof Error ? error : new Error(String(error)));
        setMeta(undefined);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Depend on the stable string `cacheKey` (baseURL + doctype), NOT the
    // `config` object — callers frequently pass a freshly-allocated config
    // object every render. Keying on the object identity would re-run this
    // effect on every render and, when the request fails (e.g. a Guest calling
    // the login-gated getdoctype RPC → 403, which never populates
    // `metaCache`), spin into an infinite refetch loop.
  }, [cacheKey, version]);

  const refetch = useCallback(() => {
    if (cacheKey) {
      metaCache.delete(cacheKey);
    }
    setVersion((v) => v + 1);
  }, [cacheKey]);

  return { meta, isLoading, error, refetch };
}

// ---------------------------------------------------------------------------
// Hook: useLinkSearch
// ---------------------------------------------------------------------------

/** Raw item shape returned by `frappe.desk.search.search_link` (v13: `results`, v14+: `message`). */
interface RawSearchLinkItem {
  value?: string;
  label?: string;
  description?: string;
}

/**
 * Debounced backend search for Link field suggestions — the same server
 * search stock Frappe's link control uses.
 *
 * Calls `GET /api/method/frappe.desk.search.search_link` (doctype + txt +
 * filters + page_length) with a 300ms debounce, returning the server's
 * ranked `{value, description, label?}` pairs. The endpoint enforces
 * permissions and the doctype's link/`get_query` conditions server-side.
 *
 * @param config - Frappe connection config, or undefined to disable
 * @param doctype - The target DocType to search within
 * @param options - Search options (query, filters, limit, enabled, allowEmptyQuery, debounceMs)
 * @returns `{ results, isLoading, error }`
 *
 * @example
 * ```tsx
 * function SpeciesLink() {
 *   const [text, setText] = useState("");
 *   const { results, isLoading } = useLinkSearch(config, "Poke Species", {
 *     query: text,
 *     limit: 10,
 *   });
 *   return (
 *     <div>
 *       <input value={text} onChange={e => setText(e.target.value)} />
 *       {isLoading && <span>Searching...</span>}
 *       {results.map(r => <div key={r.value}>{r.label}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useLinkSearch(
  config: FrappeConnectionConfig | undefined,
  doctype: string,
  options?: LinkSearchOptions,
): {
  results: LinkSearchResult[];
  isLoading: boolean;
  error: Error | null;
} {
  const query = options?.query ?? '';
  const searchFields = options?.searchFields;
  const filters = options?.filters;
  const limit = options?.limit ?? 20;
  const allowEmptyQuery = options?.allowEmptyQuery ?? false;
  const enabled = options?.enabled ?? true;
  const debounceMs = options?.debounceMs ?? 300;
  const referenceDoctype = options?.referenceDoctype;

  const [results, setResults] = useState<LinkSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const httpRef = useHttpClientRef(config);

  useEffect(() => {
    const http = httpRef.current;
    if (!http || !doctype || !enabled || (!query && !allowEmptyQuery)) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const params: Record<string, unknown> = {
          doctype,
          txt: query,
          page_length: limit,
        };
        if (filters) {
          params.filters = filters;
        }
        if (searchFields?.[0]) {
          params.searchfield = searchFields[0];
        }
        if (referenceDoctype) {
          params.reference_doctype = referenceDoctype;
        }

        const response = await http.get<{
          message?: RawSearchLinkItem[];
          results?: RawSearchLinkItem[];
        }>('/api/method/frappe.desk.search.search_link', params);

        if (cancelled) {
          return;
        }

        // v14+ responds under `message`; v13 used `results`.
        const items = response.payload?.message ?? response.payload?.results ?? [];
        setResults(
          items.map((item) => ({
            value: String(item.value ?? ''),
            label: String(item.label ?? item.value ?? ''),
            description:
              item.description === null || item.description === undefined ? undefined : String(item.description),
          })),
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        setError(error instanceof Error ? error : new Error(String(error)));
        setResults([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, doctype, searchFields, filters, limit, allowEmptyQuery, enabled, debounceMs, referenceDoctype]);

  return { results, isLoading, error };
}

// ---------------------------------------------------------------------------
// Hook: useLinkTitle
// ---------------------------------------------------------------------------

/** Cache for link display titles, keyed by "{baseURL}:{doctype}:{name}" */
const linkTitleCache = new Map<string, string>();

/**
 * Fetch the display title for an existing Link value (foreign key) — what
 * stock Frappe does on form load so a saved link shows its label before any
 * search has run.
 *
 * Calls `frappe.desk.search.get_link_title`, which resolves the doctype's
 * `title_field` server-side (returns the plain name when the doctype does
 * not show titles in links). Results are cached per session; failures fall
 * back to the raw name so the field never renders empty.
 *
 * @param config - Frappe connection config, or undefined to disable
 * @param doctype - The Link's target DocType
 * @param name - The linked document name (current field value)
 * @returns `{ title, isLoading }` — `title` is undefined while nothing is known
 */
export function useLinkTitle(
  config: FrappeConnectionConfig | undefined,
  doctype: string,
  name: string | undefined,
): { title: string | undefined; isLoading: boolean } {
  const cacheKey = config && doctype && name ? `${config.baseURL}:${doctype}:${name}` : '';
  const [title, setTitle] = useState<string | undefined>(() => (cacheKey ? linkTitleCache.get(cacheKey) : undefined));
  const [isLoading, setIsLoading] = useState(false);

  const httpRef = useHttpClientRef(config);

  useEffect(() => {
    if (!cacheKey || !name) {
      setTitle(undefined);
      setIsLoading(false);
      return;
    }

    const cached = linkTitleCache.get(cacheKey);
    if (cached !== undefined) {
      setTitle(cached);
      setIsLoading(false);
      return;
    }

    const http = httpRef.current;
    if (!http) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const response = await http.get<{ message?: string }>('/api/method/frappe.desk.search.get_link_title', {
          doctype,
          docname: name,
        });
        if (cancelled) {
          return;
        }
        const message = response.payload?.message;
        const resolved = message === null || message === undefined ? name : String(message);
        linkTitleCache.set(cacheKey, resolved);
        setTitle(resolved);
      } catch {
        if (cancelled) {
          return;
        }
        // Honest fallback: the name itself is always a truthful display value.
        setTitle(name);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, doctype, name]);

  return { title, isLoading };
}

// ---------------------------------------------------------------------------
// Hook: useDocTypeSearch
// ---------------------------------------------------------------------------

/**
 * Search across all DocType names for Awesomebar navigation.
 *
 * Fetches and caches the full list of DocTypes, then filters locally
 * for instant results. Returns navigation suggestions in the format:
 * "{name} List", "{name} Report", "New {name}".
 *
 * @param config - Frappe connection config, or undefined to disable
 * @param query - Search query string
 * @returns `{ results, isLoading, error }`
 *
 * @example
 * ```tsx
 * function Awesomebar() {
 *   const [text, setText] = useState("");
 *   const { results } = useDocTypeSearch(config, text);
 *   return (
 *     <div>
 *       <input value={text} onChange={e => setText(e.target.value)} />
 *       {results.map(r => <div key={r.label}>{r.label}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useDocTypeSearch(
  config: FrappeConnectionConfig | undefined,
  query: string,
): {
  results: DocTypeSearchResult[];
  isLoading: boolean;
  error: Error | null;
} {
  const [allDocTypes, setAllDocTypes] = useState<DocTypeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const httpRef = useHttpClientRef(config);
  const cacheKey = config?.baseURL ?? '';

  useEffect(() => {
    if (!cacheKey) {
      setAllDocTypes([]);
      setIsLoading(false);
      return;
    }

    const cached = docTypeListCache.get(cacheKey);
    if (cached) {
      setAllDocTypes(cached);
      return;
    }

    const http = httpRef.current;
    if (!http) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Share one in-flight fetch per baseURL (Awesomebar + DeskSidebar mount
    // together). A failed fetch clears its entry so a later mount can retry;
    // the stable cacheKey dep below keeps that from looping.
    let fetchPromise = docTypeListFetches.get(cacheKey);
    if (!fetchPromise) {
      fetchPromise = http
        .get<{
          data?: DocTypeListItem[];
        }>('/api/resource/DocType', {
          limit_page_length: 0,
          // DocType has no `title` column; requesting it makes Frappe reject
          // the whole query ("Field not permitted in query: title")
          fields: ['name', 'module'],
        })
        .then((response) => {
          const list = response.payload?.data ?? [];
          docTypeListCache.set(cacheKey, list);
          return list;
        })
        .finally(() => {
          docTypeListFetches.delete(cacheKey);
        });
      docTypeListFetches.set(cacheKey, fetchPromise);
    }

    fetchPromise
      .then((list) => {
        if (!cancelled) {
          setAllDocTypes(list);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Depend on the stable string `cacheKey` (baseURL), NOT the `config`
    // object — both desk callers allocate a fresh config every render.
    // Keying on object identity re-runs this effect per render and, when
    // the request fails (a Guest hitting the permission-gated DocType list
    // → 403, which never populates `docTypeListCache`), spins into an
    // infinite refetch loop that hammers the bench. Same fix as
    // useDocTypeMeta above.
  }, [cacheKey]);

  // Filter locally for instant results
  const results = useMemo<DocTypeSearchResult[]>(() => {
    if (!query || allDocTypes.length === 0) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    const matching = allDocTypes.filter(
      (dt) =>
        dt.name.toLowerCase().includes(lowerQuery) ||
        dt.module.toLowerCase().includes(lowerQuery) ||
        dt.title?.toLowerCase().includes(lowerQuery),
    );

    return matching.flatMap((dt) => [
      { label: `${dt.name} List`, doctype: dt.name, type: 'list' as const },
      {
        label: `${dt.name} Report`,
        doctype: dt.name,
        type: 'report' as const,
      },
      { label: `New ${dt.name}`, doctype: dt.name, type: 'new' as const },
    ]);
  }, [query, allDocTypes]);

  return { results, isLoading, error };
}
