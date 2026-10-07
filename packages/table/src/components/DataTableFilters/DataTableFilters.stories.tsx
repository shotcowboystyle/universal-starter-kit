import { Card } from '@repo/ui';
import { action } from '@repo/storybook';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { Text, View, YStack } from 'tamagui';

import type { DataTableColumnType, FacetedFilterOption, TableFilter } from '../../types';

import { DataTableFilters } from './index';

const meta: Meta<typeof DataTableFilters> = {
  title: 'Table/DataTableFilters',
  component: DataTableFilters,
  parameters: {
    docs: {
      description: {
        component:
          'A comprehensive filtering component for data tables with support for multiple filter types and operators.',
      },
    },
  },
  argTypes: {
    maxFilters: {
      control: 'number',
      description: 'Maximum number of filters allowed',
    },
    showFilterCount: {
      control: 'boolean',
      description: 'Whether to show the active filter count',
    },
    compact: {
      control: 'boolean',
      description: 'Whether to use compact layout',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DataTableFilters>;

const sampleColumns = [
  {
    id: 'name',
    label: 'Name',
    type: 'text' as DataTableColumnType,
  },
  {
    id: 'age',
    label: 'Age',
    type: 'number' as DataTableColumnType,
  },
  {
    id: 'status',
    label: 'Status',
    type: 'select' as DataTableColumnType,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
      { label: 'Pending', value: 'pending' },
    ] as FacetedFilterOption[],
  },
  {
    id: 'email',
    label: 'Email',
    type: 'text' as DataTableColumnType,
  },
  {
    id: 'salary',
    label: 'Salary',
    type: 'number' as DataTableColumnType,
  },
  {
    id: 'hireDate',
    label: 'Hire Date',
    type: 'date' as DataTableColumnType,
  },
];

const sampleFilters: TableFilter[] = [
  {
    id: 'filter1',
    columnId: 'name',
    value: { operator: 'contains', value: 'John' },
  },
  {
    id: 'filter2',
    columnId: 'age',
    value: { operator: 'isGreaterThan', value: 25 },
  },
  {
    id: 'filter3',
    columnId: 'status',
    value: { operator: 'is', value: 'active' },
  },
];

export const Basic: Story = {
  name: 'Main',
  args: {
    filters: [],
    onFiltersChange: action('onFiltersChange'),
    onAddFilter: action('onAddFilter'),
    onRemoveFilter: action('onRemoveFilter'),
    onClearFilters: action('onClearFilters'),
    availableColumns: sampleColumns,
    maxFilters: 10,
    showFilterCount: true,
    compact: false,
  },
};

export const WithFilters: Story = {
  args: {
    ...Basic.args,
    filters: sampleFilters,
  },
};

export const Compact: Story = {
  args: {
    ...Basic.args,
    filters: sampleFilters,
    compact: true,
  },
};

export const NoFilterCount: Story = {
  args: {
    ...Basic.args,
    filters: sampleFilters,
    showFilterCount: false,
  },
};

export const TextFilters: Story = {
  args: {
    ...Basic.args,
    filters: [
      {
        id: 'name-contains',
        columnId: 'name',
        value: { operator: 'contains', value: 'John' },
      },
      {
        id: 'name-equals',
        columnId: 'name',
        value: { operator: 'is', value: 'John Doe' },
      },
      {
        id: 'name-starts-with',
        columnId: 'name',
        value: { operator: 'startsWith', value: 'J' },
      },
      {
        id: 'email-contains',
        columnId: 'email',
        value: { operator: 'contains', value: '@company.com' },
      },
    ],
  },
};

export const NumberFilters: Story = {
  args: {
    ...Basic.args,
    filters: [
      {
        id: 'age-equals',
        columnId: 'age',
        value: { operator: 'is', value: 30 },
      },
      {
        id: 'age-gte',
        columnId: 'age',
        value: { operator: 'isGreaterThan', value: 25 },
      },
      {
        id: 'age-lte',
        columnId: 'age',
        value: { operator: 'isLessThan', value: 65 },
      },
      {
        id: 'age-between',
        columnId: 'age',
        value: { operator: 'isBetween', value: null, values: [25, 35] },
      },
      {
        id: 'salary-gte',
        columnId: 'salary',
        value: { operator: 'isGreaterThan', value: 50_000 },
      },
    ],
  },
};

export const SelectFilters: Story = {
  args: {
    ...Basic.args,
    filters: [
      {
        id: 'status-equals',
        columnId: 'status',
        value: { operator: 'is', value: 'active' },
      },
      {
        id: 'status-in',
        columnId: 'status',
        value: {
          operator: 'isAnyOf',
          value: null,
          values: ['active', 'pending'],
        },
      },
    ],
  },
};

export const DateFilters: Story = {
  args: {
    ...Basic.args,
    filters: [
      {
        id: 'hire-date-equals',
        columnId: 'hireDate',
        value: { operator: 'is', value: new Date('2023-01-15') },
      },
      {
        id: 'hire-date-before',
        columnId: 'hireDate',
        value: { operator: 'isBefore', value: new Date('2024-01-01') },
      },
      {
        id: 'hire-date-after',
        columnId: 'hireDate',
        value: { operator: 'isAfter', value: new Date('2023-01-01') },
      },
      {
        id: 'hire-date-between',
        columnId: 'hireDate',
        value: {
          operator: 'isBetween',
          value: null,
          values: [new Date('2023-01-01'), new Date('2023-12-31')],
        },
      },
    ],
  },
};

export const ComplexFilters: Story = {
  args: {
    ...Basic.args,
    filters: [
      {
        id: 'complex1',
        columnId: 'name',
        value: { operator: 'contains', value: 'John' },
      },
      {
        id: 'complex2',
        columnId: 'age',
        value: { operator: 'isBetween', value: null, values: [25, 40] },
      },
      {
        id: 'complex3',
        columnId: 'status',
        value: { operator: 'is', value: 'active' },
      },
      {
        id: 'complex4',
        columnId: 'salary',
        value: { operator: 'isGreaterThan', value: 60_000 },
      },
      {
        id: 'complex5',
        columnId: 'hireDate',
        value: { operator: 'isAfter', value: new Date('2022-01-01') },
      },
    ],
  },
};

export const MaxFilters: Story = {
  args: {
    ...Basic.args,
    filters: Array.from({ length: 5 }, (_, i) => ({
      id: `max-filter-${i}`,
      columnId: 'name',
      value: { operator: 'contains' as const, value: `filter ${i}` },
    })),
    maxFilters: 5,
  },
};

export const InteractiveDemo: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const InteractiveDemo = () => {
      const [filters, setFilters] = React.useState<TableFilter[]>(sampleFilters);

      const handleAddFilter = (filter: Omit<TableFilter, 'id'>) => {
        const newFilter: TableFilter = {
          ...filter,
          id: `filter-${Date.now()}`,
        };
        setFilters([...filters, newFilter]);
        action('onAddFilter')(newFilter);
      };

      const handleRemoveFilter = (filterId: string) => {
        setFilters(filters.filter((f) => f.id !== filterId));
        action('onRemoveFilter')(filterId);
      };

      const handleClearFilters = () => {
        setFilters([]);
        action('onClearFilters')();
      };

      const handleFiltersChange = (newFilters: TableFilter[]) => {
        setFilters(newFilters);
        action('onFiltersChange')(newFilters);
      };

      return (
        <YStack gap="$4">
          <DataTableFilters
            {...args}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onAddFilter={handleAddFilter}
            onRemoveFilter={handleRemoveFilter}
            onClearFilters={handleClearFilters}
          />

          <Card>
            <Text
              fontSize="$4"
              fontWeight="bold">
              Current Filters:
            </Text>
            <pre style={{ fontSize: '12px', margin: 0 }}>{JSON.stringify(filters, null, 2)}</pre>
          </Card>
        </YStack>
      );
    };

    return <InteractiveDemo />;
  },
};

