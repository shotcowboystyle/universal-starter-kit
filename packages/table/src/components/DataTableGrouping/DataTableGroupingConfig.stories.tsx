import { Text, XStack, YStack } from '@repo/ui';
/**
 * DataTableGroupingConfig — coverage arm of G-15 story honesty (D-05 rider).
 *
 * `DataTableGroupingConfig` is a public export of @repo/table
 * that shipped with no story at all (audit-tc §1.2, audit-table-chrome-
 * functional "coverage gap"), so its trigger badge and configuration popover
 * could never be screenshot-verified from the index. These stories give the
 * component a home next to its implementation.
 *
 * Stories compose catalog components only and are network-hermetic.
 */
import { useState } from 'react';

import { DataTableGroupingConfig } from './index';
import type { GroupingConfig } from './index';

const columns = [
  { accessorKey: 'region', header: 'Region', type: 'string' as const },
  { accessorKey: 'category', header: 'Category', type: 'string' as const },
  { accessorKey: 'salesperson', header: 'Salesperson', type: 'string' as const },
  { accessorKey: 'quantity', header: 'Quantity', type: 'number' as const },
  { accessorKey: 'totalRevenue', header: 'Revenue', type: 'number' as const },
  { accessorKey: 'date', header: 'Date', type: 'date' as const },
];

export default {
  title: 'Table/DataTableGroupingConfig',
  component: DataTableGroupingConfig,
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Trigger + popover that edits a GroupingConfig (group-by columns and aggregations). The trigger carries a count badge once either list is non-empty. Standalone here; inside a DataTable it reads columns from DataTableStateContext.',
      },
    },
  },
};

/** Live config state so the popover edits (and the badge count) are real. */
const ConfigHarness = ({ initial, disabled = false }: { initial: GroupingConfig; disabled?: boolean }) => {
  const [config, setConfig] = useState<GroupingConfig>(initial);
  return (
    <YStack
      gap="$3"
      padding="$4"
      minHeight={420}
      alignItems="flex-start">
      <DataTableGroupingConfig
        columns={columns}
        currentConfig={config}
        onConfigChange={setConfig}
        disabled={disabled}
      />
      {/* Echo the committed config so a screenshot proves the edit landed. */}
      <YStack gap="$1">
        <Text
          fontSize="$2"
          color="$color11">
          Group by: {config.columns.length > 0 ? config.columns.join(', ') : '(none)'}
        </Text>
        <Text
          fontSize="$2"
          color="$color11">
          Aggregations:{' '}
          {config.aggregations.length > 0
            ? config.aggregations.map((a) => `${a.function}(${a.column})`).join(', ')
            : '(none)'}
        </Text>
      </YStack>
    </YStack>
  );
};

const emptyConfig: GroupingConfig = { columns: [], aggregations: [] };

/** Rest state: nothing grouped yet, so the trigger shows no count badge. */
export const Default = () => <ConfigHarness initial={emptyConfig} />;
Default.storyName = 'Main';

/**
 * One group-by column and one aggregation: the trigger badge reads 2. This is
 * the badge that audit-table-chrome-functional fixed from a theme-blind
 * `color="white"` to `$color12` and could not screenshot-verify without a story.
 */
export const WithBadgeCount = () => (
  <ConfigHarness
    initial={{
      columns: ['region'],
      aggregations: [{ column: 'totalRevenue', function: 'sum', label: 'Revenue' }],
    }}
  />
);

/** Multi-level grouping plus several aggregations — the popover's scroll case. */
export const ManySelections = () => (
  <ConfigHarness
    initial={{
      columns: ['region', 'category', 'salesperson'],
      aggregations: [
        { column: 'totalRevenue', function: 'sum', label: 'Revenue' },
        { column: 'quantity', function: 'avg', label: 'Avg qty' },
        { column: 'quantity', function: 'max', label: 'Max qty' },
        { column: 'totalRevenue', function: 'min', label: 'Min revenue' },
      ],
    }}
  />
);

/** Disabled trigger: the control stays legible rather than vanishing (LC-40). */
export const Disabled = () => (
  <ConfigHarness
    initial={{ columns: ['region'], aggregations: [] }}
    disabled
  />
);

/** No columns to offer — the popover must say so instead of rendering empty chrome. */
export const NoColumns = () => {
  const [config, setConfig] = useState<GroupingConfig>(emptyConfig);
  return (
    <XStack
      padding="$4"
      minHeight={420}>
      <DataTableGroupingConfig
        columns={[]}
        currentConfig={config}
        onConfigChange={setConfig}
      />
    </XStack>
  );
};
