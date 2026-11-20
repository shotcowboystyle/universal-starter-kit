/**
 * DataTableMobileCards — the stacked card body for `layout="cards"`.
 *
 * Below `$sm` (or forced) a DataTable stops being a grid: each row becomes a
 * card whose first visible column is the title and whose remaining columns
 * become label/value rows. Column visibility, order, sorting and filtering all
 * come from the same table state as the grid — the cells run through the same
 * renderers inside `TableCellContext`, so fields stay chromeless.
 *
 * Selection, row numbers and delete live in the card header beside the title.
 */

import type { Meta } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { YStack } from 'tamagui';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';
import type { DataTableRootProps } from './index';

const meta: Meta = {
  title: 'Table/DataTableMobileCards',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'One card per row: title in the header, remaining columns as label/value rows. ' +
          'Select-all sits above the stack; per-row select, row number and delete sit in the card header.',
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

const CardTable = (props: Partial<DataTableRootProps<Person>>) => (
  <YStack
    padding="$4"
    width="100%"
    maxWidth={480}>
    <DataTable
      data={people}
      columns={columns}
      layout="cards"
      aria-label="People as cards"
      {...props}
    />
  </YStack>
);

/** Card anatomy: title header, then one label/value row per remaining column. */
export const Default = {
  name: 'Main',
  render: () => <CardTable />,
};

/** Select-all above the stack, a checkbox in every card header. */
export const Selection = {
  render: () => <CardTable enableRowSelection />,
};

/**
 * `onRowPress` makes each card one pressable unit. A pressed card paints one
 * ramp step above the fill it rests on, never below `$color4`, so the press
 * shows at every elevation and on a zebra stripe.
 */
export const Pressable = {
  render: () => (
    <CardTable
      onRowPress={fn()}
      rowLabel={(row: Person) => `${row.firstName} ${row.lastName}`}
    />
  ),
};

const DeletableCards = () => {
  const [rows, setRows] = useState(people);
  return (
    <YStack
      padding="$4"
      width="100%"
      maxWidth={480}>
      <DataTable
        data={rows}
        columns={columns}
        layout="cards"
        showRowNumbers
        showDeleteRow
        minRows={1}
        onDataChange={(next: Person[]) => {
          setRows(next);
        }}
        aria-label="People as deletable cards"
      />
    </YStack>
  );
};

/**
 * Row numbers and the delete affordance share the card header with the title.
 * The parent owns `data` — the card asks via onDataChange, it does not splice.
 */
export const RowChrome = {
  render: () => <DeletableCards />,
};

/** A single visible column: the header carries the title and there are no field rows. */
export const TitleOnly = {
  render: () => <CardTable columns={[{ accessorKey: 'firstName', header: 'First Name' } as DataTableColumn<Person>]} />,
};

/** No rows and no filters: the empty state reads "No data available". */
export const Empty = {
  render: () => (
    <YStack
      padding="$4"
      width="100%"
      maxWidth={480}>
      <DataTable
        data={[]}
        columns={columns}
        layout="cards"
        aria-label="Empty card list"
      />
    </YStack>
  ),
};