export const ErrorStates: Story = {
  args: {
    ...Basic.args,
    filters: [
      {
        id: 'error-filter',
        columnId: 'nonexistent',
        value: { operator: 'is', value: 'error' },
      },
    ],
  },
  render: (args) => (
    <View>
      <DataTableFilters {...args} />
      <View
        style={{
          marginTop: '10px',
          padding: '8px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
        }}>
        Error: Filter references nonexistent column "nonexistent"
      </View>
    </View>
  ),
};

export const LoadingStates: Story = {
  args: {
    ...Basic.args,
  },
  render: (args) => {
    const LoadingDemo = () => {
      const [isLoading, setIsLoading] = React.useState(false);

      const handleAddFilter = (filter: Omit<TableFilter, 'id'>) => {
        setIsLoading(true);
        setTimeout(() => {
          setIsLoading(false);
        }, 2000);
        action('onAddFilter')(filter);
      };

      return (
        <View>
          <DataTableFilters
            {...args}
            onAddFilter={handleAddFilter}
          />
          {isLoading && (
            <View style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>🔄 Applying filter...</View>
          )}
        </View>
      );
    };

    return <LoadingDemo />;
  },
};

export const Accessibility: Story = {
  args: {
    ...Basic.args,
    filters: sampleFilters,
  },
  render: (args) => (
    <YStack gap="$4">
      <DataTableFilters {...args} />
      <Card>
        <Text
          fontSize="$4"
          fontWeight="bold">
          Accessibility Features:
        </Text>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Filter buttons have proper ARIA labels</li>
          <li>Filter inputs support keyboard navigation</li>
          <li>Screen reader announcements for filter changes</li>
          <li>Focus management between filter controls</li>
          <li>Proper semantic markup for filter badges</li>
        </ul>
      </Card>
    </YStack>
  ),
};

export const Responsive: Story = {
  args: {
    ...ComplexFilters.args,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export const ManyFilters: Story = {
  args: {
    ...Basic.args,
    filters: Array.from({ length: 8 }, (_, i) => {
      const columnId = ['name', 'age', 'status', 'email'][i % 4];
      const operator = ['contains', 'isGreaterThan', 'is', 'contains'][i % 4] as any;
      const filterValue = ['filter', 25, 'active', '@domain.com'][i % 4];
      return {
        id: `many-filter-${i}`,
        columnId,
        value: { operator, value: filterValue },
      };
    }),
  },
};

// Import React for JSX
import React from 'react';
