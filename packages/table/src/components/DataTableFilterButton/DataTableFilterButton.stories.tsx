/**
 * DataTableFilterButton — toolbar Filter affordance. It reads
 * DataTableStateContext, so these stories mount it the way the toolbar does:
 * inside DataTable with filterableFields. Stage 1 is the searchable field
 * list (visible columns first, then More fields). Stage 2 is the shared
 * operator/value editor (MPO-101). Commit is live (LC-21).
 */

import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import type { DataTableColumn, FilterableField, TableFilter } from '../../types';
import { DataTable } from '../DataTable';

const meta: Meta = {
  title: 'Table/DataTableFilterButton',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Toolbar Filter control for any field, including hidden ones. Opens a ' +
          'FloatingPanel with a searchable field list, then the shared operator/value editor.',
      },
    },
  },
};

export default meta;

interface Person {
  id: number;
  firstName: string;
  age: number;
  email: string;
  department: string;
}

const people: Person[] = [
  { id: 1, firstName: 'Ada', age: 36, email: 'ada@corp.com', department: 'Engineering' },
  { id: 2, firstName: 'Grace', age: 45, email: 'grace@corp.com', department: 'Engineering' },
  { id: 3, firstName: 'Alan', age: 41, email: 'alan@other.org', department: 'Marketing' },
  { id: 4, firstName: 'Katherine', age: 29, email: 'kate@corp.com', department: 'Design' },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

const filterableFields: FilterableField[] = [
  { id: 'firstName', label: 'First Name', type: 'text' },
  { id: 'age', label: 'Age', type: 'number' },
  { id: 'email', label: 'Email', type: 'text' },
  {
    id: 'department',
    label: 'Department',
    type: 'select',
    options: [
      { label: 'Engineering', value: 'Engineering' },
      { label: 'Marketing', value: 'Marketing' },
      { label: 'Design', value: 'Design' },
    ],
  },
];

function emailContains(value: string): TableFilter {
  return {
    id: 'flt-email',
    columnId: 'email',
    value: { operator: 'contains', value },
    label: 'Email',
  };
}

function FilterTable({ initialFilters = [] }: { initialFilters?: TableFilter[] }) {
  return (
    <YStack
      padding="$4"
      width="100%">
      <DataTable
        data={people}
        columns={columns}
        filterableFields={filterableFields}
        enableFiltering
        enableGlobalSearch
        initialState={{ filters: initialFilters }}
        aria-label="People with toolbar filter"
      />
    </YStack>
  );
}

export const Default = {
  name: 'Main',
  render: () => <FilterTable />,
};

/** Active filters turn the trigger accent and stamp the count (Filter (N)). */
export const ActiveCount = {
  render: () => <FilterTable initialFilters={[emailContains('corp')]} />,
};
