import { Card } from '@repo/ui';
// Catalog Button + Input (LC-56 STORY-HONESTY — no raw interactive primitives).
import { Button, Input } from '@repo/forms';
import { action } from '@repo/storybook';
import type { GuardrailSpecimenParameter } from '@repo/theme';
import { Preset } from '@repo/theme';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import React from 'react';
import { within } from 'storybook/test';
import { Text, View, XStack, YStack } from 'tamagui';

import type { DataTableColumn, PageLoadQuery, TablePagination, TablePaginationState } from '../../types';
import { DataTable } from '../DataTable';

import { DataTablePagination } from './';

const meta: Meta<typeof DataTablePagination> = {
  title: 'Table/DataTablePagination',
  component: DataTablePagination,
  parameters: {
    docs: {
      description: {
        component:
          'A comprehensive pagination component for data tables with navigation controls, page size selection, and page jumping.',
      },
    },
  },
  argTypes: {
    pageSizeOptions: {
      control: 'object',
      description: 'Available page size options',
    },
    showInfo: {
      control: 'boolean',
      description: 'Whether to show pagination info',
    },
    showPageSizeSelector: {
      control: 'boolean',
      description: 'Whether to show page size selector',
    },
    showPageJump: {
      control: 'boolean',
      description: 'Whether to show page jump input',
    },
    compact: {
      control: 'boolean',
      description: 'Whether to use compact layout',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DataTablePagination>;

// Rest mid-range: at pageIndex 0 the prev/first buttons are bare-disabled at
// rest (UX-P19 / DG-ST-03). Boundary states keep their own stories below.
const samplePagination: TablePaginationState = {
  pageIndex: 7,
  pageSize: 10,
  totalCount: 150,
  totalPages: 15,
};

export const Basic: Story = {
  name: 'Main',
  args: {
    pagination: samplePagination,
    onPaginationChange: action('onPaginationChange'),
    // >5 options: shorter select lists trip `select-too-few-options` (DG-CTRL-01).
    pageSizeOptions: [10, 20, 30, 50, 100, 250],
    showInfo: true,
    showPageSizeSelector: true,
    showPageJump: true,
    compact: false,
  },
};

export const Compact: Story = {
  args: {
    ...Basic.args,
    compact: true,
  },
};

// LC-57 allowlist: the boundary stories below EXIST to demo pager edges —
// first/last/single/empty page rest with the unreachable-direction buttons
// disabled by design (the honest boundary state, LC-40-washed). The warns
// still fire; the harvester tolerates exactly these codes on these ids.
const pagerBoundarySpecimen = {
  guardrailSpecimen: {
    warns: ['bare-disabled'],
    reason: 'Pager-boundary specimen: unreachable nav directions rest disabled by design at page edges.',
  } satisfies GuardrailSpecimenParameter,
};

export const FirstPage: Story = {
  parameters: pagerBoundarySpecimen,
  args: {
    ...Basic.args,
    pagination: {
      ...samplePagination,
      pageIndex: 0,
    },
  },
};

export const MiddlePage: Story = {
  args: {
    ...Basic.args,
    pagination: {
      ...samplePagination,
      pageIndex: 7,
    },
  },
};

export const LastPage: Story = {
  parameters: pagerBoundarySpecimen,
  args: {
    ...Basic.args,
    pagination: {
      ...samplePagination,
      pageIndex: 14,
    },
  },
};

export const NoInfo: Story = {
  args: {
    ...Basic.args,
    showInfo: false,
  },
};

export const NoPageSizeSelector: Story = {
  args: {
    ...Basic.args,
    showPageSizeSelector: false,
  },
};

export const NoPageJump: Story = {
  args: {
    ...Basic.args,
    showPageJump: false,
  },
};

export const Minimal: Story = {
  args: {
    ...Basic.args,
    showInfo: false,
    showPageSizeSelector: false,
    showPageJump: false,
  },
};

export const CustomPageSizes: Story = {
  args: {
    ...Basic.args,
    pageSizeOptions: [5, 15, 25, 50, 75, 150],
  },
};

export const LargeDataSet: Story = {
  args: {
    ...Basic.args,
    pagination: {
      pageIndex: 12,
      pageSize: 50,
      totalCount: 1250,
      totalPages: 25,
    },
  },
};

export const SmallDataSet: Story = {
  args: {
    ...Basic.args,
    pagination: {
      pageIndex: 1,
      pageSize: 10,
      totalCount: 23,
      totalPages: 3,
    },
  },
};

export const SinglePage: Story = {
  parameters: pagerBoundarySpecimen,
  args: {
    ...Basic.args,
    pagination: {
      pageIndex: 0,
      pageSize: 10,
      totalCount: 5,
      totalPages: 1,
    },
  },
};

export const InteractiveDemo: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const InteractiveDemo = () => {
      const [pagination, setPagination] = React.useState<TablePaginationState>(samplePagination);

      const handlePaginationChange = (newPagination: TablePagination) => {
        setPagination({
          ...pagination,
          ...newPagination,
        });
        action('onPaginationChange')(newPagination);
      };

      return (
        <YStack gap="$4">
          <DataTablePagination
            {...args}
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
          />

          <YStack
            padding="$4"
            backgroundColor="$gray2"
            borderRadius="$4"
            gap="$2">
            <Text
              fontSize="$5"
              fontWeight="600">
              Current State:
            </Text>
            <YStack>
              <Text>
                Page: {pagination.pageIndex + 1} of {pagination.totalPages}
              </Text>
              <Text>Page Size: {pagination.pageSize}</Text>
              <Text>Total Items: {pagination.totalCount}</Text>
              <Text>
                Showing: {pagination.pageIndex * pagination.pageSize + 1} -{' '}
                {Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.totalCount ?? 0)}
              </Text>
            </YStack>
          </YStack>
        </YStack>
      );
    };

    return <InteractiveDemo />;
  },
};

