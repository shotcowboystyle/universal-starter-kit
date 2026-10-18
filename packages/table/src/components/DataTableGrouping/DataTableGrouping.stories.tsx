import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import { formatCurrency } from '@repo/theme';
import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';

import { DataTableGrouping } from './index';
import type { AggregationConfig, GroupedData, GroupingConfig } from './index';

// Define the data type
interface SalesRecord {
  id: string;
  region: string;
  category: string;
  salesperson: string;
  quantity: number;
  unitPrice: number;
  totalRevenue: number;
  date: string;
}

const NORTH_AMERICA = 'North America';
const TOTAL_REVENUE_LABEL = 'Total Revenue';

// Sample data
const salesData: SalesRecord[] = [
  {
    id: '1',
    region: NORTH_AMERICA,
    category: 'Electronics',
    salesperson: 'Alice',
    quantity: 5,
    unitPrice: 1200,
    totalRevenue: 6000,
    date: '2024-01-15',
  },
  {
    id: '2',
    region: NORTH_AMERICA,
    category: 'Furniture',
    salesperson: 'Alice',
    quantity: 10,
    unitPrice: 300,
    totalRevenue: 3000,
    date: '2024-01-16',
  },
  {
    id: '3',
    region: NORTH_AMERICA,
    category: 'Electronics',
    salesperson: 'Bob',
    quantity: 8,
    unitPrice: 800,
    totalRevenue: 6400,
    date: '2024-01-17',
  },
  {
    id: '4',
    region: 'Europe',
    category: 'Electronics',
    salesperson: 'Claire',
    quantity: 12,
    unitPrice: 1000,
    totalRevenue: 12_000,
    date: '2024-01-15',
  },
  {
    id: '5',
    region: 'Europe',
    category: 'Furniture',
    salesperson: 'David',
    quantity: 6,
    unitPrice: 500,
    totalRevenue: 3000,
    date: '2024-01-18',
  },
  {
    id: '6',
    region: 'Asia Pacific',
    category: 'Electronics',
    salesperson: 'Eva',
    quantity: 15,
    unitPrice: 900,
    totalRevenue: 13_500,
    date: '2024-01-20',
  },
];

// Columns definition
const columns = [
  {
    accessorKey: 'region',
    header: 'Region',
  },
  {
    accessorKey: 'category',
    header: 'Category',
  },
  {
    accessorKey: 'salesperson',
    header: 'Salesperson',
  },
  {
    accessorKey: 'quantity',
    header: 'Quantity',
  },
  {
    accessorKey: 'totalRevenue',
    header: 'Revenue',
    cell: (info: any) => formatCurrency(info.getValue(), { symbol: '$', fractionDigits: 'auto' }),
  },
  {
    accessorKey: 'date',
    header: 'Date',
  },
];

export default {
  title: 'Table/DataTableGrouping',
  component: DataTableGrouping,
  parameters: {
    docs: {
      description: {
        component: 'A data table component with advanced grouping and aggregation capabilities.',
      },
    },
  },
};

export const BasicGrouping = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Basic Grouping by Region
    </Text>

    <DataTableGrouping
      data={salesData}
      columns={columns}
      groupBy={['region']}
    />

    <Text
      fontSize="$3"
      color="$gray11">
      Data is grouped by region with default expand/collapse functionality.
    </Text>
  </YStack>
);

BasicGrouping.storyName = 'Main';
export const MultiLevelGrouping = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Multi-Level Grouping
    </Text>

    <DataTableGrouping
      data={salesData}
      columns={columns}
      groupBy={['region', 'category']}
    />

    <Text
      fontSize="$3"
      color="$gray11">
      Hierarchical grouping by region, then by category within each region.
    </Text>
  </YStack>
);

