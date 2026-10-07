import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';

import type { DataTableColumn, TableView } from '../../types';
import { DataTable } from '../DataTable';

import { DataTableToolbar } from './index';

const meta: Meta<typeof DataTableToolbar> = {
  title: 'Table/DataTableToolbar',
  component: DataTableToolbar,
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

interface Employee {
  id: number;
  name: string;
  role: string;
  department: string;
  status: 'active' | 'inactive';
}

const employees: Employee[] = [
  { id: 1, name: 'Alice Johnson', role: 'Developer', department: 'Engineering', status: 'active' },
  { id: 2, name: 'Bob Smith', role: 'Designer', department: 'Design', status: 'active' },
  { id: 3, name: 'Carol Davis', role: 'Manager', department: 'Engineering', status: 'inactive' },
  { id: 4, name: 'David Lee', role: 'Analyst', department: 'Finance', status: 'active' },
  { id: 5, name: 'Emma Wilson', role: 'Developer', department: 'Engineering', status: 'active' },
  { id: 6, name: 'Frank Moore', role: 'Recruiter', department: 'HR', status: 'inactive' },
  { id: 7, name: 'Grace Chen', role: 'Marketer', department: 'Marketing', status: 'active' },
  { id: 8, name: 'Henry Patel', role: 'Developer', department: 'Engineering', status: 'active' },
];

const employeeColumns: DataTableColumn<Employee>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'department', header: 'Department' },
  { accessorKey: 'status', header: 'Status' },
];

const sampleViews: TableView[] = [
  {
    id: 'view-all',
    name: 'All Employees',
    columns: {},
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 10 },
  },
  {
    id: 'view-engineering',
    name: 'Engineering Only',
    columns: {},
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 10 },
  },
];

const MainStory = () => (
  <YStack padding="$4">
    <DataTable
      data={employees}
      columns={employeeColumns}
      enableGlobalSearch
      enableViews
      initialState={{ pagination: { pageIndex: 1, pageSize: 3 } }}
      renderToolbar={(props) => (
        <DataTableToolbar
          {...props}
          enableViews
          enableExport
        />
      )}
      aria-label="Employee table with toolbar"
    />
  </YStack>
);

export const Default = {
  name: 'Main',
  render: () => <MainStory />,
};

const SearchOnlyStory = () => {
  const [search, setSearch] = useState('');
  return (
    <YStack
      padding="$4"
      maxWidth={560}>
      <DataTableToolbar
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        onClearFilters={() => {
          setSearch('');
        }}
      />
    </YStack>
  );
};

export const SearchOnly = {
  render: () => <SearchOnlyStory />,
};

const WithViewsStory = () => {
  const [search, setSearch] = useState('');
  const [views, setViews] = useState<TableView[]>(sampleViews);
  const [activeViewId, setActiveViewId] = useState('view-engineering');
  return (
    <YStack
      padding="$4"
      maxWidth={640}>
      <DataTableToolbar
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        onClearFilters={() => {
          setSearch('');
        }}
        enableViews
        views={views}
        activeViewId={activeViewId}
        onSaveView={(name) => {
          const id = `view-${Date.now()}`;
          setViews((prev) => [
            ...prev,
            {
              id,
              name,
              columns: {},
              filters: [],
              sorting: [],
              pagination: { pageIndex: 0, pageSize: 10 },
            },
          ]);
          setActiveViewId(id);
          action('save-view')(name);
        }}
        onLoadView={(viewId) => {
          setActiveViewId(viewId);
          action('load-view')(viewId);
        }}
      />
    </YStack>
  );
};

export const WithViews = {
  render: () => <WithViewsStory />,
};

const WithCustomActionsStory = () => {
  const [search, setSearch] = useState('');
  return (
    <YStack
      padding="$4"
      maxWidth={640}>
      <DataTableToolbar
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        onClearFilters={() => {
          setSearch('');
        }}
        customActions={
          <XStack gap="$2">
            <Button
              size="$2"
              onPress={() => action('refresh')()}>
              Refresh
            </Button>
            <Button
              size="$2"
              onPress={() => action('export')()}>
              Export
            </Button>
          </XStack>
        }
      />
    </YStack>
  );
};

export const WithCustomActions = {
  render: () => <WithCustomActionsStory />,
};
