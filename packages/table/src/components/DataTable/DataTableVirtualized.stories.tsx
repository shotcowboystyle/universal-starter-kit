/**
 * DataTableVirtualized is an internal body renderer. The public surface is
 * DataTable with enableVirtualization — mounting the helper bare crashed
 * playground SSR on virtualItems.map. This catalog row is that mode, not
 * the helper's prop dump.
 */

import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

const meta: Meta = {
  title: 'Table/DataTableVirtualized',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Virtual-scroll body for large row sets. Enable it on DataTable; do not mount ' +
          'DataTableVirtualized as a standalone component.',
      },
    },
  },
};

export default meta;

interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
  salary: number;
}

const departments = ['Engineering', 'Marketing', 'Sales', 'Design', 'Support'];

const rows: Employee[] = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1,
  name: `Employee ${i + 1}`,
  email: `emp${i + 1}@example.com`,
  department: departments[i % departments.length],
  salary: 50_000 + (i % 80) * 1000,
}));

const columns: DataTableColumn<Employee>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'department', header: 'Department' },
  { accessorKey: 'salary', header: 'Salary' },
];

export const Default = {
  name: 'Main',
  render: () => (
    <YStack
      padding="$4"
      height={360}>
      <DataTable
        data={rows}
        columns={columns}
        enableVirtualization
        virtualizationHeight={320}
        enableGlobalSearch
        aria-label="Virtualized employees"
      />
    </YStack>
  ),
};