export const NavigationDemo: Story = {
  args: {
    ...Basic.args,
    pagination: {
      ...samplePagination,
      pageIndex: 5,
    },
  },
  render: (args) => {
    const NavigationDemo = () => {
      const [pagination, setPagination] = React.useState<TablePaginationState>({
        ...samplePagination,
        pageIndex: 5,
      });

      const handlePaginationChange = (newPagination: TablePagination) => {
        setPagination({
          ...pagination,
          ...newPagination,
        });
        action('onPaginationChange')(newPagination);
      };

      return (
        <YStack gap="$4">
          <DataTablePagination
            {...args}
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
          />

          <Card>
            <Text
              fontSize="$5"
              fontWeight="600">
              Navigation Controls:
            </Text>
            <XStack gap="$2">
              <Button
                onPress={() => {
                  handlePaginationChange({
                    pageIndex: 0,
                    pageSize: pagination.pageSize,
                  });
                }}
                size="$2"
                padding="$1">
                First
              </Button>
              <Button
                onPress={() => {
                  handlePaginationChange({
                    pageIndex: Math.max(0, pagination.pageIndex - 1),
                    pageSize: pagination.pageSize,
                  });
                }}
                size="$2"
                padding="$1">
                Previous
              </Button>
              <Button
                onPress={() => {
                  handlePaginationChange({
                    pageIndex: Math.min((pagination.totalPages || 1) - 1, pagination.pageIndex + 1),
                    pageSize: pagination.pageSize,
                  });
                }}
                size="$2"
                padding="$1">
                Next
              </Button>
              <Button
                onPress={() => {
                  handlePaginationChange({
                    pageIndex: (pagination.totalPages || 1) - 1,
                    pageSize: pagination.pageSize,
                  });
                }}
                size="$2"
                padding="$1">
                Last
              </Button>
            </XStack>
          </Card>
        </YStack>
      );
    };

    return <NavigationDemo />;
  },
};

