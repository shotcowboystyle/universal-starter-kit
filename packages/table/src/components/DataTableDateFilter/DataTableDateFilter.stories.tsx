import { action } from '@repo/storybook';
import { formatAbsoluteDate } from '@repo/theme';
import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';

import { DataTableDateFilter, applyDateFilter } from './index';
import type { DateFilterValue } from './index';

// Define the data type
interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  createdAt: string;
  dueDate?: string;
}

// Sample data
const sampleTasks: Task[] = [
  {
    id: '1',
    title: 'Implement user authentication',
    status: 'in-progress',
    createdAt: '2024-01-15T10:00:00.000Z',
    dueDate: '2024-01-20T17:00:00.000Z',
  },
  {
    id: '2',
    title: 'Design landing page',
    status: 'todo',
    createdAt: '2024-01-16T09:00:00.000Z',
    dueDate: '2024-01-25T17:00:00.000Z',
  },
  {
    id: '3',
    title: 'Write unit tests',
    status: 'done',
    createdAt: '2024-01-17T14:00:00.000Z',
  },
  {
    id: '4',
    title: 'Setup CI/CD pipeline',
    status: 'todo',
    createdAt: new Date().toISOString(), // Today
  },
  {
    id: '5',
    title: 'Database optimization',
    status: 'in-progress',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
  },
];

export default {
  title: 'Table/DataTableDateFilter',
  component: DataTableDateFilter,
  parameters: {
    docs: {
      description: {
        component: 'A date filter component for data tables with various filtering options.',
      },
    },
  },
};

export const Default = () => {
  const [filterValue, setFilterValue] = React.useState<DateFilterValue | undefined>();

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Date Filter Demo
      </Text>

      <DataTableDateFilter
        value={filterValue}
        onChange={setFilterValue}
        placeholder="Filter by date..."
      />

      <Card
        padding="$4"
        borderRadius="$4">
        <YStack gap="$2">
          <Text
            fontSize="$3"
            fontWeight="500">
            Current Filter:
          </Text>
          <Text
            fontSize="$2"
            color="$gray11">
            {filterValue
              ? `${filterValue.operator}${filterValue.value ? ` - ${filterValue.value}` : ''}${filterValue.values ? ` - ${filterValue.values.join(' to ')}` : ''}`
              : 'No filter applied'}
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
};

Default.storyName = 'Main';
export const WithPresetsOnly = () => {
  const [filterValue, setFilterValue] = React.useState<DateFilterValue | undefined>();

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Quick Presets Only
      </Text>

      <DataTableDateFilter
        value={filterValue}
        onChange={setFilterValue}
        showPresets={true}
        placeholder="Choose a preset..."
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Current: {filterValue?.operator ?? 'None'}
      </Text>
    </YStack>
  );
};

export const CustomPresets = () => {
  const [filterValue, setFilterValue] = React.useState<DateFilterValue | undefined>();

  const customPresets = [
    {
      id: 'quarter1',
      label: 'Q1 2024',
      operator: 'isBetween' as const,
      values: ['2024-01-01T00:00:00.000Z', '2024-03-31T23:59:59.999Z'] as [string, string],
    },
    {
      id: 'quarter2',
      label: 'Q2 2024',
      operator: 'isBetween' as const,
      values: ['2024-04-01T00:00:00.000Z', '2024-06-30T23:59:59.999Z'] as [string, string],
    },
    {
      id: 'thisSprint',
      label: 'This Sprint',
      operator: 'isBetween' as const,
      values: [new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString()] as [
        string,
        string,
      ],
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Custom Presets
      </Text>

      <DataTableDateFilter
        value={filterValue}
        onChange={setFilterValue}
        customPresets={customPresets}
        placeholder="Choose date range..."
      />

      <Text
        fontSize="$3"
        color="$gray11">
        Current: {filterValue?.operator ?? 'None'}
      </Text>
    </YStack>
  );
};

export const Disabled = () => (
  <YStack
    gap="$4"
    padding="$4">
    <Text
      fontSize="$4"
      fontWeight="600">
      Disabled State
    </Text>

    <DataTableDateFilter
      disabled
      placeholder="Filter disabled..."
    />

    <Text
      fontSize="$3"
      color="$gray11">
      This filter is disabled and cannot be interacted with.
    </Text>
  </YStack>
);

export const WithDateConstraints = () => {
  const [filterValue, setFilterValue] = React.useState<DateFilterValue | undefined>();

  const minDate = new Date(2024, 0, 1); // January 1, 2024
  const maxDate = new Date(2024, 11, 31); // December 31, 2024

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Date Constraints
      </Text>

      <DataTableDateFilter
        value={filterValue}
        onChange={setFilterValue}
        minDate={minDate}
        maxDate={maxDate}
        placeholder="Select date (2024 only)..."
      />

      <YStack gap="$2">
        <Text
          fontSize="$3"
          color="$gray11">
          Min Date: {formatAbsoluteDate(minDate, { year: 'always' })}
        </Text>
        <Text
          fontSize="$3"
          color="$gray11">
          Max Date: {formatAbsoluteDate(maxDate, { year: 'always' })}
        </Text>
      </YStack>
    </YStack>
  );
};

