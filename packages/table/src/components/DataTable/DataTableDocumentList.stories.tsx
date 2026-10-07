/**
 * DataTableDocumentList — subject-led document rows for `layout="list"`.
 *
 * This is the desk List view, not a grid and not cards. Each document gets one
 * horizontal row: checkbox, then a title with its meta stacked underneath in
 * muted text, then a trailing indicator cluster, then actions. No column
 * headers, no key-value labels, no card frame, and no wrapping into a column
 * grid (Polaris Index / Frappe list).
 *
 * Slots are assigned by column, not by position: `meta.role` of `title`,
 * `indicator`, `actions` or `hidden` decides, and status-shaped ids
 * (status, priority, workflow_state, state) and option-group fields fall into
 * the indicator cluster on their own.
 */

import type { Meta } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

const meta: Meta = {
  title: 'Table/DataTableDocumentList',
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'One row per document: title plus stacked muted meta, a trailing indicator cluster, ' +
          'then actions. Stacked-group radius rounds the first and last rows only.',
      },
    },
  },
};

export default meta;

interface Task {
  id: number;
  title: string;
  owner: string;
  due: string;
  status: string;
}

const tasks: Task[] = [
  {
    id: 1,
    title: 'Ship the card layout',
    owner: 'Ada Lovelace',
    due: '2026-09-08',
    status: 'Open',
  },
  {
    id: 2,
    title: 'Rewire the filter chips',
    owner: 'Grace Hopper',
    due: '2026-09-10',
    status: 'In progress',
  },
  {
    id: 3,
    title: 'Retire the legacy grid',
    owner: 'Alan Turing',
    due: '2026-09-15',
    status: 'Blocked',
  },
  {
    id: 4,
    title: 'Document the slot taxonomy',
    owner: 'Katherine Johnson',
    due: '2026-09-20',
    status: 'Open',
  },
];

/** Roles are explicit: title leads, status is the trailing indicator. */
const columns: DataTableColumn<Task>[] = [
  { accessorKey: 'title', header: 'Title', meta: { role: 'title' } },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'due', header: 'Due' },
  { accessorKey: 'status', header: 'Status', meta: { role: 'indicator' } },
];

function ListTable(props: Record<string, any>) {
  return (
    <YStack
      padding="$4"
      width="100%"
      maxWidth={720}>
      <DataTable
        data={tasks}
        columns={columns}
        layout="list"
        aria-label="Tasks as a document list"
        {...props}
      />
    </YStack>
  );
}

/** Title leads, owner and due stack beneath it, status rides the right edge. */
export const Default = {
  name: 'Main',
  render: () => <ListTable />,
};

/** Selection puts a checkbox at the head of every row. */
export const Selection = {
  render: () => <ListTable enableRowSelection />,
};

/**
 * No `meta.role` anywhere: the first non-action column becomes the title and
 * `status` still lands in the indicator cluster on its id alone.
 */
export const InferredSlots = {
  render: () => (
    <ListTable
      columns={[
        { accessorKey: 'title', header: 'Title' },
        { accessorKey: 'owner', header: 'Owner' },
        { accessorKey: 'status', header: 'Status' },
      ]}
    />
  ),
};

/** No rows and no filters: the list paints "No data available", not blank. */
export const Empty = {
  render: () => (
    <YStack
      padding="$4"
      width="100%"
      maxWidth={720}>
      <DataTable
        data={[]}
        columns={columns}
        layout="list"
        aria-label="Empty document list"
      />
    </YStack>
  ),
};
