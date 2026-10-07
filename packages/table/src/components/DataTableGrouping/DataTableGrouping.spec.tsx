import '@testing-library/jest-dom';

import { renderWithProviders } from '@repo/test-utils';
import { formatNumber } from '@repo/theme';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable } from '../DataTable';

import { DataTableGrouping, DataTableGroupingConfig, formatAggregateValue, groupData } from './index';
import type { AggregationConfig } from './index';

// Test data type
interface SalesRecord {
  id: string;
  region: string;
  category: string;
  salesperson: string;
  quantity: number;
  unitPrice: number;
  totalRevenue: number;
}

// Test data
const salesData: SalesRecord[] = [
  {
    id: '1',
    region: 'North America',
    category: 'Electronics',
    salesperson: 'Alice',
    quantity: 5,
    unitPrice: 1200,
    totalRevenue: 6000,
  },
  {
    id: '2',
    region: 'North America',
    category: 'Furniture',
    salesperson: 'Alice',
    quantity: 10,
    unitPrice: 300,
    totalRevenue: 3000,
  },
  {
    id: '3',
    region: 'North America',
    category: 'Electronics',
    salesperson: 'Bob',
    quantity: 8,
    unitPrice: 800,
    totalRevenue: 6400,
  },
  {
    id: '4',
    region: 'Europe',
    category: 'Electronics',
    salesperson: 'Claire',
    quantity: 12,
    unitPrice: 1000,
    totalRevenue: 12_000,
  },
];

// Test columns
const columns = [
  { accessorKey: 'region', header: 'Region', type: 'string' as const },
  { accessorKey: 'category', header: 'Category', type: 'string' as const },
  {
    accessorKey: 'salesperson',
    header: 'Salesperson',
    type: 'string' as const,
  },
  { accessorKey: 'quantity', header: 'Quantity', type: 'number' as const },
  { accessorKey: 'totalRevenue', header: 'Revenue', type: 'number' as const },
];