export const DifferentDisplayFormats = () => {
  const filters: { label: string; value: DateFilterValue }[] = [
    {
      label: 'Exact Date',
      value: { operator: 'is', value: '2024-01-15T10:00:00.000Z' },
    },
    {
      label: 'Date Range',
      value: {
        operator: 'isBetween',
        values: ['2024-01-15T00:00:00.000Z', '2024-01-20T23:59:59.999Z'],
      },
    },
    {
      label: 'Before Date',
      value: { operator: 'isBefore', value: '2024-01-15T10:00:00.000Z' },
    },
    {
      label: 'This Week',
      value: { operator: 'isThisWeek' },
    },
    {
      label: 'Empty Values',
      value: { operator: 'isEmpty' },
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Different Display Formats
      </Text>

      <YStack gap="$3">
        {filters.map((filter) => (
          <XStack
            key={filter.label}
            alignItems="center"
            gap="$3">
            <Text
              fontSize="$3"
              fontWeight="500"
              minWidth={120}>
              {filter.label}:
            </Text>
            <DataTableDateFilter
              value={filter.value}
              onChange={action(`${filter.label} changed`)}
            />
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
};

export const WithDataIntegration = () => {
  const [filterValue, setFilterValue] = React.useState<DateFilterValue | undefined>();

  // The package's own operator engine — covers every operator the panel can
  // emit (incl. isBetween/isOnOrAfter from the custom-range pickers).
  const filteredTasks = React.useMemo(() => applyDateFilter(sampleTasks, 'createdAt', filterValue), [filterValue]);

  return (
    <YStack
      gap="$6"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Data Integration Example
      </Text>

      <DataTableDateFilter
        value={filterValue}
        onChange={setFilterValue}
        placeholder="Filter tasks by creation date..."
      />

      <Card
        padding="$4"
        borderRadius="$4">
        <YStack gap="$3">
          <Text
            fontSize="$3"
            fontWeight="500">
            Filtered Results ({filteredTasks.length} tasks):
          </Text>

          <YStack gap="$2">
            {filteredTasks.map((task) => (
              <XStack
                key={task.id}
                gap="$3"
                padding="$2"
                backgroundColor="$gray2"
                borderRadius="$2">
                <YStack flex={1}>
                  <Text
                    fontSize="$3"
                    fontWeight="500">
                    {task.title}
                  </Text>
                  <Text
                    fontSize="$2"
                    color="$gray11">
                    Created: {formatAbsoluteDate(task.createdAt)}
                  </Text>
                </YStack>
                <Text
                  fontSize="$2"
                  color={task.status === 'done' ? '$green11' : task.status === 'in-progress' ? '$blue11' : '$gray11'}>
                  {task.status}
                </Text>
              </XStack>
            ))}
          </YStack>
        </YStack>
      </Card>
    </YStack>
  );
};
