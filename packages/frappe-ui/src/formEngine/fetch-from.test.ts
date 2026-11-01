/**
 * fetchFrom — fetch_from preview parity with desk script_manager.js
 * setup_add_fetch + link.js validate_link_and_fetch.
 */
import { describe, expect, it } from 'vitest';

import type { DocFieldMeta } from './doctype-meta';
import { applyFetchedValues, buildFetchMap, isFetchLocked } from './fetch-from';

const field = (overrides: Partial<DocFieldMeta> & { fieldname: string }): DocFieldMeta => ({
  fieldtype: 'Data',
  ...overrides,
});

describe(buildFetchMap, () => {
  it('registers scalar fieldtypes keyed by their link field', () => {
    const map = buildFetchMap([
      field({ fieldname: 'customer', fieldtype: 'Link', options: 'Customer' }),
      field({ fieldname: 'customer_name', fetch_from: 'customer.customer_name' }),
      field({ fieldname: 'territory', fieldtype: 'Select', fetch_from: 'customer.territory' }),
    ]);
    expect(map.get('customer')).toStrictEqual([
      { target: 'customer_name', source: 'customer_name', fetchIfEmpty: false },
      { target: 'territory', source: 'territory', fetchIfEmpty: false },
    ]);
  });

  it('skips fetch_from without a dot and non-registered fieldtypes', () => {
    const map = buildFetchMap([
      field({ fieldname: 'bad', fetch_from: 'customer' }),
      field({ fieldname: 'html', fieldtype: 'HTML', fetch_from: 'customer.blurb' }),
    ]);
    expect(map.size).toBe(0);
  });

  it('includes non-scalar fieldtypes when read_only (script_manager gate)', () => {
    const map = buildFetchMap([
      field({
        fieldname: 'blurb',
        fieldtype: 'HTML Editor',
        fetch_from: 'customer.blurb',
        read_only: 1,
      }),
    ]);
    expect(map.get('customer')).toHaveLength(1);
  });

  it('records fetch_if_empty', () => {
    const map = buildFetchMap([field({ fieldname: 'note', fetch_from: 'customer.note', fetch_if_empty: 1 })]);
    expect(map.get('customer')?.[0].fetchIfEmpty).toBe(true);
  });
});

describe(applyFetchedValues, () => {
  const rules = [
    { target: 'customer_name', source: 'customer_name', fetchIfEmpty: false },
    { target: 'note', source: 'note', fetchIfEmpty: true },
  ];

  it('writes fetched values onto targets', () => {
    const patch = applyFetchedValues(rules, { customer_name: 'Acme', note: 'VIP' }, {});
    expect(patch).toStrictEqual({ customer_name: 'Acme', note: 'VIP' });
  });

  it('fetch_if_empty targets keep an existing value', () => {
    const patch = applyFetchedValues(rules, { customer_name: 'Acme', note: 'VIP' }, { note: 'user wrote this' });
    expect(patch).toStrictEqual({ customer_name: 'Acme' });
  });

  it('clearing the link blanks plain targets but spares fetch_if_empty values', () => {
    const patch = applyFetchedValues(rules, {}, { customer_name: 'Acme', note: 'mine' });
    expect(patch).toStrictEqual({ customer_name: '' });
  });
});

describe(isFetchLocked, () => {
  it('locks while the source link holds a value, unless fetch_if_empty', () => {
    const target = field({ fieldname: 'customer_name', fetch_from: 'customer.customer_name' });
    expect(isFetchLocked(target, { customer: 'CUST-1' })).toBe(true);
    expect(isFetchLocked(target, {})).toBe(false);
    const softTarget = field({
      fieldname: 'note',
      fetch_from: 'customer.note',
      fetch_if_empty: 1,
    });
    expect(isFetchLocked(softTarget, { customer: 'CUST-1' })).toBe(false);
  });
});
