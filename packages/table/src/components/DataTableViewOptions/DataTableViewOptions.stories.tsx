import { action } from '@repo/storybook';
import { formatAbsoluteDate } from '@repo/theme';
import React from 'react';
import { Card, Text, View, XStack, YStack } from 'tamagui';

import type { TableView } from '../../types';

import { DataTableViewOptions } from './index';

// Columns definition
const allColumns = [
  {
    accessorKey: 'name',
    header: 'Product Name',
  },
  {
    accessorKey: 'category',
    header: 'Category',
  },
  {
    accessorKey: 'price',
    header: 'Price',
    cell: (info: any) => `$${info.getValue().toFixed(2)}`,
  },
  {
    accessorKey: 'stock',
    header: 'Stock',
  },
  {
    accessorKey: 'status',
    header: 'Status',
  },
  {
    accessorKey: 'rating',
    header: 'Rating',
  },
  {
    accessorKey: 'weight',
    header: 'Weight (lbs)',
  },
  {
    accessorKey: 'dimensions',
    header: 'Dimensions',
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: (info: any) => formatAbsoluteDate(info.getValue()),
  },
  {
    accessorKey: 'description',
    header: 'Description',
  },
  {
    accessorKey: 'tags',
    header: 'Tags',
    cell: (info: any) => info.getValue().join(', '),
  },
];

// Transform columns to match DataTableViewOptions expected format
const transformedColumns = allColumns.map((col, index) => ({
  id: col.accessorKey,
  label: col.header,
  visible: true,
  order: index,
  canHide: true,
  canResize: true,
  canReorder: true,
}));

export default {
  title: 'Table/DataTableViewOptions',
  component: DataTableViewOptions,
  parameters: {
    docs: {
      description: {
        component: 'A component for controlling table view options like column visibility, density, and page size.',
      },
    },
  },
};

export const Default = () => {
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({});
  const [density, _setDensity] = React.useState<'compact' | 'comfortable' | 'spacious'>('comfortable');

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        View Options Demo
      </Text>

      <DataTableViewOptions
        columns={transformedColumns}
        onColumnVisibilityChange={(columnId, visible) => {
          setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }));
        }}
        onColumnOrderChange={() => {}}
        onColumnSizingChange={() => {}}
        onSaveView={() => {}}
        onLoadView={() => {}}
        onResetToDefault={() => {}}
      />

      <Card
        padding="$4"
        borderRadius="$4">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500">
            Current Settings:
          </Text>
          <Text
            fontSize="$2"
            color="$gray11">
            Density: {density}
          </Text>
          <Text
            fontSize="$2"
            color="$gray11">
            Visible Columns: {Object.keys(columnVisibility).length || 'All'}
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
};

Default.storyName = 'Main';

export const Compact = () => {
  const [columns, setColumns] = React.useState(transformedColumns);

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Compact (DropdownMenu)
      </Text>

      <DataTableViewOptions
        compact
        columns={columns}
        onColumnVisibilityChange={(columnId, visible) => {
          setColumns((prev) => prev.map((col) => (col.id === columnId ? { ...col, visible } : col)));
          action('column-visibility-changed')({ [columnId]: visible });
        }}
        onResetToDefault={() => {
          setColumns(transformedColumns);
          action('reset-to-default')();
        }}
      />

      <Text
        fontSize="$2"
        color="$gray11">
        Visible: {columns.filter((col) => col.visible).length} of {columns.length}
      </Text>
    </YStack>
  );
};

export const WithPageSizeControls = () => {
  const [pageSize, _setPageSize] = React.useState(10);

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        With Page Size Controls
      </Text>

      <DataTableViewOptions
        columns={transformedColumns}
        onColumnVisibilityChange={() => {}}
        onColumnOrderChange={() => {}}
        onColumnSizingChange={() => {}}
        onSaveView={() => {}}
        onLoadView={() => {}}
        onResetToDefault={() => {}}
      />

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$blue2">
        <Text
          fontSize="$3"
          color="$blue11">
          Current page size: {pageSize} items per page
        </Text>
      </Card>
    </YStack>
  );
};

export const ManyColumns = () => {
  const [_columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({});

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Many Columns Example
      </Text>

      <Card
        padding="$3"
        borderRadius="$4"
        backgroundColor="$green2">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$green11">
            Available Columns:
          </Text>
          <Text
            fontSize="$2"
            color="$green11">
            {transformedColumns.length} total columns to manage visibility
          </Text>
        </YStack>
      </Card>

      <DataTableViewOptions
        columns={transformedColumns}
        onColumnVisibilityChange={(columnId, visible) => {
          setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }));
          action('column-visibility-changed')({ [columnId]: visible });
        }}
        onColumnOrderChange={() => {}}
        onColumnSizingChange={() => {}}
        onSaveView={() => {}}
        onLoadView={() => {}}
        onResetToDefault={() => {}}
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Toggle column visibility to customize your table view.
      </Text>
    </YStack>
  );
};