export const WithAggregations = () => {
  const aggregations: AggregationConfig[] = [
    {
      column: 'totalRevenue',
      function: 'sum',
      label: TOTAL_REVENUE_LABEL,
    },
    {
      column: 'quantity',
      function: 'sum',
      label: 'Total Quantity',
    },
    {
      column: 'totalRevenue',
      function: 'avg',
      label: 'Average Revenue',
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Grouping with Aggregations
      </Text>

      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region']}
        aggregations={aggregations}
      />

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$blue2">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$blue11">
            Aggregations:
          </Text>
          <Text
            fontSize="$2"
            color="$blue11">
            • Sum: Total of all values
          </Text>
          <Text
            fontSize="$2"
            color="$blue11">
            • Average: Mean of all values
          </Text>
          <Text
            fontSize="$2"
            color="$blue11">
            • Count: Number of items
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
};

export const ComprehensiveAggregations = () => {
  const aggregations: AggregationConfig[] = [
    {
      column: 'totalRevenue',
      function: 'sum',
      label: TOTAL_REVENUE_LABEL,
    },
    {
      column: 'totalRevenue',
      function: 'avg',
      label: 'Average Revenue',
    },
    {
      column: 'totalRevenue',
      function: 'min',
      label: 'Min Revenue',
    },
    {
      column: 'totalRevenue',
      function: 'max',
      label: 'Max Revenue',
    },
    {
      column: 'quantity',
      function: 'count',
      label: 'Item Count',
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Comprehensive Aggregations
      </Text>

      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region', 'category']}
        aggregations={aggregations}
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Multiple aggregation functions applied to grouped data.
      </Text>
    </YStack>
  );
};

const GROUP_LEVEL_BACKGROUNDS = ['$blue2', '$green2'];

const renderGroupHeader = (group: GroupedData<SalesRecord>, level: number) => (
  <YStack
    padding="$3"
    backgroundColor={GROUP_LEVEL_BACKGROUNDS[level] ?? '$yellow2'}
    borderRadius="$2"
    marginBottom="$1">
    <XStack
      alignItems="center"
      justifyContent="space-between">
      <YStack>
        <Text
          fontSize="$4"
          fontWeight="600">
          {group.key}
        </Text>
        <Text
          fontSize="$2"
          color="$gray11">
          Level {level + 1} • {group.count} items
        </Text>
      </YStack>
      <Text
        fontSize="$3"
        fontWeight="500"
        color="$blue11">
        {formatCurrency(group.aggregations.totalRevenue?.sum ?? 0, {
          symbol: '$',
          fractionDigits: 'auto',
        })}
      </Text>
    </XStack>
  </YStack>
);

const renderGroupFooter = (group: GroupedData<SalesRecord>, _level: number) => (
  <YStack
    padding="$2"
    backgroundColor="$gray2"
    borderRadius="$2"
    marginTop="$1">
    <Text
      fontSize="$2"
      color="$gray11"
      textAlign="center">
      End of {group.key} group • {group.count} total items
    </Text>
  </YStack>
);

export const CustomGroupHeaders = () => {
  const aggregations: AggregationConfig[] = [
    {
      column: 'totalRevenue',
      function: 'sum',
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Custom Group Headers
      </Text>

      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={['region', 'category']}
        aggregations={aggregations}
        renderGroupHeader={renderGroupHeader}
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Custom styled group headers with additional information.
      </Text>
    </YStack>
  );
};

export const CustomGroupFooters = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Custom Group Footers
    </Text>

    <DataTableGrouping
      data={salesData}
      columns={columns}
      groupBy={['region']}
      renderGroupFooter={renderGroupFooter}
    />

    <Text
      fontSize="$3"
      color="$gray11">
      Custom footer content for each group.
    </Text>
  </YStack>
);

export const WithGroupingControls = () => {
  const [groupingConfig, setGroupingConfig] = React.useState<GroupingConfig>({
    columns: ['region'],
    aggregations: [
      {
        column: 'totalRevenue',
        function: 'sum',
        label: TOTAL_REVENUE_LABEL,
      },
    ],
  });

  const handleGroupingChange = (config: GroupingConfig) => {
    setGroupingConfig(config);
    action('grouping-changed')(config);
  };

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Interactive Grouping Controls
      </Text>

      <XStack
        gap="$3"
        flexWrap="wrap">
        <Button
          size="$3"
          onPress={() => {
            setGroupingConfig({
              columns: ['region'],
              aggregations: [{ column: 'totalRevenue', function: 'sum' }],
            });
          }}>
          Group by Region
        </Button>
        <Button
          size="$3"
          onPress={() => {
            setGroupingConfig({
              columns: ['category'],
              aggregations: [{ column: 'quantity', function: 'count' }],
            });
          }}>
          Group by Category
        </Button>
        <Button
          size="$3"
          onPress={() => {
            setGroupingConfig({
              columns: ['region', 'category'],
              aggregations: [
                { column: 'totalRevenue', function: 'sum' },
                { column: 'quantity', function: 'sum' },
              ],
            });
          }}>
          Multi-Level Grouping
        </Button>
        <Button
          size="$3"
          onPress={() => {
            setGroupingConfig({
              columns: [],
              aggregations: [],
            });
          }}>
          Clear Grouping
        </Button>
      </XStack>

      <DataTableGrouping
        data={salesData}
        columns={columns}
        groupBy={groupingConfig.columns}
        aggregations={groupingConfig.aggregations}
        onGroupingChange={handleGroupingChange}
      />

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$green2">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$green11">
            Current Grouping:
          </Text>
          <Text
            fontSize="$2"
            color="$green11">
            Columns: {groupingConfig.columns.join(', ') || 'None'}
          </Text>
          <Text
            fontSize="$2"
            color="$green11">
            Aggregations: {groupingConfig.aggregations.length}
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
};

/**
 * Seeded PRNG (mulberry32). The aggregate rows this story renders (Total
 * Revenue, Item Count) are derived from the fixture, so `Math.random()` made
 * the shot differ on every capture and flapped the visual baseline. Seeding
 * keeps the whole surface under pixel comparison.
 */
const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    // oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-math-trunc -- mulberry32 needs int32 wraparound; Math.trunc does not wrap
    state = (state + 0x6d_2b_79_f5) | 0;
    // oxlint-disable-next-line eslint/no-bitwise -- mulberry32 is defined in 32-bit integer ops
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    // oxlint-disable-next-line eslint/no-bitwise -- mulberry32 is defined in 32-bit integer ops
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    // oxlint-disable-next-line eslint/no-bitwise -- mulberry32 is defined in 32-bit integer ops
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

// Generate larger dataset
const random = seededRandom(0x5e_ed);
const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
  id: `item-${i + 1}`,
  region: [NORTH_AMERICA, 'Europe', 'Asia Pacific', 'South America'][i % 4],
  category: ['Electronics', 'Furniture', 'Appliances', 'Books'][i % 4],
  salesperson: `Person ${(i % 10) + 1}`,
  quantity: Math.floor(random() * 20) + 1,
  unitPrice: Math.floor(random() * 1000) + 100,
  // Will be calculated
  totalRevenue: 0,
  date: new Date(Date.now() - random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
})).map((item) => ({
  ...item,
  totalRevenue: item.quantity * item.unitPrice,
}));

export const PerformanceTest = () => {
  const aggregations: AggregationConfig[] = [
    {
      column: 'totalRevenue',
      function: 'sum',
      label: TOTAL_REVENUE_LABEL,
    },
    {
      column: 'quantity',
      function: 'count',
      label: 'Item Count',
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Performance Test (1000 items)
      </Text>

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$orange2">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$orange11">
            Dataset Information:
          </Text>
          <Text
            fontSize="$2"
            color="$orange11">
            • Total records: {largeDataset.length}
          </Text>
          <Text
            fontSize="$2"
            color="$orange11">
            • Regions: North America, Europe, Asia Pacific, South America
          </Text>
          <Text
            fontSize="$2"
            color="$orange11">
            • Categories: Electronics, Furniture, Appliances, Books
          </Text>
        </YStack>
      </Card>

      <DataTableGrouping
        data={largeDataset}
        columns={columns}
        groupBy={['region', 'category']}
        aggregations={aggregations}
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Test performance with large datasets and complex grouping.
      </Text>
    </YStack>
  );
};