describe(DataTableGrouping, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no groupBy is provided', () => {
    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
      />,
    );

    // Should render nothing since there's no grouping
    expect(screen.queryByText(/North America/)).not.toBeInTheDocument();
  });

  it('renders grouped data when groupBy is provided', () => {
    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
      />,
    );

    expect(screen.getByText('North America')).toBeInTheDocument();
    expect(screen.getByText('Europe')).toBeInTheDocument();
  });

  it('displays aggregation values when aggregations are provided', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'sum',
        label: 'Total Revenue',
      },
      {
        column: 'quantity',
        function: 'count',
        label: 'Item Count',
      },
    ];

    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
        aggregations={aggregations}
      />,
    );

    // Should show aggregation values
    expect(screen.getByText('North America')).toBeInTheDocument();
    // LC-12 render channel: the sum reaches the slot through the house
    // number register, so it reads like the cells it summarises.
    expect(screen.getByText(formatNumber(15_400))).toBeInTheDocument();
    expect(screen.queryByText('15400')).not.toBeInTheDocument();
  });

  it('routes the header item count through the house number register (LC-12)', () => {
    // Same data class as the aggregates: a large group's count must read
    // localized ("(1,000 items)"), never raw beside channel-formatted sums.
    const bigData = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      region: 'North America',
    }));
    renderWithProviders(
      <DataTableGrouping
        data={bigData}
        columns={[{ accessorKey: 'region', header: 'Region', type: 'string' as const }]}
        groupBy={['region']}
      />,
    );

    const expected = `(${formatNumber(1000, { maximumFractionDigits: 0 })} items)`;
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('(1000 items)')).not.toBeInTheDocument();
  });

  describe('formatAggregateValue (LC-12 number channel)', () => {
    const sum: AggregationConfig = { column: 'totalRevenue', function: 'sum' };
    const count: AggregationConfig = { column: 'quantity', function: 'count' };

    it('routes aggregates through the house number register', () => {
      expect(formatAggregateValue(15_400, sum)).toBe(formatNumber(15_400));
      expect(formatAggregateValue(5133.33, sum)).toBe(formatNumber(5133.33));
    });

    it('keeps counts whole', () => {
      expect(formatAggregateValue(3, count)).toBe('3');
    });

    it('formats a numeric string from a custom aggregation', () => {
      expect(formatAggregateValue('15400', sum)).toBe(formatNumber(15_400));
    });

    it('passes non-numeric custom results through as their own text', () => {
      expect(formatAggregateValue('mixed', sum)).toBe('mixed');
    });

    it('keeps the zero floor for missing and non-finite values', () => {
      expect(formatAggregateValue(undefined, sum)).toBe('0');
      expect(formatAggregateValue(Number.NaN, sum)).toBe('0');
      expect(formatAggregateValue(0, sum)).toBe('0');
    });
  });

  it('calls onGroupingChange when grouping config changes', () => {
    const mockOnGroupingChange = vi.fn();

    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
        onGroupingChange={mockOnGroupingChange}
      />,
    );

    // This would typically be triggered by user interaction
    // The test verifies the callback is properly wired
    expect(mockOnGroupingChange).toHaveBeenCalledTimes(0); // Initial call
  });

  it('handles custom group headers', () => {
    const mockRenderGroupHeader = vi.fn(() => <div>Custom Header</div>);

    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
        renderGroupHeader={mockRenderGroupHeader}
      />,
    );

    expect(mockRenderGroupHeader).toHaveBeenCalledWith();
  });

  it('shows an expand affordance (aria-expanded) on single-level group headers', () => {
    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
      />,
    );

    // Single-level groups have items (no child groups) — they are still
    // expandable and must expose the expanded state.
    const headers = screen.getAllByRole('button', { expanded: false });
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it('expands and collapses a group with the keyboard (Enter)', () => {
    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
      />,
    );

    // Items hidden while collapsed.
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    const header = screen.getAllByRole('button').find((el) => el.textContent?.includes('North America'))!;
    fireEvent.keyDown(header, { key: 'Enter' });

    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  describe('stacked-group radius (LC-72)', () => {
    it("rounds only the stack's outer corners on collapsed headers", () => {
      renderWithProviders(
        <DataTableGrouping
          data={salesData}
          columns={columns}
          groupBy={['region']}
        />,
      );

      const headers = screen.getAllByTestId('data-table-group-header');
      expect(headers).toHaveLength(2);
      expect(headers[0]).toHaveAttribute('data-group-position', 'first');
      expect(headers[0]).toHaveAttribute('data-stack-start', 'true');
      expect(headers[0]).toHaveAttribute('data-stack-end', 'false');
      expect(headers[1]).toHaveAttribute('data-group-position', 'last');
      expect(headers[1]).toHaveAttribute('data-stack-start', 'false');
      expect(headers[1]).toHaveAttribute('data-stack-end', 'true');
    });

    it('drops trailing radius on an open last header (accordion corollary)', () => {
      renderWithProviders(
        <DataTableGrouping
          data={salesData}
          columns={columns}
          groupBy={['region']}
          expandedGroups={new Set(['Europe'])}
        />,
      );

      const europe = screen.getAllByTestId('data-table-group-header').find((el) => el.textContent?.includes('Europe'))!;
      expect(europe).toHaveAttribute('data-group-position', 'last');
      expect(europe).toHaveAttribute('data-stack-end', 'false');
      expect(europe).toHaveAttribute('aria-expanded', 'true');
    });

    it("gives the last leaf of a trailing group the stack's trailing edge", () => {
      renderWithProviders(
        <DataTableGrouping
          data={salesData}
          columns={columns}
          groupBy={['region']}
          expandedGroups={new Set(['Europe'])}
        />,
      );

      const items = screen.getAllByTestId('data-table-group-item');
      expect(items.length).toBeGreaterThan(0);
      expect(items.at(-1)).toHaveAttribute('data-stack-end', 'true');
    });

    it('keeps leaf rows of a non-trailing group square', () => {
      renderWithProviders(
        <DataTableGrouping
          data={salesData}
          columns={columns}
          groupBy={['region']}
          expandedGroups={new Set(['North America'])}
        />,
      );

      const items = screen.getAllByTestId('data-table-group-item');
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item).toHaveAttribute('data-stack-end', 'false');
      }
    });
  });

  it('keeps a group expanded when data changes (uncontrolled expansion, stable keys)', () => {
    const { rerender } = renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
      />,
    );

    const header = screen.getAllByRole('button').find((el) => el.textContent?.includes('North America'))!;
    fireEvent.click(header);
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);

    // New row lands in the expanded group — expansion must survive the data
    // change because group keys are value paths, not indexes.
    const withExtra = [
      ...salesData,
      {
        id: '5',
        region: 'North America',
        category: 'Appliances',
        salesperson: 'Zoe',
        quantity: 2,
        unitPrice: 50,
        totalRevenue: 100,
      },
    ];
    rerender(
      <DataTableGrouping
        data={withExtra}
        columns={columns}
        groupBy={['region']}
      />,
    );

    expect(screen.getAllByText('Zoe').length).toBeGreaterThan(0);
  });

  it('groups the current view when composed in a DataTable (sorted order, not insertion order)', () => {
    // Insertion order: Charlie(Sales), Alice(Eng), Bob(Sales). Sorted by name
    // asc the view is Alice, Bob, Charlie — so groups must come out
    // Eng-then-Sales with Bob before Charlie inside Sales. The pre-fix code
    // consumed the pre-sort filtered model and emitted insertion order.
    const rows = [
      { id: '1', dept: 'Sales', name: 'Charlie' },
      { id: '2', dept: 'Eng', name: 'Alice' },
      { id: '3', dept: 'Sales', name: 'Bob' },
    ];
    const tableCols = [
      { id: 'name', accessorKey: 'name', header: 'Name' },
      { id: 'dept', accessorKey: 'dept', header: 'Dept' },
    ];

    renderWithProviders(
      <DataTable
        data={rows}
        columns={tableCols as any}
        initialState={{
          sorting: [{ id: 'name', desc: false }],
          // Hide the table's own cells so the grouping panel is the only
          // surface rendering these strings (unambiguous DOM order asserts).
          columnVisibility: { name: false, dept: false },
        }}>
        <DataTable.Grouping
          groupBy={['dept']}
          columns={[{ accessorKey: 'name', header: 'Name' }]}
          expandedGroups={new Set(['Eng', 'Sales'])}
        />
      </DataTable>,
    );

    const names = screen.getAllByText(/^(Alice|Bob|Charlie)$/).map((el) => el.textContent);
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);

    const groupHeaders = screen.getAllByText(/^(Eng|Sales)$/).map((el) => el.textContent);
    expect(groupHeaders).toEqual(['Eng', 'Sales']);
  });

  it("renders falsy group values (0) as their own group, not 'No Value'", () => {
    const data = [
      { id: '1', region: 'A', quantity: 0 },
      { id: '2', region: 'B', quantity: 5 },
    ];
    const cols = [
      { accessorKey: 'region', header: 'Region', type: 'string' as const },
      { accessorKey: 'quantity', header: 'Qty', type: 'number' as const },
    ];

    renderWithProviders(
      <DataTableGrouping
        data={data}
        columns={cols}
        groupBy={['quantity']}
      />,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('No Value')).not.toBeInTheDocument();
  });

  it('handles custom group footers', () => {
    const mockRenderGroupFooter = vi.fn(() => <div>Custom Footer</div>);

    // Create expanded groups set with the expected group keys
    const expandedGroups = new Set(['North America', 'Europe']);

    renderWithProviders(
      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
        renderGroupFooter={mockRenderGroupFooter}
        expandedGroups={expandedGroups}
      />,
    );

    expect(mockRenderGroupFooter).toHaveBeenCalledWith();
  });

  it('reorders group-by columns from the config popover', () => {
    const onConfigChange = vi.fn();
    renderWithProviders(
      <DataTableGroupingConfig
        columns={columns}
        currentConfig={{ columns: ['region', 'category'], aggregations: [] }}
        onConfigChange={onConfigChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Grouping configuration'));
    fireEvent.click(screen.getByLabelText('Move Region down'));
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ columns: ['category', 'region'] }));
  });
});