export const DensityOptions = () => {
  const [density, _setDensity] = React.useState<'compact' | 'comfortable' | 'spacious'>('comfortable');

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Density Options
      </Text>

      <DataTableViewOptions
        columns={transformedColumns.slice(0, 5)} // Limit columns for demo
        onColumnVisibilityChange={() => {}}
        onColumnOrderChange={() => {}}
        onColumnSizingChange={() => {}}
        onSaveView={() => {}}
        onLoadView={() => {}}
        onResetToDefault={() => {}}
      />

      <Card
        padding="$4"
        borderRadius="$4">
        <YStack gap="$3">
          <Text
            fontSize="$3"
            fontWeight="500">
            Current Density: {density}
          </Text>

          <YStack gap="$2">
            <XStack
              alignItems="center"
              gap="$2">
              <View
                style={{
                  width: 20,
                  height: density === 'compact' ? 8 : density === 'comfortable' ? 12 : 16,
                  backgroundColor: 'var(--color-blue9)',
                  borderRadius: 2,
                }}
              />
              <Text
                fontSize="$2"
                color="$gray11">
                Compact: Tighter row spacing
              </Text>
            </XStack>

            <XStack
              alignItems="center"
              gap="$2">
              <View
                style={{
                  width: 20,
                  height: density === 'comfortable' ? 12 : 16,
                  backgroundColor: 'var(--color-green9)',
                  borderRadius: 2,
                }}
              />
              <Text
                fontSize="$2"
                color="$gray11">
                Comfortable: Balanced spacing
              </Text>
            </XStack>

            <XStack
              alignItems="center"
              gap="$2">
              <View
                style={{
                  width: 20,
                  height: 16,
                  backgroundColor: 'var(--color-purple9)',
                  borderRadius: 2,
                }}
              />
              <Text
                fontSize="$2"
                color="$gray11">
                Spacious: More generous row spacing
              </Text>
            </XStack>
          </YStack>
        </YStack>
      </Card>
    </YStack>
  );
};

// Honest rename (LC-40 sweep / SB-M-624): this story was titled "Disabled"
// but passed no disabled props — DataTableViewOptions has NO `disabled` API
// yet, so the panel it renders is fully interactive. Keep it as an honest
// record of that gap until the owner adds a disabled API on demand.
export const NoDisabledApi = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      No Disabled API
    </Text>

    <DataTableViewOptions
      columns={transformedColumns}
      onColumnVisibilityChange={() => {}}
      onColumnOrderChange={() => {}}
      onColumnSizingChange={() => {}}
      onSaveView={() => {}}
      onLoadView={() => {}}
      onResetToDefault={() => {}}
    />

    <Text
      fontSize="$3"
      color="$gray11">
      DataTableViewOptions has no `disabled` prop yet — this panel is fully interactive. When the table itself is
      disabled, DataTableRoot wraps its chrome in the LC-40 fragment instead.
    </Text>
  </YStack>
);
NoDisabledApi.storyName = 'No Disabled API';

export const MinimalColumns = () => {
  const minimalColumns = transformedColumns.slice(0, 3);

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Minimal Columns
      </Text>

      <DataTableViewOptions
        columns={minimalColumns}
        onColumnVisibilityChange={() => {}}
        onColumnOrderChange={() => {}}
        onColumnSizingChange={() => {}}
        onSaveView={() => {}}
        onLoadView={() => {}}
        onResetToDefault={() => {}}
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Example with only a few columns to manage.
      </Text>
    </YStack>
  );
};

export const AllOptionsCombined = () => {
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({});
  const [density, _setDensity] = React.useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [pageSize, _setPageSize] = React.useState(10);

  return (
    <YStack
      gap="$6"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        All View Options Combined
      </Text>

      <DataTableViewOptions
        columns={transformedColumns}
        onColumnVisibilityChange={(columnId, visible) => {
          setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }));
          action('column-visibility')({ [columnId]: visible });
        }}
        onColumnOrderChange={() => {}}
        onColumnSizingChange={() => {}}
        onSaveView={() => {}}
        onLoadView={() => {}}
        onResetToDefault={() => {}}
      />

      <Card
        padding="$4"
        borderRadius="$4">
        <YStack gap="$3">
          <Text
            fontSize="$3"
            fontWeight="500">
            Current Configuration:
          </Text>

          <XStack
            gap="$4"
            flexWrap="wrap">
            <YStack gap="$1">
              <Text
                fontSize="$2"
                fontWeight="500"
                color="$gray12">
                Density
              </Text>
              <Text
                fontSize="$3"
                color="$blue11">
                {density}
              </Text>
            </YStack>

            <YStack gap="$1">
              <Text
                fontSize="$2"
                fontWeight="500"
                color="$gray12">
                Page Size
              </Text>
              <Text
                fontSize="$3"
                color="$green11">
                {pageSize} items
              </Text>
            </YStack>

            <YStack gap="$1">
              <Text
                fontSize="$2"
                fontWeight="500"
                color="$gray12">
                Visible Columns
              </Text>
              <Text
                fontSize="$3"
                color="$purple11">
                {Object.keys(columnVisibility).filter((key) => columnVisibility[key]).length ||
                  transformedColumns.length}{' '}
                of {transformedColumns.length}
              </Text>
            </YStack>
          </XStack>
        </YStack>
      </Card>
    </YStack>
  );
};

const savedViews: TableView[] = [
  {
    id: 'all',
    name: 'All products',
    columns: {},
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 10 },
  },
  {
    id: 'in-stock',
    name: 'In stock',
    columns: {},
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 10 },
  },
];

export const WithSavedViews = () => {
  const [views, setViews] = React.useState<TableView[]>(savedViews);
  const [activeViewId, setActiveViewId] = React.useState('all');

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Saved Views
      </Text>

      <DataTableViewOptions
        columns={transformedColumns}
        onColumnVisibilityChange={() => {}}
        views={views}
        activeViewId={activeViewId}
        showViewManagement
        onSaveView={(name) => {
          const id = name.toLowerCase().replaceAll(/\s+/g, '-');
          setViews((prev) => [...prev, { ...savedViews[0], id, name }]);
          setActiveViewId(id);
          action('save-view')(name);
        }}
        onLoadView={(viewId) => {
          setActiveViewId(viewId);
          action('load-view')(viewId);
        }}
        onResetToDefault={() => {}}
      />
    </YStack>
  );
};
