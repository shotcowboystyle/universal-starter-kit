/**
 * The money column type end to end (MPO-252).
 *
 * A Frappe Currency field arrives as a decimal STRING, and before this the
 * kit had no type for that, so it fell to "text". Three consequences, all
 * asserted here: sorting was silently wrong ("9.00" above "10.00"), the
 * filter offered `contains` instead of `isGreaterThan`, and formatting could
 * only read a column-level currency constant even though a ledger mixes
 * currencies row by row.
 */

import { renderWithProviders } from '@repo/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { describe, expect, it } from 'vitest';

import type { DataTableColumn } from '../../types';
import { getDefaultColumnAlign } from '../../utils/column-align';
import { applyFilterToValue } from '../../utils/filter-utils';
import { mapFieldToFilterType, operatorsForFilterType } from '../../utils/filter-fields';

import { DataTable } from './index';

interface Posting {
  id: string;
  payee: string;
  amount: string;
  currency: string;
}

const postings: Posting[] = [
  { id: 'P-1', payee: 'Nine', amount: '9.00', currency: 'USD' },
  { id: 'P-2', payee: 'Ten', amount: '10.00', currency: 'USD' },
  { id: 'P-3', payee: 'Rupees', amount: '250.75', currency: 'INR' },
  { id: 'P-4', payee: 'Refund', amount: '-455.87', currency: 'USD' },
];

const columns: DataTableColumn<Posting>[] = [
  { id: 'payee', accessorKey: 'payee', header: 'Payee' },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: 'Amount',
    field: 'money',
    // Safe to turn on now: the money type carries an exact comparator.
    sortable: true,
    fieldProps: { currencyField: 'currency', locale: 'en-US' },
  },
];

describe('money column type', () => {
  it('maps field money → filter type money, right-aligned by default', () => {
    expect(mapFieldToFilterType('money')).toBe('money');
    expect(
      getDefaultColumnAlign({ id: 'amount', field: 'money' }),
      'a money column right-aligns without a column-level currency constant',
    ).toBe('right');
  });

  it('offers the numeric filter operators, range included', () => {
    const operators = operatorsForFilterType('money');
    expect(operators).toContain('isLessThan');
    expect(operators).toContain('isGreaterThan');
    expect(operators).toContain('isBetween');
    expect(operators, 'text operators are what a money column used to get').not.toContain('contains');
  });

  it('filters numerically on decimal strings', () => {
    const gt = { operator: 'isGreaterThan' as const, value: '9.5' };
    expect(applyFilterToValue('10.00', gt, 'money')).toBe(true);
    expect(applyFilterToValue('9.00', gt, 'money')).toBe(false);
    // The same rows through the "text" fallback are the defect: "10.00" is
    // greater than "9.5" as a number and LESS as a string, so the row that
    // should match is the one that gets dropped.
    expect(applyFilterToValue('10.00', gt, 'text')).toBe(false);

    const between = { operator: 'isBetween' as const, value: null, values: ['0', '100'] };
    expect(applyFilterToValue('10.00', between, 'money')).toBe(true);
    expect(applyFilterToValue('250.75', between, 'money')).toBe(false);
    expect(applyFilterToValue('-455.87', between, 'money')).toBe(false);

    const is = { operator: 'is' as const, value: '10' };
    expect(applyFilterToValue('10.00', is, 'money'), 'scale does not change equality').toBe(true);
  });

  it('sorts numerically in the table, not lexically', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <DataTable
        data={postings}
        columns={columns}
        layout="table"
        enablePagination={false}
        readOnly
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('$9.00')).toBeTruthy();
    });

    await user.click(screen.getByText('Amount'));
    await waitFor(() => {
      const payees = [...container.querySelectorAll('tbody tr')]
        .map((row) => row.querySelector('td')?.textContent)
        .filter((text) => text !== undefined && text !== null && text !== '');
      // Ascending: -455.87, 9.00, 10.00, 250.75. Lexically it would have been
      // -455.87, 10.00, 250.75, 9.00 — with 9.00 LAST.
      expect(payees).toStrictEqual(['Refund', 'Nine', 'Ten', 'Rupees']);
    });
  });

  it("formats from the ROW's currency, not only a column-level constant", async () => {
    renderWithProviders(
      <DataTable
        data={postings}
        columns={columns}
        layout="table"
        enablePagination={false}
        readOnly
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('$9.00')).toBeTruthy();
    });
    expect(screen.getByText('$10.00')).toBeTruthy();
    expect(screen.getByText('-$455.87')).toBeTruthy();
    // One row carries INR and renders in INR, in the same column, at the same
    // time — two currencies are two figures and neither converts.
    expect(screen.getByText('₹250.75')).toBeTruthy();
  });
});

describe('the MoneyColumn story', () => {
  it('renders mixed currencies and a per-currency footer total', async () => {
    // The story is the documented example. Rendering it here means it cannot
    // rot into something that formats one currency for every row.
    const { MoneyColumn } = await import('./DataTable.stories');
    renderWithProviders(<>{(MoneyColumn.render as () => React.ReactNode)()}</>);

    await waitFor(() => {
      expect(screen.getByText('Coffee roaster')).toBeTruthy();
    });
    expect(screen.getByText('$9.00')).toBeTruthy();
    expect(screen.getByText('₹250.75')).toBeTruthy();
    // Two totals, not one: USD 9.00 + 10.00 - 455.87 + 9.99, INR 250.75 +
    // 1200.00. Nothing converts between them.
    expect(screen.getByText('-$426.88')).toBeTruthy();
    expect(screen.getByText('₹1,450.75')).toBeTruthy();
    for (const total of ['-$426.88', '₹1,450.75']) {
      expect(screen.getByText(total).closest('td')?.dataset.align).toBe('right');
      const content = screen.getByText(total).closest<HTMLElement>('[data-cell-align="right"]')!;
      expect(content).toBeTruthy();
      expect(content.style.textAlign).toBe('right');
    }
  });
});