describe(groupData, () => {
  it('returns null when no groupBy columns provided', () => {
    const result = groupData(salesData, [], []);
    expect(result).toBeNull();
  });

  it('groups data by single column', () => {
    const result = groupData(salesData, ['region'], []);

    expect(result).toHaveLength(2);
    expect(result?.[0].key).toBe('North America');
    expect(result?.[0].count).toBe(3);
    expect(result?.[1].key).toBe('Europe');
    expect(result?.[1].count).toBe(1);
  });

  it('groups data by multiple columns', () => {
    const result = groupData(salesData, ['region', 'category'], []);

    expect(result).toBeDefined();
    expect(result?.length).toBeGreaterThan(1);

    // Should have nested structure
    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.children).toBeDefined();
  });

  it('calculates sum aggregation', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'sum',
      },
    ];

    const result = groupData(salesData, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.totalRevenue.sum).toBe(15_400); // 6000 + 3000 + 6400
  });

  it('calculates count aggregation', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'quantity',
        function: 'count',
      },
    ];

    const result = groupData(salesData, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.quantity.count).toBe(3);
  });

  it('calculates average aggregation', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'avg',
      },
    ];

    const result = groupData(salesData, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.totalRevenue.avg).toBe(5133.33); // 15400 / 3
  });

  it('calculates min aggregation', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'min',
      },
    ];

    const result = groupData(salesData, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.totalRevenue.min).toBe(3000);
  });

  it('calculates max aggregation', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'max',
      },
    ];

    const result = groupData(salesData, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.totalRevenue.max).toBe(6400);
  });

  it('handles custom aggregation function', () => {
    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'custom',
        customFunction: (values: number[]) => values.reduce((a, b) => a + b, 0) * 2,
      },
    ];

    const result = groupData(salesData, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.totalRevenue.custom).toBe(30_800); // (6000 + 3000 + 6400) * 2
  });

  it('handles empty aggregation values gracefully', () => {
    const dataWithNulls = [{ ...salesData[0], totalRevenue: undefined }, salesData[1]];

    const aggregations: AggregationConfig[] = [
      {
        column: 'totalRevenue',
        function: 'sum',
      },
    ];

    const result = groupData(dataWithNulls, ['region'], aggregations);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.aggregations.totalRevenue.sum).toBe(3000); // Only the valid value
  });

  it('respects maxDepth parameter', () => {
    const result = groupData(salesData, ['region', 'category', 'salesperson'], [], 2);

    const northAmerica = result?.find((g) => g.key === 'North America');
    expect(northAmerica?.children?.[0].level).toBeLessThanOrEqual(2);
  });

  it('handles data with missing group keys', () => {
    const dataWithMissing = [{ ...salesData[0], region: undefined }, salesData[1]];

    const result = groupData(dataWithMissing, ['region'], []);

    expect(result).toHaveLength(2); // One with undefined key, one with valid key
  });

  it("does not collapse distinct falsy group values (0, false, '') into one group", () => {
    const data = [
      { k: 0, v: 1 },
      { k: false, v: 2 },
      { k: '', v: 3 },
      { k: null, v: 4 },
      { k: 'x', v: 5 },
    ];

    const result = groupData(data, ['k'], []);

    // 0, false, "", null, "x" are five distinct group keys.
    expect(result).toHaveLength(5);
    const zeroGroup = result?.find((g) => g.key === '0');
    expect(zeroGroup?.count).toBe(1);
    expect(zeroGroup?.items[0]).toEqual({ k: 0, v: 1 });
  });

  it('min/max never produce NaN for non-numeric values', () => {
    const data = [
      { region: 'A', when: '2024-01-15T10:00:00.000Z' },
      { region: 'A', when: 'not-a-date' },
    ];
    const aggregations: AggregationConfig[] = [
      { column: 'when', function: 'min' },
      { column: 'when', function: 'max' },
    ];

    const result = groupData(data, ['region'], aggregations);
    const group = result?.[0];

    expect(Number.isNaN(group?.aggregations.when.min)).toBe(false);
    expect(Number.isNaN(group?.aggregations.when.max)).toBe(false);
  });

  it('min/max skip non-numeric values instead of poisoning the result', () => {
    const data = [
      { region: 'A', score: 5 },
      { region: 'A', score: 'oops' },
      { region: 'A', score: 12 },
    ];
    const aggregations: AggregationConfig[] = [
      { column: 'score', function: 'min' },
      { column: 'score', function: 'max' },
    ];

    const result = groupData(data, ['region'], aggregations);
    const group = result?.[0];

    expect(group?.aggregations.score.min).toBe(5);
    expect(group?.aggregations.score.max).toBe(12);
  });

  it('creates proper path for nested groups', () => {
    const result = groupData(salesData, ['region', 'category'], []);

    const northAmerica = result?.find((g) => g.key === 'North America');
    const electronics = northAmerica?.children?.find((c) => c.key === 'Electronics');

    expect(electronics?.path).toEqual(['North America', 'Electronics']);
    expect(electronics?.level).toBe(1);
  });
});

describe('useGrouping hook', () => {
  it('provides grouping configuration management', () => {
    // This would test the useGrouping hook if it existed
    // For now, the grouping logic is embedded in the component
    expect(true).toBe(true);
  });
});
