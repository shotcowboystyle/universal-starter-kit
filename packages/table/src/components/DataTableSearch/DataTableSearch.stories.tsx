import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { DataTableSearch } from './index';

interface Row {
  id: number;
  name: string;
  email: string;
  role: string;
}

const data: Row[] = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'Developer' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'Designer' },
  { id: 3, name: 'Carol Davis', email: 'carol@example.com', role: 'Manager' },
];

const columns = [
  { accessorKey: 'name', header: 'Name', searchable: true },
  { accessorKey: 'email', header: 'Email', searchable: true },
  { accessorKey: 'role', header: 'Role', searchable: true },
];

const meta: Meta = {
  title: 'Table/DataTableSearch',
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => (
    <YStack
      width={480}
      padding="$4">
      <DataTableSearch
        data={data}
        columns={columns}
        onSearchResults={(results) => {
          console.log('Results:', results.length);
        }}
        placeholder="Search..."
      />
    </YStack>
  ),
};
