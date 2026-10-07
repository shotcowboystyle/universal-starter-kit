/**
 * DataTableCardControls — the sort + filter row above the card list.
 *
 * The grid puts sorting and per-column filtering in the column headers. The
 * card layout has no headers, so this toolbar restores both: a sort menu that
 * cycles none → asc → desc per sortable column (the same cycle as a header
 * click) and the canonical all-field Filter. Both drive the same table
 * state as the grid — there is no parallel state.
 *
 * It only exists in `layout="cards"`, which is why these stories pin the
 * layout instead of relying on the viewport.
 */

import type { Meta } from '@storybook/react-native-web-vite';
import { Paragraph, YStack } from 'tamagui';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

const meta: Meta = {
  title: 'Table/DataTableCardControls',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "Sort menu plus filter chrome above the card list, standing in for the grid's " +
          'column headers. Renders only in the cards layout, and only when sorting or ' +
          'filtering is enabled.',
      },
    },
  },
};

export default meta;

interface Person {
  id: number;
  firstName: string;
  lastName: string;
  age: number;
  email: string;
}

const people: Person[] = [
  { id: 1, firstName: 'John', lastName: 'Doe', age: 28, email: 'john@example.com' },
  { id: 2, firstName: 'Jane', lastName: 'Smith', age: 32, email: 'jane@example.com' },
  { id: 3, firstName: 'Bob', lastName: 'Johnson', age: 45, email: 'bob@example.com' },
  { id: 4, firstName: 'Alice', lastName: 'Williams', age: 22, email: 'alice@example.com' },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'lastName', header: 'Last Name' },
  { accessorKey: 'age', header: 'Age' },
  { accessorKey: 'email', header: 'Email' },
];

function CardTable(props: Record<string, any>) {
  return (
    <YStack
      padding="$4"
      width="100%"
      maxWidth={520}>
      <DataTable
        data={people}
        columns={columns}
        layout="cards"
        aria-label="People as cards"
        {...props}
      />
    </YStack>
  );
}

/** Default cards keep Filter and Sort together. */
export const Default = {
  name: 'Main',
  render: () => (
    <CardTable
      enableSorting
      enableFiltering
    />
  ),
};

/** Sorting only — no filter chrome in the row. */
export const SortOnly = {
  render: () => (
    <CardTable
      enableSorting
      enableFiltering={false}
    />
  ),
};

/** Filtering only — no Sort menu in the row. */
export const FilterOnly = {
  render: () => (
    <CardTable
      enableSorting={false}
      enableFiltering
    />
  ),
};

/**
 * With a sort already applied the button reads the column and direction
 * (`Age ↑`) instead of the bare "Sort", so the card list is never sorted
 * invisibly.
 */
export const ActiveSort = {
  render: () => (
    <CardTable
      enableSorting
      enableFiltering
      initialState={{ sorting: [{ id: 'age', desc: false }] }}
    />
  ),
};

/** UX-011: the whole table disabled renders the controls inert and LC-40 visible. */
export const Disabled = {
  render: () => (
    <CardTable
      enableSorting
      enableFiltering
      disabled
    />
  ),
};

/** Neither enabled: the toolbar is absent, not an empty bar taking vertical space. */
export const NoControls = {
  render: () => (
    <YStack
      padding="$4"
      gap="$2"
      width="100%"
      maxWidth={520}>
      <Paragraph size="$2">Sorting and filtering off — no control row above the cards.</Paragraph>
      <CardTable
        enableSorting={false}
        enableFiltering={false}
      />
    </YStack>
  ),
};

export const MobileControls = {
  args: { width: 390, search: true, views: true, fetching: true, longSort: true, disabled: false },
  argTypes: {
    width: { control: 'select', options: [320, 390] },
    search: { control: 'boolean' },
    views: { control: 'boolean' },
    fetching: { control: 'boolean' },
    longSort: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  render: (args: {
    width: number;
    search: boolean;
    views: boolean;
    fetching: boolean;
    longSort: boolean;
    disabled: boolean;
  }) => (
    <YStack
      width={args.width}
      maxWidth="100%"
      padding="$3">
      <DataTable
        key={String(args.longSort)}
        data={people.map((person) => ({ ...person, year: person.id < 3 ? 2023 : 2024 }))}
        columns={[
          {
            accessorKey: 'firstName',
            header: 'Name with a long distinguishing classification suffix',
          },
          { accessorKey: 'age', header: 'Age' },
        ]}
        filterableFields={[{ id: 'year', label: 'Year', type: 'number' }]}
        layout="cards"
        enableGlobalSearch={args.search}
        enableViews={args.views}
        isFetching={args.fetching}
        disabled={args.disabled}
        initialState={{
          filters: [{ id: 'year', columnId: 'year', value: { operator: 'is', value: '2023' } }],
          sorting: args.longSort ? [{ id: 'firstName', desc: false }] : [],
          activeViewId: 'long',
          views: [
            {
              id: 'long',
              name: 'Saved view with a long distinguishing classification suffix',
              columns: {},
              filters: [],
              sorting: [],
              pagination: { pageIndex: 0, pageSize: 10 },
            },
          ],
        }}
      />
    </YStack>
  ),
};

export const CustomToolbarFallback = {
  render: () => <CardTable renderToolbar={() => <Paragraph>Custom toolbar</Paragraph>} />,
};
