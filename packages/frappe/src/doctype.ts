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
import type { AuthConfig, ListOptions } from './core/types';
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the server adds keys across versions; unread keys pass through
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the server adds keys across versions; unread keys pass through
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the server adds keys across versions; unread keys pass through
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- workflow state rows carry server keys beyond title/color
  states?: ({ title?: string; color?: string } & Record<string, unknown>)[];
  /** Layout tree parsed from the break fields. `useDocTypeMeta` fills it; a raw getdoctype doc has none. */
  sections?: FormSection[];
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the server adds keys across versions; unread keys pass through
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
  filters?: ListOptions['filters'];
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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- depends_on expressions read any field of an open frappe doc
type DocPredicate = (doc: Record<string, unknown>) => boolean;

/** Compiles a `depends_on` JS expression with `doc` bound; a broken expression evaluates to false. */
const compileDocExpression = (code: string): DocPredicate => {
  try {
    // SAFETY: the body is `return !!(...)`, so the compiled function takes `doc` and always returns a boolean.
    // oxlint-disable-next-line eslint/no-new-func, typescript/no-implied-eval, sonarjs/code-eval, react-doctor/no-eval, typescript/no-unsafe-type-assertion -- depends_on is desk-authored JS from DocType meta, evaluated the way the desk does
    const fn = new Function('doc', `return !!(${code})`) as DocPredicate;
    return (doc) => {
      try {
        return fn(doc);
      } catch {
        // An expression that throws (e.g. reading a missing child row) hides the field, as in the desk.
        return false;
      }
    };
  } catch {
    // A syntax error in the meta's expression hides the field rather than breaking the form.
    return () => false;
  }
};

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
export const parseDependsOn = (expression?: string): DocPredicate => {
  if (expression === undefined || expression === '') {
    return () => true;
  }

  const trimmed = expression.trim();

  if (trimmed.startsWith('eval:')) {
    return compileDocExpression(trimmed.slice(5).trim());
  }

  // Expression containing "doc." — evaluate as JS (e.g. "doc.status")
  if (trimmed.includes('doc.')) {
    return compileDocExpression(trimmed);
  }

  // Bare field reference (e.g. "enabled") — truthy check on doc[fieldname]
  return (doc) => Boolean(doc[trimmed]);
};

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
export const parseFormLayout = (fields: DocTypeField[]): FormSection[] => {
  const sections: FormSection[] = [];
  let currentSection: FormSection = { columns: [{ fields: [] }] };
  sections.push(currentSection);

  for (const field of fields) {
    if (field.fieldtype === 'Section Break') {
      currentSection = {
        label: field.label,
        collapsible: Boolean(field.collapsible),
        columns: [{ fields: [] }],
      };
      sections.push(currentSection);
    } else if (field.fieldtype === 'Column Break') {
      currentSection.columns.push({ fields: [] });
    } else if (field.fieldtype === 'Tab Break') {
      currentSection = {
        label: field.label,
        tab: true,
        columns: [{ fields: [] }],
      };
      sections.push(currentSection);
    } else {
      const isHidden = Boolean(field.hidden);
      if (!isHidden) {
        const lastColumn = currentSection.columns.at(-1);
        lastColumn?.fields?.push?.(field);
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
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const isNonEmpty = (value: string | null | undefined): value is string => value != null && value !== '';

const createHttpClient = (config: FrappeConnectionConfig): HttpClient | undefined => {
  if (!isNonEmpty(config.baseURL)) {
    return undefined;
  }
  const authConfig: AuthConfig | undefined = config.auth
    ? {
        useToken: config.auth.useToken,
        token: config.auth.token,
        // SAFETY: the connection config types `type` loosely for consumers; it is passed through unchanged,
        // exactly as before, and HttpClient only compares it against AuthType members.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        type: config.auth.type as AuthConfig['type'],
      }
    : undefined;
  return new HttpClient(config.baseURL, authConfig);
};

/**
 * True when requests on this connection reach Frappe as Guest: it names a
 * token source, the source resolves empty (signed out), and no Frappe desk
 * session cookie names a user. A cookie-only connection names no token
 * source, so it is never judged here.
 */
const connectsAsGuest = async (auth: FrappeConnectionConfig['auth']): Promise<boolean> => {
  const source = auth?.token;
  if (!auth?.useToken || source === undefined || source === '') {
    return false;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a token source is a string or a getter; typeof is the discriminant
  const token = typeof source === 'function' ? await source() : source;
  if (isNonEmpty(token)) {
    return false;
  }
  const user = getCookie('user_id');
  return !isNonEmpty(user) || user === 'Guest';
};

const orderFields = (fields: DocTypeField[], fieldOrder: string[]): DocTypeField[] => {
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
};

const parseRawDocTypeMeta = (raw: DocTypeMeta): DocTypeMeta => {
  const fields = raw.fields.map((field) => ({ ...field }));

  // field_order may be a JSON string or an already-parsed array
  let fieldOrder: string[] | undefined;
  if (Array.isArray(raw.field_order)) {
    fieldOrder = raw.field_order;
  } else if (raw.field_order !== undefined) {
    try {
      // SAFETY: frappe serializes field_order as a JSON array of fieldnames.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      fieldOrder = JSON.parse(raw.field_order) as string[];
    } catch {
      // Malformed field_order: keep the fields in their served order.
    }
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
};

/**
 * Cache identity for a connection. A fixtures-only connection has no
 * baseURL, so it is keyed by its FixtureProvider instance instead — two
 * corpora must not share one cached DocType (the cross-test pollution the
 * SyncModule cache already avoids the same way).
 */
const fixtureConnectionIds = new WeakMap<object, string>();
let nextFixtureConnectionId = 0;

const connectionKey = (config: FrappeConnectionConfig): string => {
  if (isNonEmpty(config.baseURL)) {
    return config.baseURL;
  }
  const { fixtures } = config;
  if (!fixtures) {
    return '';
  }
  let id = fixtureConnectionIds.get(fixtures);
  if (id === undefined) {
    nextFixtureConnectionId += 1;
    id = `fixtures#${nextFixtureConnectionId}`;
    fixtureConnectionIds.set(fixtures, id);
  }
  return id;
};

/**
 * Setup pattern for a stable HttpClient ref, following the same pattern
 * used in `useDebouncedSearch` for DbModule.
 */
const httpConfigKey = (config: FrappeConnectionConfig): string => {
  const { auth } = config;
  const tokenFlag = auth?.useToken ? 't' : '';
  return `${String(config.baseURL)}:${tokenFlag}:${String(auth?.token ?? '')}:${auth?.type ?? ''}`;
};

const useHttpClientRef = (config: FrappeConnectionConfig | undefined): React.RefObject<HttpClient | undefined> => {
  // oxlint-disable-next-line unicorn/no-useless-undefined -- React 19's useRef requires an initial value
  const httpRef = useRef<HttpClient | undefined>(undefined);
  const configKeyRef = useRef('');
  const configKey = config ? httpConfigKey(config) : '';

  // The client is rebuilt during render when the connection identity changes, so effects that run this
  // commit already read the new one. Handlers and effects read these refs; render output never does.
  /* oxlint-disable react/refs, sonarjs/no-undefined-assignment -- render-synced client cache, see above */
  if (config && configKey !== configKeyRef.current) {
    httpRef.current = createHttpClient(config);
    configKeyRef.current = configKey;
  }
  if (!config) {
    httpRef.current = undefined;
    configKeyRef.current = '';
  }
  /* oxlint-enable react/refs, sonarjs/no-undefined-assignment */

  return httpRef;
};

/**
 * Raw meta from the bench: the getdoctype RPC, then the DocType document route
 * for desk-less sites. `undefined` when neither has it; `null` when
 * `isCancelled()` turned true while a request was in flight.
 */
const fetchServerMeta = async (
  http: HttpClient,
  auth: FrappeConnectionConfig['auth'],
  doctype: string,
  isCancelled: () => boolean,
): Promise<DocTypeMeta | undefined | null> => {
  // Both routes below are closed to Guest, so a signed-out reader
  // gets the 403 without the request (MPO-322).
  if (await connectsAsGuest(auth)) {
    if (isCancelled()) {
      return null;
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

  if (isCancelled()) {
    return null;
  }

  // docs[0] is the requested doctype; docs[1..] are its child tables.
  const docs = response.payload?.docs;
  const fromRpc = docs?.find((doc) => doc?.name === doctype) ?? docs?.[0];
  if (fromRpc) {
    return fromRpc;
  }

  // Sites that expose the REST API without the desk leave the RPC
  // above unregistered, so it answers with no `docs`. The document
  // route still serves meta there, and such a site's API clients are
  // typically System Managers, who may read it.
  const rest = await http.get<{ data?: DocTypeMeta }>(`/api/resource/DocType/${encodeURIComponent(doctype)}`);

  if (isCancelled()) {
    return null;
  }

  return rest.payload?.data;
};

/** Parsed meta for `doctype` from the fixture corpus or the bench; `null` when cancelled mid-flight. */
const loadDocTypeMeta = async (
  config: FrappeConnectionConfig,
  http: HttpClient | undefined,
  doctype: string,
  isCancelled: () => boolean,
): Promise<DocTypeMeta | null> => {
  // Fixture hosts (stories/tests) keep the getdoctype-shaped meta doc in
  // the provider's "DocType" collection — the same convention the
  // backoffice meta loader uses. Providers that stub only documents fall
  // through to the network below.
  let fromFixtures: DocTypeMeta | null = null;
  if (config.fixtures) {
    // SAFETY: a fixture "DocType" row is a getdoctype-shaped meta doc; `fields` is checked before it is used.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    fromFixtures = (await config.fixtures.getDoc('DocType', doctype)) as DocTypeMeta | null;
  }
  if (isCancelled()) {
    return null;
  }

  let raw = fromFixtures?.fields ? fromFixtures : undefined;

  if (!raw) {
    if (!http) {
      // Fixtures-only host: there is no server behind the corpus, so a
      // missing DocType entry is the honest end of the road.
      throw new Error(`DocType "${doctype}" is not in the fixture corpus and no baseURL is configured`);
    }
    const fetched = await fetchServerMeta(http, config.auth, doctype, isCancelled);
    if (fetched === null) {
      return null;
    }
    raw = fetched;
  }

  if (!raw) {
    throw new Error(`No data returned for DocType "${doctype}"`);
  }

  return parseRawDocTypeMeta(raw);
};

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
export const useDocTypeMeta = (config: FrappeConnectionConfig | undefined, doctype: string) => {
  const cacheKey = config ? `${connectionKey(config)}:${doctype}` : '';

  const [meta, setMeta] = useState<DocTypeMeta | undefined>(() =>
    cacheKey === '' ? undefined : metaCache.get(cacheKey),
  );
  const [isLoading, setIsLoading] = useState(
    () => Boolean(config) && doctype !== '' && !(cacheKey !== '' && metaCache.has(cacheKey)),
  );
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  // Synchronize state when cache key changes (doctype or baseURL changed)
  const prevCacheKeyRef = useRef(cacheKey);
  if (cacheKey !== prevCacheKeyRef.current) {
    prevCacheKeyRef.current = cacheKey;
    const cached = cacheKey === '' ? undefined : metaCache.get(cacheKey);
    if (cached) {
      setMeta(cached);
      setIsLoading(false);
    } else {
      setMeta(undefined);
      setIsLoading(Boolean(config) && doctype !== '');
    }
    setError(null);
  }

  const httpRef = useHttpClientRef(config);

  useEffect(() => {
    if (!config || doctype === '') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }

    const key = `${connectionKey(config)}:${doctype}`;
    // Already have cached data (synchronized during render)
    if (metaCache.has(key)) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }

    const http = httpRef.current;
    // No client AND no corpus: nothing can answer, so park rather than
    // dial `undefined` (a fixtures-only host has no baseURL by design).
    if (!http && !config.fixtures) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const parsed = await loadDocTypeMeta(config, http, doctype, () => cancelled);
        if (parsed === null) {
          return;
        }
        metaCache.set(key, parsed);
        setMeta(parsed);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
        setMeta(undefined);
      }
      setIsLoading(false);
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable cacheKey on purpose (see above)
  }, [cacheKey, version]);

  const refetch = useCallback(() => {
    if (cacheKey !== '') {
      metaCache.delete(cacheKey);
    }
    setVersion((v) => v + 1);
  }, [cacheKey]);

  return { meta, isLoading, error, refetch };
};

// ---------------------------------------------------------------------------
// Hook: useLinkSearch
// ---------------------------------------------------------------------------

/** Raw item shape returned by `frappe.desk.search.search_link` (v13: `results`, v14+: `message`). */
interface RawSearchLinkItem {
  // Autoincrement doctypes name their rows with numbers.
  value?: string | number;
  label?: string | number;
  description?: string | number | null;
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
export const useLinkSearch = (
  config: FrappeConnectionConfig | undefined,
  doctype: string,
  options?: LinkSearchOptions,
) => {
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
    const hasQuery = query !== '' || allowEmptyQuery;
    if (!http || doctype === '' || !enabled || !hasQuery) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const search = async () => {
      try {
        const [searchField] = searchFields ?? [];
        const response = await http.get<{
          message?: RawSearchLinkItem[];
          results?: RawSearchLinkItem[];
        }>('/api/method/frappe.desk.search.search_link', {
          doctype,
          txt: query,
          page_length: limit,
          // Unset keys are dropped from the query string.
          filters,
          searchfield: isNonEmpty(searchField) ? searchField : undefined,
          reference_doctype: isNonEmpty(referenceDoctype) ? referenceDoctype : undefined,
        });

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
      } catch (searchError) {
        if (cancelled) {
          return;
        }
        setError(searchError instanceof Error ? searchError : new Error(String(searchError)));
        setResults([]);
      }
      setIsLoading(false);
    };

    const timer = setTimeout(() => {
      void search();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, doctype, searchFields, filters, limit, allowEmptyQuery, enabled, debounceMs, referenceDoctype, httpRef]);

  return { results, isLoading, error };
};

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
export const useLinkTitle = (config: FrappeConnectionConfig | undefined, doctype: string, name: string | undefined) => {
  const cacheKey = config && doctype !== '' && isNonEmpty(name) ? `${String(config.baseURL)}:${doctype}:${name}` : '';
  const [title, setTitle] = useState<string | undefined>(() =>
    cacheKey === '' ? undefined : linkTitleCache.get(cacheKey),
  );
  const [isLoading, setIsLoading] = useState(false);

  const httpRef = useHttpClientRef(config);

  useEffect(() => {
    if (cacheKey === '' || !isNonEmpty(name)) {
      // oxlint-disable-next-line react/set-state-in-effect -- clears the title when the link value clears
      setTitle(undefined);
      setIsLoading(false);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }

    const cached = linkTitleCache.get(cacheKey);
    if (cached !== undefined) {
      setTitle(cached);
      setIsLoading(false);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }

    const http = httpRef.current;
    if (!http) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const response = await http.get<{ message?: string | number | null }>(
          '/api/method/frappe.desk.search.get_link_title',
          {
            doctype,
            docname: name,
          },
        );
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
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, doctype, name, httpRef]);

  return { title, isLoading };
};

// ---------------------------------------------------------------------------
// Hook: useDocTypeSearch
// ---------------------------------------------------------------------------

/** One DocType-list request for `cacheKey`; it fills the cache and clears its in-flight entry when it settles. */
const fetchDocTypeList = async (http: HttpClient, cacheKey: string): Promise<DocTypeListItem[]> => {
  try {
    const response = await http.get<{
      data?: DocTypeListItem[];
    }>('/api/resource/DocType', {
      limit_page_length: 0,
      // DocType has no `title` column; requesting it makes Frappe reject
      // the whole query ("Field not permitted in query: title")
      fields: ['name', 'module'],
    });
    const list = response.payload?.data ?? [];
    docTypeListCache.set(cacheKey, list);
    return list;
  } finally {
    docTypeListFetches.delete(cacheKey);
  }
};

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
export const useDocTypeSearch = (config: FrappeConnectionConfig | undefined, query: string) => {
  const [allDocTypes, setAllDocTypes] = useState<DocTypeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const httpRef = useHttpClientRef(config);
  const cacheKey = config?.baseURL ?? '';

  useEffect(() => {
    if (cacheKey === '') {
      // oxlint-disable-next-line react/set-state-in-effect -- clears the list when the connection goes away
      setAllDocTypes([]);
      setIsLoading(false);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }

    const cached = docTypeListCache.get(cacheKey);
    if (cached) {
      setAllDocTypes(cached);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }

    const http = httpRef.current;
    if (!http) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- see above
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Share one in-flight fetch per baseURL (Awesomebar + DeskSidebar mount
    // together). A failed fetch clears its entry so a later mount can retry;
    // the stable cacheKey dep below keeps that from looping.
    let fetchPromise = docTypeListFetches.get(cacheKey);
    if (!fetchPromise) {
      fetchPromise = fetchDocTypeList(http, cacheKey);
      docTypeListFetches.set(cacheKey, fetchPromise);
    }
    const sharedFetch = fetchPromise;

    void (async () => {
      try {
        const list = await sharedFetch;
        if (!cancelled) {
          setAllDocTypes(list);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
        }
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    })();

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
  }, [cacheKey, httpRef]);

  // Filter locally for instant results
  const results = useMemo<DocTypeSearchResult[]>(() => {
    if (query === '' || allDocTypes.length === 0) {
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
};
