import { useMemo, useState } from 'react';

// ---- Types (duplicated from DataTableGrouping to avoid importing JSX component) ----

export type AggregationFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'custom';

export interface AggregationConfig {
  column: string;
  function: AggregationFunction;
  label?: string;
  customFunction?: (values: any[]) => any;
}

export interface GroupedData<T = any> {
  key: string;
  value: any;
  count: number;
  aggregations: Record<string, any>;
  items: T[];
  children?: GroupedData<T>[];
  level: number;
  path: any[];
}

// ---- Grouping Utility (duplicated from DataTableGrouping) ----

function groupDataInternal<T>(
  data: T[],
  groupByColumns: string[],
  aggregations: AggregationConfig[],
  maxDepth = 5,
): GroupedData<T>[] | null {
  if (!groupByColumns.length) {
    return null;
  }

  const grouped = new Map<string, { items: T[]; key: any; path: any[] }>();

  data.forEach((item) => {
    const firstGroupValue = (item as any)[groupByColumns[0]];
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
  });

  const result = [...grouped.entries()].map(([key, group]) => {
    const aggregationsResult: Record<string, any> = {};

    aggregations.forEach((agg) => {
      aggregationsResult[agg.column] ??= {};

      const values = group.items.map((item) => (item as any)[agg.column]).filter((val) => val != null);

      switch (agg.function) {
        case 'count': {
          aggregationsResult[agg.column].count = group.items.length;
          break;
        }
        case 'sum': {
          aggregationsResult[agg.column].sum = values.reduce((sum, val) => sum + (Number(val) || 0), 0);
          break;
        }
        case 'avg': {
          const sum = values.reduce((sum, val) => sum + (Number(val) || 0), 0);
          aggregationsResult[agg.column].avg = values.length > 0 ? Math.round((sum / values.length) * 100) / 100 : 0;
          break;
        }
        case 'min': {
          aggregationsResult[agg.column].min = values.length > 0 ? Math.min(...values.map(Number)) : 0;
          break;
        }
        case 'max': {
          aggregationsResult[agg.column].max = values.length > 0 ? Math.max(...values.map(Number)) : 0;
          break;
        }
        case 'custom': {
          aggregationsResult[agg.column].custom = agg.customFunction ? agg.customFunction(values) : null;
          break;
        }
      }
    });

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
}

// ---- Hook ----

export interface UseTableGroupingOptions<T = any> {
  data?: T[];
  initialGrouping?: string[];
  initialAggregations?: AggregationConfig[];
  maxDepth?: number;
}

export interface UseTableGroupingReturn<T = any> {
  grouping: string[];
  setGrouping: React.Dispatch<React.SetStateAction<string[]>>;
  aggregations: AggregationConfig[];
  setAggregations: React.Dispatch<React.SetStateAction<AggregationConfig[]>>;
  groupedData: GroupedData<T>[] | null;
  isGrouped: boolean;
}

export function useTableGrouping<T = any>({
  data = [],
  initialGrouping = [],
  initialAggregations = [],
  maxDepth = 5,
}: UseTableGroupingOptions<T> = {}): UseTableGroupingReturn<T> {
  const [grouping, setGrouping] = useState<string[]>(initialGrouping);
  const [aggregations, setAggregations] = useState<AggregationConfig[]>(initialAggregations);

  const groupedData = useMemo(() => {
    if (!grouping.length) {
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
}