export const PageSizeDemo: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const PageSizeDemo = () => {
      const [pagination, setPagination] = React.useState<TablePaginationState>(samplePagination);

      const handlePaginationChange = (newPagination: TablePagination) => {
        setPagination({
          ...pagination,
          ...newPagination,
        });
        action('onPaginationChange')(newPagination);
      };

      return (
        <YStack gap="$4">
          <DataTablePagination
            {...args}
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
          />

          <Card>
            <Text
              fontSize="$5"
              fontWeight="600">
              Page Size Options:
            </Text>
            <XStack gap="$2">
              {[5, 10, 20, 50, 100].map((size) => (
                <Button
                  key={size}
                  onPress={() => {
                    handlePaginationChange({ pageIndex: 0, pageSize: size });
                  }}
                  size="$2"
                  accent={pagination.pageSize === size}>
                  {size}
                </Button>
              ))}
            </XStack>
          </Card>
        </YStack>
      );
    };

    return <PageSizeDemo />;
  },
};

export const PageJumpDemo: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const PageJumpDemo = () => {
      const [pagination, setPagination] = React.useState<TablePaginationState>({
        ...samplePagination,
        pageIndex: 5,
      });
      const [jumpValue, setJumpValue] = React.useState('');

      const handlePaginationChange = (newPagination: TablePagination) => {
        setPagination({
          ...pagination,
          ...newPagination,
        });
        action('onPaginationChange')(newPagination);
      };

      const handlePageJump = (pageNumber: string) => {
        const page = Number.parseInt(pageNumber, 10) - 1;
        if (!Number.isNaN(page) && page >= 0 && page < (pagination.totalPages ?? 1)) {
          handlePaginationChange({
            pageIndex: page,
            pageSize: pagination.pageSize,
          });
        }
      };

      return (
        <YStack gap="$4">
          <DataTablePagination
            {...args}
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
          />

          <Card>
            <Text
              fontSize="$5"
              fontWeight="600">
              Page Jump:
            </Text>
            <XStack
              gap="$2"
              alignItems="center">
              <Text>Go to page:</Text>
              <YStack width={110}>
                <Input
                  keyboardType="numeric"
                  placeholder={`1-${pagination.totalPages}`}
                  onChangeText={setJumpValue}
                  inputProps={{
                    'aria-label': 'Go to page',
                    onSubmitEditing: (e: { nativeEvent: { text: string } }) => {
                      handlePageJump(e.nativeEvent.text);
                    },
                  }}
                />
              </YStack>
              <Button
                onPress={() => {
                  handlePageJump(jumpValue);
                }}
                size="$2"
                padding="$1">
                Go
              </Button>
            </XStack>
          </Card>
        </YStack>
      );
    };

    return <PageJumpDemo />;
  },
};

export const Responsive: Story = {
  args: {
    ...Basic.args,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export const Accessibility: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => (
    <YStack gap="$4">
      <DataTablePagination {...args} />
      <Card>
        <Text
          fontSize="$5"
          fontWeight="600">
          Accessibility Features:
        </Text>
        <YStack paddingLeft="$5">
          <Text>• Navigation buttons have proper ARIA labels</Text>
          <Text>• Page size selector is keyboard accessible</Text>
          <Text>• Page jump input has proper labeling</Text>
          <Text>• Screen reader announcements for page changes</Text>
          <Text>• Focus management between controls</Text>
          <Text>• Proper semantic markup for pagination info</Text>
        </YStack>
      </Card>
    </YStack>
  ),
};

export const LoadingStates: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const LoadingDemo = () => {
      const [isLoading, setIsLoading] = React.useState(false);

      const handlePaginationChange = (newPagination: TablePagination) => {
        setIsLoading(true);
        setTimeout(() => {
          setIsLoading(false);
        }, 1000);
        action('onPaginationChange')(newPagination);
      };

      return (
        <View>
          <DataTablePagination
            {...args}
            onPaginationChange={handlePaginationChange}
          />
          {isLoading && (
            <View style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>🔄 Loading page data...</View>
          )}
        </View>
      );
    };

    return <LoadingDemo />;
  },
};

export const ErrorStates: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => (
    <View>
      <DataTablePagination {...args} />
      <View
        style={{
          marginTop: '10px',
          padding: '8px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
        }}>
        Error: Unable to load page data. Please try again.
      </View>
    </View>
  ),
};

