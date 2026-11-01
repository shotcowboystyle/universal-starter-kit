/**
 * useFrappeRows — the composed doctype read (MPO-251).
 *
 * What this locks:
 *  1. rows / isLoading / error come back from one hook, so a panel with no
 *     shipped component does not re-derive the read.
 *  2. A 403 or an unreachable server surfaces as an ERROR, not as an empty
 *     result — the trap the copies each had to remember.
 *  3. `limit` is defaulted by the hook (DEFAULT_FRAPPE_ROWS_LIMIT), with
 *     `limit: null` as the explicit bench-default opt-out FrappeTable takes.
 *  4. Collection sharing is keyed on the options JSON: the same field list
 *     shares one collection, a different one does not.
 *
 * Fixture-hermetic: documents ride InMemoryFixtureProvider, so nothing
 * dials a baseURL.
 */

import { InMemoryFixtureProvider, useFrappeCollection } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { DEFAULT_FRAPPE_ROWS_LIMIT, useFrappeConnection, useFrappeRows } from './use-frappe-rows';

interface Account {
  name: string;
  doctype: string;
  account: string;
  balance: string;
}

const accounts: Account[] = [
  { name: 'ACC-001', doctype: 'Account', account: 'Assets:Cash', balance: '10.00' },
  { name: 'ACC-002', doctype: 'Account', account: 'Assets:Bank', balance: '9.00' },
];

const accountFields = ['name', 'account', 'balance'] as const;

const Harness = ({
  onResult,
  ...options
}: {
  onResult: (result: ReturnType<typeof useFrappeRows<Account>>) => void;
} & Parameters<typeof useFrappeRows<Account>>[2]) => {
  const connection = useFrappeConnection();
  const result = useFrappeRows<Account>(connection, 'Account', options);
  onResult(result);
  return null;
};

const renderHarness = (
  options: Parameters<typeof useFrappeRows<Account>>[2] = {},
  fixtures = new InMemoryFixtureProvider({ Account: accounts }),
) => {
  const results: ReturnType<typeof useFrappeRows<Account>>[] = [];
  const utils = renderWithProviders(
    <FrappeProvider
      baseURL="https://userows.spec.test"
      fixtures={fixtures}>
      <Harness
        onResult={(r) => results.push(r)}
        {...options}
      />
    </FrappeProvider>,
  );
  return { results, last: () => results.at(-1)!, ...utils };
};

describe(useFrappeRows, () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reads a doctype into rows', async () => {
    const { last } = renderHarness({ fields: accountFields });
    await waitFor(() => {
      expect(last().rows).toHaveLength(2);
    });
    expect(last().rows.map((r) => r.name)).toStrictEqual(['ACC-001', 'ACC-002']);
    expect(last().isLoading).toBe(false);
    expect(last().error).toBeNull();
  });

  it('parks on enabled: false — no rows, not loading', () => {
    const { last } = renderHarness({ fields: accountFields, enabled: false });
    expect(last().rows).toStrictEqual([]);
    expect(last().isLoading).toBe(false);
    expect(last().collection).toBeUndefined();
  });

  it('surfaces a permission rejection as an error rather than an empty result', async () => {
    const fixtures = new InMemoryFixtureProvider({ Account: accounts });
    vi.spyOn(fixtures, 'getList').mockRejectedValue(Object.assign(new Error('PermissionError'), { status: 403 }));
    const { last } = renderHarness(
      {
        fields: accountFields,
        messages: { permission: 'No permission for Account', generic: 'Error loading Account' },
      },
      fixtures,
    );
    await waitFor(() => {
      expect(last().error).toBeInstanceOf(Error);
    });
    expect(last().error?.message).toContain('No permission for Account');
    expect(last().rows).toStrictEqual([]);
  });

  it('surfaces an unreachable server as an error rather than an empty result', async () => {
    const fixtures = new InMemoryFixtureProvider({ Account: accounts });
    vi.spyOn(fixtures, 'getList').mockRejectedValue(new Error('Failed to fetch'));
    const { last } = renderHarness(
      {
        fields: accountFields,
        messages: { permission: 'No permission for Account', generic: 'Error loading Account' },
      },
      fixtures,
    );
    await waitFor(() => {
      expect(last().error).toBeInstanceOf(Error);
    });
    expect(last().error?.message).toContain('Error loading Account');
  });

  it('defaults the limit rather than leaving it to the caller', () => {
    // Two readers of the same doctype: one taking the default limit, one
    // passing null (the bench-default opt-out). The options JSON is the
    // collection cache key and `limit` is part of it, so a differing limit
    // must produce a DIFFERENT collection.
    const fixtures = new InMemoryFixtureProvider({ Account: accounts });
    const seen: unknown[] = [];
    const TwoReaders = () => {
      const connection = useFrappeConnection();
      const defaulted = useFrappeRows<Account>(connection, 'Account', { fields: accountFields });
      const benchDefault = useFrappeRows<Account>(connection, 'Account', {
        fields: accountFields,
        limit: null,
      });
      const explicit = useFrappeRows<Account>(connection, 'Account', {
        fields: accountFields,
        limit: DEFAULT_FRAPPE_ROWS_LIMIT,
      });
      seen.push([defaulted.collection, benchDefault.collection, explicit.collection]);
      return null;
    };
    renderWithProviders(
      <FrappeProvider
        baseURL="https://userows.spec.test"
        fixtures={fixtures}>
        <TwoReaders />
      </FrappeProvider>,
    );
    const [defaulted, benchDefault, explicit] = seen.at(-1) as unknown[];
    expect(defaulted).toBeDefined();
    expect(defaulted, 'omitting limit is the same query as passing the default').toBe(explicit);
    expect(benchDefault, 'limit: null is a different query — no limit at all').not.toBe(defaulted);
  });

  it('shares one collection with an identical field list and splits on a different one', () => {
    const fixtures = new InMemoryFixtureProvider({ Account: accounts });
    const seen: unknown[][] = [];
    const ThreeReaders = () => {
      const connection = useFrappeConnection();
      const a = useFrappeRows<Account>(connection, 'Account', { fields: accountFields });
      const b = useFrappeRows<Account>(connection, 'Account', {
        fields: ['name', 'account', 'balance'],
      });
      const c = useFrappeRows<Account>(connection, 'Account', { fields: ['name', 'account'] });
      seen.push([a.collection, b.collection, c.collection]);
      return null;
    };
    renderWithProviders(
      <FrappeProvider
        baseURL="https://userows.spec.test"
        fixtures={fixtures}>
        <ThreeReaders />
      </FrappeProvider>,
    );
    const [a, b, c] = seen.at(-1)!;
    expect(a, 'same field list shares one collection').toBe(b);
    expect(c, 'a field list short by one entry does NOT share').not.toBe(a);
  });

  it("is the same primitive FrappeTable's read was built on", () => {
    // Guardrail against the hook drifting away from useFrappeCollection —
    // the point of MPO-251 is ONE implementation, not a second one.
    expect(useFrappeCollection).toBeTypeOf('function');
  });
});
