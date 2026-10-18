import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HttpClient, HttpResponse } from './core/http';
import type { DocTypeField, FrappeFieldType } from './doctype';
import {
  customFieldTypes,
  frappeFieldTypes,
  parseDependsOn,
  parseFormLayout,
  stockFieldTypes,
  useDocTypeMeta,
  useLinkSearch,
  useLinkTitle,
  useDocTypeSearch,
} from './doctype';

// ---------------------------------------------------------------------------
// Shared HTTP mock
// ---------------------------------------------------------------------------

const mockGetFn = vi.fn<(...args: unknown[]) => Promise<Partial<HttpResponse<unknown>>>>();

vi.mock(import('./core/http'), () => {
  class MockHttpClient {
    get = mockGetFn;
  }
  // SAFETY: the hooks under test only construct the client and call its `get`.
  return { HttpClient: MockHttpClient as unknown as typeof HttpClient };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const field = (
  fieldname: string,
  fieldtype: DocTypeField['fieldtype'],
  extra: Partial<DocTypeField> = {},
): DocTypeField => ({ fieldname, fieldtype, ...extra });

// Use unique doctype names per test to avoid metaCache collisions
let testId = 0;
// oxlint-disable-next-line vitest/require-top-level-describe -- the mock reset and per-test doctype id apply to every suite in this file
beforeEach(() => {
  testId += 1;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// FrappeFieldType
// ---------------------------------------------------------------------------

describe('the FrappeFieldType union', () => {
  it('includes Button (desk action field, not a layout break)', () => {
    const fieldtype: FrappeFieldType = 'Button';
    expect(frappeFieldTypes).toContain(fieldtype);
    const action = field('make_payment_entry', 'Button', { label: 'Make Payment Entry' });
    expect(action.fieldtype).toBe('Button');
  });

  it("is the one list of fieldtypes: every stock type plus the registry's custom ones", () => {
    expect(frappeFieldTypes).toStrictEqual([...stockFieldTypes, ...customFieldTypes]);
    expect(new Set(frappeFieldTypes).size).toBe(frappeFieldTypes.length);
    expect(stockFieldTypes).toContain('Fold');
    expect(stockFieldTypes).toHaveLength(43);
    const fold: FrappeFieldType = 'Fold';
    const toggle: FrappeFieldType = 'Toggle Group';
    expect([fold, toggle].every((t) => frappeFieldTypes.includes(t))).toBe(true);
    // @ts-expect-error a fieldtype outside the union is not a DocTypeField
    field('bogus', 'Not A Fieldtype');
  });
});

// ---------------------------------------------------------------------------
// parseDependsOn
// ---------------------------------------------------------------------------

describe(parseDependsOn, () => {
  it('returns always-true when expression is undefined', () => {
    const fn = parseDependsOn();
    expect(fn({})).toBe(true);
    expect(fn({ status: 'anything' })).toBe(true);
  });

  it('returns always-true for empty string', () => {
    const fn = parseDependsOn('');
    expect(fn({})).toBe(true);
  });

  it('evaluates eval: prefixed JS equality expression', () => {
    const fn = parseDependsOn('eval:doc.status=="Active"');
    expect(fn({ status: 'Active' })).toBe(true);
    expect(fn({ status: 'Inactive' })).toBe(false);
    expect(fn({})).toBe(false);
  });

  it('evaluates compound eval: expressions with &&', () => {
    const fn = parseDependsOn('eval:doc.a && doc.b');
    expect(fn({ a: 'x', b: 'y' })).toBe(true);
    expect(fn({ a: 'x', b: '' })).toBe(false);
    expect(fn({ a: '', b: 'y' })).toBe(false);
  });

  it('evaluates numeric comparisons in eval:', () => {
    const fn = parseDependsOn('eval:doc.count > 0');
    expect(fn({ count: 5 })).toBe(true);
    expect(fn({ count: 0 })).toBe(false);
  });

  it('evaluates doc.field style expression (without eval: prefix)', () => {
    const fn = parseDependsOn('doc.enabled');
    expect(fn({ enabled: true })).toBe(true);
    expect(fn({ enabled: false })).toBe(false);
    expect(fn({ enabled: 'yes' })).toBe(true);
    expect(fn({})).toBe(false);
  });

  it('evaluates bare field name as truthy check on doc[fieldname]', () => {
    const fn = parseDependsOn('is_active');
    expect(fn({ is_active: true })).toBe(true);
    expect(fn({ is_active: 1 })).toBe(true);
    expect(fn({ is_active: false })).toBe(false);
    expect(fn({})).toBe(false);
  });

  it('returns false (never throws) for an invalid eval: expression', () => {
    const fn = parseDependsOn('eval:!!! invalid syntax');
    expect(() => fn({})).not.toThrow();
    expect(fn({})).toBe(false);
  });

  it('returns false (never throws) when expression accesses nested undefined', () => {
    const fn = parseDependsOn('eval:doc.nested.deep.value');
    expect(() => fn({})).not.toThrow();
    expect(fn({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseFormLayout
// ---------------------------------------------------------------------------

describe(parseFormLayout, () => {
  it('returns one empty section for an empty field list', () => {
    const sections = parseFormLayout([]);
    expect(sections).toHaveLength(1);
    expect(sections[0].columns).toHaveLength(1);
    expect(sections[0].columns[0].fields).toHaveLength(0);
    expect(sections[0].tab).toBeUndefined();
  });

  it('adds regular fields to the current column', () => {
    const fields = [field('name', 'Data'), field('status', 'Select')];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(1);
    expect(sections[0].columns[0].fields).toStrictEqual(fields);
  });

  it('skips hidden fields', () => {
    const fields = [field('visible', 'Data'), field('secret', 'Data', { hidden: 1 })];
    const sections = parseFormLayout(fields);
    expect(sections[0].columns[0].fields).toHaveLength(1);
    expect(sections[0].columns[0].fields[0].fieldname).toBe('visible');
  });

  it('starts a new section on Section Break', () => {
    const fields = [
      field('field1', 'Data'),
      field('sec', 'Section Break', { label: 'Details', collapsible: 1 }),
      field('field2', 'Data'),
    ];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(2);
    expect(sections[1].label).toBe('Details');
    expect(sections[1].collapsible).toBe(true);
    expect(sections[1].columns[0].fields[0].fieldname).toBe('field2');
  });

  it('adds a new column on Column Break within the current section', () => {
    const fields = [field('left', 'Data'), field('cb', 'Column Break'), field('right', 'Data')];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(1);
    expect(sections[0].columns).toHaveLength(2);
    expect(sections[0].columns[0].fields[0].fieldname).toBe('left');
    expect(sections[0].columns[1].fields[0].fieldname).toBe('right');
  });

  it('starts a new section with tab=true on Tab Break', () => {
    const fields = [field('field1', 'Data'), field('tab1', 'Tab Break', { label: 'Tab 1' }), field('field2', 'Data')];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(2);
    expect(sections[1].tab).toBe(true);
    expect(sections[1].label).toBe('Tab 1');
    expect(sections[1].columns[0].fields[0].fieldname).toBe('field2');
  });

  it('handles complex layout: multiple sections each with multiple columns', () => {
    const fields = [
      field('name', 'Data'),
      field('sec1', 'Section Break', { label: 'Section 1' }),
      field('a', 'Data'),
      field('cb', 'Column Break'),
      field('b', 'Data'),
      field('sec2', 'Section Break', { label: 'Section 2' }),
      field('c', 'Data'),
    ];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(3);
    expect(sections[0].columns[0].fields[0].fieldname).toBe('name');
    expect(sections[1].label).toBe('Section 1');
    expect(sections[1].columns).toHaveLength(2);
    expect(sections[1].columns[0].fields[0].fieldname).toBe('a');
    expect(sections[1].columns[1].fields[0].fieldname).toBe('b');
    expect(sections[2].label).toBe('Section 2');
    expect(sections[2].columns[0].fields[0].fieldname).toBe('c');
  });

  it('Column Break at the start of a Section creates an empty first column', () => {
    const fields = [field('sec', 'Section Break'), field('cb', 'Column Break'), field('right', 'Data')];
    const sections = parseFormLayout(fields);
    // The implicit fieldless leading section is dropped, so "sec" is first.
    expect(sections).toHaveLength(1);
    expect(sections[0].columns).toHaveLength(2);
    expect(sections[0].columns[0].fields).toHaveLength(0);
    expect(sections[0].columns[1].fields[0].fieldname).toBe('right');
  });

  it('drops the empty implicit section when meta starts with a Section Break', () => {
    const fields = [field('sec', 'Section Break', { label: 'Details' }), field('field1', 'Data')];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Details');
    expect(sections[0].columns[0].fields[0].fieldname).toBe('field1');
  });

  it('drops a leading section whose fields are all hidden', () => {
    const fields = [
      field('secret', 'Data', { hidden: 1 }),
      field('sec', 'Section Break', { label: 'Details' }),
      field('field1', 'Data'),
    ];
    const sections = parseFormLayout(fields);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Details');
  });

  it('drops consecutive empty leading sections but keeps interior empty sections', () => {
    const fields = [
      field('sec0', 'Section Break'),
      field('sec1', 'Section Break', { label: 'First Real' }),
      field('field1', 'Data'),
      field('sec2', 'Section Break', { label: 'Interior Empty' }),
      field('sec3', 'Section Break', { label: 'Last' }),
      field('field2', 'Data'),
    ];
    const sections = parseFormLayout(fields);
    expect(sections.map((s) => s.label)).toStrictEqual(['First Real', 'Interior Empty', 'Last']);
  });

  it('keeps one section for a fieldless doctype', () => {
    const sections = parseFormLayout([field('secret', 'Data', { hidden: 1 })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].columns[0].fields).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// useDocTypeMeta
// ---------------------------------------------------------------------------

const rawDocType = (name: string) => ({
  name,
  module: 'Core',
  sort_field: 'modified',
  sort_order: 'DESC',
  fields: [
    { fieldname: 'name', fieldtype: 'Data', label: 'Name' },
    { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Active\nInactive' },
  ],
  permissions: [{ role: 'System Manager', read: 1, write: 1 }],
});

describe(useDocTypeMeta, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts loading and resolves with parsed meta', async () => {
    const doctype = `DocA${testId}`;
    // Config must be stable (defined outside renderHook) — hooks with [config]
    // in deps loop infinitely if a new object is created on every render.
    const config = { baseURL: `https://meta-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { docs: [rawDocType(doctype)] } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.meta).toBeDefined();
    expect(result.current.meta!.name).toBe(doctype);
    expect(result.current.meta!.fields).toHaveLength(2);
    expect(result.current.meta!.permissions?.[0]?.read).toBe(1);
  });

  // FrappeForm read this hook's meta, and the old parse copied seventeen keys
  // and dropped the rest, so permlevel, fetch_from, set_only_once and the
  // *_depends_on chains never reached a form. The meta is the server's own
  // now, keys and 0|1 flags alike.
  it('keeps every key the server sends, on the fields and on the meta', async () => {
    const doctype = `DocLossless${testId}`;
    const config = { baseURL: `https://meta-lossless-${testId}.example.com` };
    const raw = {
      ...rawDocType(doctype),
      is_submittable: 1,
      links: [{ link_doctype: 'Payment Entry', link_fieldname: 'reference_name', group: null }],
      fields: [
        {
          fieldname: 'customer',
          fieldtype: 'Link',
          options: 'Customer',
          required: 1,
          set_only_once: 1,
          permlevel: 1,
        },
        { fieldname: 'customer_name', fieldtype: 'Data', fetch_from: 'customer.customer_name' },
        {
          fieldname: 'po_no',
          fieldtype: 'Data',
          mandatory_depends_on: 'eval:doc.is_export',
          read_only_depends_on: 'eval:doc.docstatus==1',
          allow_on_submit: 1,
        },
        { fieldname: 'more', fieldtype: 'Section Break', collapsible_depends_on: 'po_no' },
      ],
    };
    mockGetFn.mockResolvedValueOnce({ payload: { docs: [raw] } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const meta = result.current.meta!;
    expect(meta.is_submittable).toBe(1);
    expect(meta.links?.[0]?.link_doctype).toBe('Payment Entry');
    const byName = Object.fromEntries(meta.fields.map((f) => [f.fieldname, f]));
    expect(byName.customer).toMatchObject({ required: 1, set_only_once: 1, permlevel: 1 });
    expect(byName.customer_name.fetch_from).toBe('customer.customer_name');
    expect(byName.po_no).toMatchObject({
      mandatory_depends_on: 'eval:doc.is_export',
      read_only_depends_on: 'eval:doc.docstatus==1',
      allow_on_submit: 1,
    });
    expect(byName.more.collapsible_depends_on).toBe('po_no');
    expect(meta.fields[0]).not.toBe(raw.fields[0]);
  });

  // The REST route reads the DocType *document* — System-Manager-only, so
  // ordinary users got a 403 traceback instead of a form. Assert the endpoint
  // itself, not just that meta parsed: only the URL distinguishes the two.
  it('loads meta over the whitelisted getdoctype RPC, not the DocType resource route', async () => {
    const doctype = `DocRpc${testId}`;
    const config = { baseURL: `https://meta-rpc-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { docs: [rawDocType(doctype)] } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetFn).toHaveBeenCalledWith('/api/method/frappe.desk.form.load.getdoctype', {
      doctype,
    });
    const requestedPaths = mockGetFn.mock.calls.map((call) => String(call[0]));
    expect(requestedPaths.some((path) => path.includes('/api/resource/DocType/'))).toBe(false);
  });

  it('falls back to the DocType document route when the RPC returns no docs', async () => {
    const doctype = `DocFallback${testId}`;
    const config = { baseURL: `https://meta-fallback-${testId}.example.com` };
    // desk RPCs unregistered → the call resolves, but carries no `docs`
    mockGetFn.mockResolvedValueOnce({ payload: {} });
    mockGetFn.mockResolvedValueOnce({ payload: { data: rawDocType(doctype) } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.meta!.name).toBe(doctype);
    expect(mockGetFn.mock.calls.map((call) => String(call[0]))).toStrictEqual([
      '/api/method/frappe.desk.form.load.getdoctype',
      `/api/resource/DocType/${doctype}`,
    ]);
  });

  it('picks the requested doctype out of a bundle that also carries child tables', async () => {
    const doctype = `DocParent${testId}`;
    const config = { baseURL: `https://meta-bundle-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({
      payload: { docs: [rawDocType(`${doctype} Child`), rawDocType(doctype)] },
    });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.meta!.name).toBe(doctype);
  });

  it("reads meta from the fixture provider's DocType collection without any request", async () => {
    const doctype = `DocFix${testId}`;
    const fixtures = {
      getDoc: vi.fn<() => Promise<ReturnType<typeof rawDocType>>>(async () => rawDocType(doctype)),
    } as unknown as NonNullable<Parameters<typeof useDocTypeMeta>[0]>['fixtures'];
    const config = { baseURL: `https://meta-fix-${testId}.example.com`, fixtures };

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.meta!.name).toBe(doctype);
    expect(mockGetFn).not.toHaveBeenCalled();
  });

  it('falls through to the RPC when the fixture provider has no meta for the doctype', async () => {
    const doctype = `DocFixMiss${testId}`;
    const fixtures = {
      getDoc: vi.fn<() => Promise<null>>(async () => null),
    } as unknown as NonNullable<Parameters<typeof useDocTypeMeta>[0]>['fixtures'];
    const config = { baseURL: `https://meta-fixmiss-${testId}.example.com`, fixtures };
    mockGetFn.mockResolvedValueOnce({ payload: { docs: [rawDocType(doctype)] } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.meta!.name).toBe(doctype);
    expect(mockGetFn).toHaveBeenCalledWith('/api/method/frappe.desk.form.load.getdoctype', {
      doctype,
    });
  });

  it('sets error state when the fetch fails', async () => {
    const doctype = `DocB${testId}`;
    const config = { baseURL: `https://meta-err-${testId}.example.com` };
    mockGetFn.mockRejectedValueOnce(new Error('Not found'));

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.meta).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Not found');
  });

  // MPO-322: getdoctype and the DocType document are closed to Guest, so a
  // signed-out visitor's meta read was a certain 403 in the browser log.
  describe('signed out', () => {
    const signedOut = { useToken: true, type: 'Bearer', token: async () => '' };

    afterEach(() => {
      // oxlint-disable-next-line unicorn/no-document-cookie -- seeds the jsdom cookie jar getCookie reads
      document.cookie = 'user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });

    it('never asks for meta when the token source resolves empty', async () => {
      const doctype = `DocGuest${testId}`;
      const config = { baseURL: `https://meta-guest-${testId}.example.com`, auth: signedOut };

      const { result } = renderHook(() => useDocTypeMeta(config, doctype));
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetFn).not.toHaveBeenCalled();
      expect(result.current.meta).toBeUndefined();
      expect(result.current.error).toMatchObject({ status: 403 });
    });

    it('still reads fixture meta', async () => {
      const doctype = `DocGuestFix${testId}`;
      const fixtures = {
        getDoc: vi.fn<() => Promise<ReturnType<typeof rawDocType>>>(async () => rawDocType(doctype)),
      } as unknown as NonNullable<Parameters<typeof useDocTypeMeta>[0]>['fixtures'];
      const config = {
        baseURL: `https://meta-guest-fix-${testId}.example.com`,
        auth: signedOut,
        fixtures,
      };

      const { result } = renderHook(() => useDocTypeMeta(config, doctype));
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meta!.name).toBe(doctype);
      expect(mockGetFn).not.toHaveBeenCalled();
    });

    it('asks when a token resolves', async () => {
      const doctype = `DocSignedIn${testId}`;
      const config = {
        baseURL: `https://meta-signed-in-${testId}.example.com`,
        auth: { ...signedOut, token: async () => 'jwt' },
      };
      mockGetFn.mockResolvedValueOnce({ payload: { docs: [rawDocType(doctype)] } });

      const { result } = renderHook(() => useDocTypeMeta(config, doctype));
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meta!.name).toBe(doctype);
    });

    it('asks when a Frappe desk session names a user', async () => {
      // oxlint-disable-next-line unicorn/no-document-cookie -- seeds the jsdom cookie jar getCookie reads
      document.cookie = 'user_id=desk%40example.com; path=/';
      const doctype = `DocDesk${testId}`;
      const config = { baseURL: `https://meta-desk-${testId}.example.com`, auth: signedOut };
      mockGetFn.mockResolvedValueOnce({ payload: { docs: [rawDocType(doctype)] } });

      const { result } = renderHook(() => useDocTypeMeta(config, doctype));
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.meta!.name).toBe(doctype);
    });

    it('asks on a cookie connection, which names no token source', async () => {
      const doctype = `DocCookie${testId}`;
      const config = { baseURL: `https://meta-cookie-${testId}.example.com` };
      mockGetFn.mockRejectedValueOnce(Object.assign(new Error('Not permitted'), { status: 403 }));

      const { result } = renderHook(() => useDocTypeMeta(config, doctype));
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetFn).toHaveBeenCalledOnce();
    });
  });

  it('returns undefined meta and isLoading=false when config is undefined', () => {
    const { result } = renderHook(() => useDocTypeMeta(undefined, 'AnyDoc'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.meta).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('parses field_order to reorder fields', async () => {
    const doctype = `DocC${testId}`;
    const config = { baseURL: `https://meta-order-${testId}.example.com` };
    const raw = {
      ...rawDocType(doctype),
      // reversed
      field_order: ['status', 'name'],
    };
    mockGetFn.mockResolvedValueOnce({ payload: { docs: [raw] } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.meta!.fields[0].fieldname).toBe('status');
    expect(result.current.meta!.fields[1].fieldname).toBe('name');
  });

  it('refetch() clears cache and re-fetches', async () => {
    const doctype = `DocD${testId}`;
    const config = { baseURL: `https://meta-refetch-${testId}.example.com` };
    mockGetFn.mockResolvedValue({ payload: { docs: [rawDocType(doctype)] } });

    const { result } = renderHook(() => useDocTypeMeta(config, doctype));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetFn).toHaveBeenCalledOnce();

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGetFn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// useLinkSearch — stock search_link contract
// ---------------------------------------------------------------------------

describe(useLinkSearch, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty results with no request when the query is empty (default)', async () => {
    const config = { baseURL: `https://link-${testId}.example.com` };

    const { result } = renderHook(() => useLinkSearch(config, 'Customer', { query: '' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.results).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetFn).not.toHaveBeenCalled();
  });

  it('calls frappe.desk.search.search_link with doctype/txt/page_length/filters', async () => {
    const config = { baseURL: `https://link2-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({
      payload: {
        message: [
          { value: 'CUST-001', description: 'Acme Corp' },
          { value: 'CUST-002', description: 'Beta Inc' },
        ],
      },
    });

    const filters = { disabled: 0 };
    const { result } = renderHook(() => useLinkSearch(config, 'Customer', { query: 'acme', limit: 10, filters }));

    // runAllTimersAsync advances the debounce timer AND flushes the fetch.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGetFn).toHaveBeenCalledExactlyOnceWith('/api/method/frappe.desk.search.search_link', {
      doctype: 'Customer',
      txt: 'acme',
      page_length: 10,
      filters,
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.results).toStrictEqual([
      { value: 'CUST-001', label: 'CUST-001', description: 'Acme Corp' },
      { value: 'CUST-002', label: 'CUST-002', description: 'Beta Inc' },
    ]);
  });

  it('uses the server label when present (show_title_field_in_link doctypes)', async () => {
    const config = { baseURL: `https://link-label-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({
      payload: { message: [{ value: 'u@x.com', label: 'User X', description: 'User X' }] },
    });

    const { result } = renderHook(() => useLinkSearch(config, 'User', { query: 'x' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.results).toStrictEqual([{ value: 'u@x.com', label: 'User X', description: 'User X' }]);
  });

  it('debounces: rapid query changes produce a single request with the final txt', async () => {
    const config = { baseURL: `https://link-deb-${testId}.example.com` };
    mockGetFn.mockResolvedValue({ payload: { message: [] } });

    const { rerender } = renderHook(({ query }: { query: string }) => useLinkSearch(config, 'Customer', { query }), {
      initialProps: { query: 'a' },
    });

    // Retype twice within the 300ms debounce window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ query: 'ac' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ query: 'acm' });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGetFn).toHaveBeenCalledOnce();
    expect(mockGetFn.mock.calls[0][1]).toMatchObject({ txt: 'acm' });
  });

  it('fetches the first page for an empty query when allowEmptyQuery is set', async () => {
    const config = { baseURL: `https://link-empty-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({
      payload: { message: [{ value: 'CUST-001', description: 'Acme' }] },
    });

    const { result } = renderHook(() => useLinkSearch(config, 'Customer', { query: '', allowEmptyQuery: true }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGetFn).toHaveBeenCalledOnce();
    expect(mockGetFn.mock.calls[0][1]).toMatchObject({ txt: '' });
    expect(result.current.results).toHaveLength(1);
  });

  it('does not fetch when disabled via enabled=false', async () => {
    const config = { baseURL: `https://link-dis-${testId}.example.com` };

    const { result } = renderHook(() => useLinkSearch(config, 'Customer', { query: 'acme', enabled: false }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockGetFn).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(0);
  });

  it('surfaces permission failures as error state (403 FrappeError)', async () => {
    const config = { baseURL: `https://link-perm-${testId}.example.com` };
    const permissionError = Object.assign(new Error('Insufficient Permission'), { status: 403 });
    mockGetFn.mockRejectedValueOnce(permissionError);

    const { result } = renderHook(() => useLinkSearch(config, 'Customer', { query: 'x' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as { status?: number }).status).toBe(403);
    expect(result.current.results).toHaveLength(0);
  });

  it('sets error state on fetch failure', async () => {
    const config = { baseURL: `https://link-err-${testId}.example.com` };
    mockGetFn.mockRejectedValueOnce(new Error('Search failed'));

    const { result } = renderHook(() => useLinkSearch(config, 'Customer', { query: 'x' }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// useLinkTitle
// ---------------------------------------------------------------------------

describe(useLinkTitle, () => {
  it('fetches the display title via get_link_title on mount', async () => {
    const config = { baseURL: `https://title-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { message: 'Jane Doe' } });

    const { result } = renderHook(() => useLinkTitle(config, 'User', 'jane@x.com'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetFn).toHaveBeenCalledWith('/api/method/frappe.desk.search.get_link_title', {
      doctype: 'User',
      docname: 'jane@x.com',
    });
    expect(result.current.title).toBe('Jane Doe');
  });

  it('serves repeat lookups from the session cache (single request)', async () => {
    const config = { baseURL: `https://title-cache-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { message: 'Jane Doe' } });

    const first = renderHook(() => useLinkTitle(config, 'User', 'jane@x.com'));
    await waitFor(() => {
      expect(first.result.current.title).toBe('Jane Doe');
    });

    const second = renderHook(() => useLinkTitle(config, 'User', 'jane@x.com'));
    expect(second.result.current.title).toBe('Jane Doe');
    expect(mockGetFn).toHaveBeenCalledOnce();
  });

  it('falls back to the raw name on fetch failure', async () => {
    const config = { baseURL: `https://title-err-${testId}.example.com` };
    mockGetFn.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useLinkTitle(config, 'User', 'jane@x.com'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.title).toBe('jane@x.com');
  });

  it('returns undefined when there is no value', () => {
    const config = { baseURL: `https://title-none-${testId}.example.com` };
    const { result } = renderHook(() =>
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
      useLinkTitle(config, 'User', undefined),
    );
    expect(result.current.title).toBeUndefined();
    expect(mockGetFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useDocTypeSearch
// ---------------------------------------------------------------------------

describe(useDocTypeSearch, () => {
  const docTypeList = [
    { name: 'Customer', module: 'Selling', title: 'Customer' },
    { name: 'Sales Order', module: 'Selling', title: 'Sales Order' },
    { name: 'Item', module: 'Stock', title: 'Item' },
  ];

  it('returns empty results when config is undefined', () => {
    const { result } = renderHook(() => useDocTypeSearch(undefined, 'customer'));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty results when query is empty (even with loaded list)', async () => {
    const config = { baseURL: `https://search-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { data: docTypeList } });

    const { result } = renderHook(() => useDocTypeSearch(config, ''));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.results).toHaveLength(0);
  });

  it('filters DocType list locally by name and returns list/report/new suggestions', async () => {
    const config = { baseURL: `https://search2-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { data: docTypeList } });

    const { result } = renderHook(() => useDocTypeSearch(config, 'customer'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const types = result.current.results.map((r) => r.type);
    expect(types).toContain('list');
    expect(types).toContain('report');
    expect(types).toContain('new');

    const doctypes = result.current.results.map((r) => r.doctype);
    expect(doctypes.every((d) => d === 'Customer')).toBe(true);
  });

  it('matches on module name as well as doctype name', async () => {
    const config = { baseURL: `https://search3-${testId}.example.com` };
    mockGetFn.mockResolvedValueOnce({ payload: { data: docTypeList } });

    const { result } = renderHook(() => useDocTypeSearch(config, 'stock'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const doctypes = [...new Set(result.current.results.map((r) => r.doctype))];
    expect(doctypes).toContain('Item');
  });

  it('fetches once even when the caller allocates a new config object every render and the fetch fails', async () => {
    // The desk callers (Awesomebar, DeskSidebar) build a fresh config per
    // render. Before keying the fetch effect on the stable baseURL string,
    // a failing fetch (Guest 403 — never cached) re-ran per render and spun
    // into an infinite refetch loop against the bench.
    const baseURL = `https://search-403-${testId}.example.com`;
    mockGetFn.mockRejectedValue(new Error('403 PermissionError'));

    const { result, rerender } = renderHook(
      // a fresh object per render, like the real call sites
      () => useDocTypeSearch({ baseURL }, 'customer'),
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    rerender();
    rerender();
    rerender();
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetFn).toHaveBeenCalledOnce();
    expect(result.current.results).toHaveLength(0);
  });

  it('shares one in-flight fetch between concurrent consumers of the same baseURL', async () => {
    // Awesomebar and DeskSidebar mount together on the desk; the DocType
    // catalog must be fetched once, not once per consumer.
    const config = { baseURL: `https://search-shared-${testId}.example.com` };
    mockGetFn.mockResolvedValue({ payload: { data: docTypeList } });

    const first = renderHook(() => useDocTypeSearch(config, 'customer'));
    const second = renderHook(() => useDocTypeSearch(config, ' '));

    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false);
    });
    await waitFor(() => {
      expect(second.result.current.isLoading).toBe(false);
    });

    expect(mockGetFn).toHaveBeenCalledOnce();
    expect(first.result.current.results.length).toBeGreaterThan(0);
    expect(second.result.current.results.length).toBeGreaterThan(0);
  });
});