export const EdgeCases: Story = {
  parameters: pagerBoundarySpecimen,
  args: {
    ...Basic.args,
    pagination: {
      pageIndex: 0,
      pageSize: 10,
      totalCount: 0,
      totalPages: 0,
    },
  },
  render: (args) => (
    <YStack gap="$4">
      <YStack
        padding="$4"
        backgroundColor="$gray1"
        borderRadius="$4">
        <Text
          fontSize="$5"
          fontWeight="600">
          Edge Cases:
        </Text>
        <YStack paddingLeft="$5">
          <Text>• Empty data (0 total items)</Text>
          <Text>• Single page scenarios</Text>
          <Text>• Large datasets (1000+ pages)</Text>
          <Text>• Custom page sizes</Text>
          <Text>• Invalid page navigation attempts</Text>
        </YStack>
      </YStack>

      <DataTablePagination {...args} />
    </YStack>
  ),
};

// ---------------------------------------------------------------------------
// paginationMode stories: house pager (pages, default) vs infinite scroll
// ---------------------------------------------------------------------------

interface DemoRow {
  id: number;
  name: string;
  category: string;
  price: number;
}

const DEMO_CATEGORIES = ['Alpha', 'Beta', 'Gamma', 'Delta'];

function makeDemoRows(count: number): DemoRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Item ${String(i + 1).padStart(3, '0')}`,
    category: DEMO_CATEGORIES[i % DEMO_CATEGORIES.length],
    price: Math.round(((i * 37) % 500) + 5),
  }));
}

const demoColumns: DataTableColumn<DemoRow>[] = [
  { accessorKey: 'id', header: 'ID', sortable: true },
  { accessorKey: 'name', header: 'Name', sortable: true },
  { accessorKey: 'category', header: 'Category', sortable: true },
  { accessorKey: 'price', header: 'Price', sortable: true },
];

/** Pages mode (default): footer navigation is the catalog Pagination component. */
export const HousePagerDataTable: Story = {
  name: 'House Pager (DataTable)',
  render: () => (
    <DataTable
      data={makeDemoRows(150) as any}
      columns={demoColumns as any}
      readOnly
      enableGlobalSearch={false}
      enableFiltering={false}
      initialState={{ pagination: { pageIndex: 1, pageSize: 20 } }}
      aria-label="House pager table"
    />
  ),
};

/** Infinite mode with client-side data: chunks reveal on scroll, no footer pager. */
export const InfiniteScroll: Story = {
  render: () => (
    <DataTable
      data={makeDemoRows(200) as any}
      columns={demoColumns as any}
      readOnly
      paginationMode="infinite"
      enableGlobalSearch={false}
      enableFiltering={false}
      initialState={{ pagination: { pageIndex: 0, pageSize: 20 } }}
      aria-label="Infinite scroll table"
    />
  ),
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Infinite mode with an async page loader (200 rows, 20/page). The log below
 * the table records every loader call: page N+1 appears in the log while the
 * user is still viewing page N (prefetch-ahead), so appends resolve from
 * cache. Sorting resets accumulation back to page 0.
 */
function InfiniteLoaderDemo({
  latencyMs,
  holdFromPage,
}: {
  latencyMs: number;
  /** Pages from this index on are requested and never answered. */
  holdFromPage?: number;
}) {
  const allRows = React.useMemo(() => makeDemoRows(200), []);
  const startRef = React.useRef(Date.now());
  const [log, setLog] = React.useState<string[]>([]);

  const loadPage = React.useCallback(
    async (query: PageLoadQuery) => {
      const elapsed = Date.now() - startRef.current;
      const sortSuffix = query.sorting.length
        ? ` sort:${query.sorting.map((s) => `${s.id}${s.desc ? ':desc' : ':asc'}`).join(',')}`
        : '';
      const searchSuffix = query.globalFilter ? ` q:${query.globalFilter}` : '';
      setLog((prev) => [...prev, `page-${query.pageIndex} @ ${elapsed}ms${sortSuffix}${searchSuffix}`]);
      if (holdFromPage !== undefined && query.pageIndex >= holdFromPage) {
        await new Promise(() => {});
      }
      await sleep(latencyMs);
      const rows = query.globalFilter
        ? allRows.filter((row) => row.name.toLowerCase().includes(query.globalFilter!.toLowerCase()))
        : [...allRows];
      for (const sort of [...query.sorting].reverse()) {
        rows.sort((a: any, b: any) => {
          const av = a[sort.id];
          const bv = b[sort.id];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sort.desc ? -cmp : cmp;
        });
      }
      const start = query.pageIndex * query.pageSize;
      return {
        rows: rows.slice(start, start + query.pageSize),
        totalCount: rows.length,
      };
    },
    [allRows, latencyMs, holdFromPage],
  );

  return (
    <YStack gap="$4">
      <DataTable
        data={[]}
        columns={demoColumns as any}
        readOnly
        paginationMode="infinite"
        loadPage={loadPage as any}
        enableGlobalSearch
        enableFiltering={false}
        initialState={{ pagination: { pageIndex: 0, pageSize: 20 } }}
        aria-label="Infinite loader table"
      />
      <YStack
        padding="$3"
        backgroundColor="$color2"
        borderRadius="$4"
        {...({ 'data-testid': 'loader-log' } as any)}>
        <Text fontWeight="600">Loader log (page requests):</Text>
        {log.map((entry, i) => (
          <Text
            key={i}
            fontFamily="$mono"
            fontSize="$2"
            {...({ 'data-log-entry': entry } as any)}>
            {entry}
          </Text>
        ))}
      </YStack>
    </YStack>
  );
}

export const InfiniteScrollLoader: Story = {
  render: () => <InfiniteLoaderDemo latencyMs={250} />,
};

// True under Playwright, as for the preview's frozen clock.
const automatedCapture = typeof navigator !== 'undefined' && navigator.webdriver;

/**
 * Slow loader (1.2s/page): shows the bounded tail skeleton while appending.
 *
 * The play scrolls page 2 in and asks for page 3, and under automated capture
 * page 3 never answers, so the shot is pages 1 and 2 plus the tail skeleton.
 * Left to the timer, lost-pixel's full-height resize revealed the sentinel
 * and froze either the skeleton or rows 21 to 23 (MPO-483).
 */
export const InfiniteScrollSlowLoader: Story = {
  render: () => (
    <InfiniteLoaderDemo
      latencyMs={1200}
      holdFromPage={automatedCapture ? 2 : undefined}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Item 020', {}, { timeout: 20_000 });
    canvas.getByTestId('infinite-sentinel').scrollIntoView();
    await canvas.findByText('Item 040', {}, { timeout: 20_000 });
    canvas.getByTestId('infinite-sentinel').scrollIntoView();
    await canvas.findByTestId('infinite-append-skeleton', {}, { timeout: 20_000 });
  },
  parameters: { lostpixel: { waitForPlay: true } },
};

/** Infinite + virtualized body: appended pages extend the virtual scroll range. */
export const InfiniteVirtualized: Story = {
  render: () => (
    <DataTable
      data={makeDemoRows(1000) as any}
      columns={demoColumns as any}
      readOnly
      paginationMode="infinite"
      enableVirtualization
      virtualizationHeight={400}
      enableGlobalSearch={false}
      enableFiltering={false}
      initialState={{ pagination: { pageIndex: 0, pageSize: 50 } }}
      aria-label="Infinite virtualized table"
    />
  ),
};

export const NarrowPanel: Story = {
  render: (args) => {
    const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 25 });
    return (
      <YStack width={249}>
        <DataTablePagination
          compact
          pagination={{
            ...pagination,
            totalCount: 1000,
            totalPages: Math.ceil(1000 / pagination.pageSize),
          }}
          onPaginationChange={setPagination}
          {...args}
        />
      </YStack>
    );
  },
};

export const LargeSpaceNarrow: Story = {
  ...NarrowPanel,
  decorators: [
    (Story) => (
      <Preset overrides={{ space: 'large' }}>
        <Story />
      </Preset>
    ),
  ],
};
