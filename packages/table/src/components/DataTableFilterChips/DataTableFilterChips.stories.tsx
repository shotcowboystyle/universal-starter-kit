/**
 * DataTableFilterChips — every active filter as a removable pill under the
 * toolbar (Axiom 6 HONEST STATE), including filters on fields with no
 * visible column. Chip press reopens the shared editor; X removes; Clear
 * all appears at 2+ chips.
 */

import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import type { DataTableColumn, FilterableField, TableFilter } from '../../types';
import { DataTable } from '../DataTable';

const meta: Meta = {
  title: 'Table/DataTableFilterChips',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Wrapping pills for every active filter. Gray fill, two focusables per chip ' +
          '(edit + dismiss), Clear all from the second chip on.',
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

const emailContains = (value: string): TableFilter => ({
  id: 'flt-email',
  columnId: 'email',
  value: { operator: 'contains', value },
  label: 'Email',
});

const departmentIs = (value: string): TableFilter => ({
  id: 'flt-department',
  columnId: 'department',
  value: { operator: 'is', value },
  label: 'Department',
});

const ChipTable = ({ initialFilters }: { initialFilters: TableFilter[] }) => (
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
      aria-label="People with filter chips"
    />
  </YStack>
);

export const Default = {
  name: 'Main',
  render: () => <ChipTable initialFilters={[emailContains('corp')]} />,
};

/** Clear all lands once two chips are active. */
export const ClearAll = {
  render: () => <ChipTable initialFilters={[emailContains('corp'), departmentIs('Engineering')]} />,
};
