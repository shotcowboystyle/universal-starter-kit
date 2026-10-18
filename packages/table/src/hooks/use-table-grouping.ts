import { useMemo, useState } from 'react';

// ---- Types (duplicated from DataTableGrouping to avoid importing JSX component) ----

export type AggregationFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'custom';

export interface AggregationConfig {
  column: string;
  function: AggregationFunction;
  label?: string;
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the custom aggregate is caller-defined and stored opaquely
  customFunction?: (values: unknown[]) => unknown;
}

export interface AggregationResult {
  count?: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  custom?: unknown;
}

export interface GroupedData<T = unknown> {
  key: string;
  value: unknown;
  count: number;
  aggregations: Record<string, AggregationResult>;
  items: T[];
  children?: GroupedData<T>[];
  level: number;
  path: unknown[];
}

// ---- Grouping Utility (duplicated from DataTableGrouping) ----

// SAFETY: grouped rows are plain records keyed by column id; a missing key reads as undefined
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- row type is caller-generic; there is no parse boundary for arbitrary row data
const readField = (item: unknown, key: string): unknown => (item as Record<string, unknown>)[key];

const sumOf = (values: unknown[]): number => {
  let total = 0;
  for (const val of values) {
    const num = Number(val);
    total += Number.isNaN(num) ? 0 : num;
  }
  return total;
};

const aggregate = (agg: AggregationConfig, items: unknown[], result: AggregationResult): void => {
  const values = items.map((item) => readField(item, agg.column)).filter((val) => val != null);

  switch (agg.function) {
    case 'count': {
      result.count = items.length;
      break;
    }
    case 'sum': {
      result.sum = sumOf(values);
      break;
    }
    case 'avg': {
      const total = sumOf(values);
      result.avg = values.length > 0 ? Math.round((total / values.length) * 100) / 100 : 0;
      break;
    }
    case 'min': {
      result.min = values.length > 0 ? Math.min(...values.map(Number)) : 0;
      break;
    }
    case 'max': {
      result.max = values.length > 0 ? Math.max(...values.map(Number)) : 0;
      break;
    }
    case 'custom': {
      result.custom = agg.customFunction ? agg.customFunction(values) : null;
      break;
    }
    default: {
      break;
    }
  }
};

const groupDataInternal = <T>(
  data: T[],
  groupByColumns: string[],
  aggregations: AggregationConfig[],
  maxDepth = 5,
): GroupedData<T>[] | null => {
  if (groupByColumns.length === 0) {
    return null;
  }

  const grouped = new Map<string, { items: T[]; key: unknown; path: unknown[] }>();

  for (const item of data) {
    const firstGroupValue = readField(item, groupByColumns[0]);
    // oxlint-disable-next-line typescript/no-base-to-string -- group keys of arbitrary cell values; object values intentionally collapse to their default string
    const key = String(firstGroupValue ?? 'null');

    if (!grouped.has(key)) {
      grouped.set(key, {
        items: [],
        key: firstGroupValue,
        path: [firstGroupValue],
      });
    }

    const group = grouped.get(key);
    if (group) {
      group.items.push(item);
    }
  }

  const result = [...grouped.entries()].map(([key, group]) => {
    const aggregationsResult: Record<string, AggregationResult> = {};

    for (const agg of aggregations) {
      aggregationsResult[agg.column] ??= {};
      aggregate(agg, group.items, aggregationsResult[agg.column]);
    }

    const groupedItem: GroupedData<T> = {
      key,
      value: group.key,
      count: group.items.length,
      aggregations: aggregationsResult,
      items: group.items,
      level: 0,
      path: group.path,
    };

    if (groupByColumns.length > 1 && groupedItem.level < maxDepth - 1) {
      const childGroups = groupDataInternal(group.items, groupByColumns.slice(1), aggregations, maxDepth);
      if (childGroups) {
        groupedItem.children = childGroups.map((child) => ({
          ...child,
          level: child.level + 1,
          path: [group.key, ...child.path],
        }));
      }
    }

    return groupedItem;
  });

  return result;
};

// ---- Hook ----

export interface UseTableGroupingOptions<T = unknown> {
  data?: T[];
  initialGrouping?: string[];
  initialAggregations?: AggregationConfig[];
  maxDepth?: number;
}

export interface UseTableGroupingReturn<T = unknown> {
  grouping: string[];
  setGrouping: React.Dispatch<React.SetStateAction<string[]>>;
  aggregations: AggregationConfig[];
  setAggregations: React.Dispatch<React.SetStateAction<AggregationConfig[]>>;
  groupedData: GroupedData<T>[] | null;
  isGrouped: boolean;
}

export const useTableGrouping = <T = unknown>({
  data = [],
  initialGrouping = [],
  initialAggregations = [],
  maxDepth = 5,
}: UseTableGroupingOptions<T> = {}): UseTableGroupingReturn<T> => {
  const [grouping, setGrouping] = useState<string[]>(initialGrouping);
  const [aggregations, setAggregations] = useState<AggregationConfig[]>(initialAggregations);

  const groupedData = useMemo(() => {
    if (grouping.length === 0) {
      return null;
    }
    return groupDataInternal(data, grouping, aggregations, maxDepth);
  }, [data, grouping, aggregations, maxDepth]);

  const isGrouped = grouping.length > 0;

  return {
    grouping,
    setGrouping,
    aggregations,
    setAggregations,
    groupedData,
    isGrouped,
  };
};
