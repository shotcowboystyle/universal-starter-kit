import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { useMemo, useState } from 'react';
import { XStack, YStack } from 'tamagui';

import type { DataTableColumn } from '../../types';
import { DataTable } from '../DataTable';
import { DataTableToolbar } from '../DataTableToolbar';

import { DataTableFacetMenu } from './index';
import type { DataTableFacetOption } from './index';

const meta: Meta<typeof DataTableFacetMenu> = {
  title: 'Table/DataTableFacetMenu',
  component: DataTableFacetMenu,
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

interface Ticket {
  id: number;
  title: string;
  assignee: string;
  status: 'Open' | 'Working' | 'Closed';
  tags: string;
}

const tickets: Ticket[] = [
  { id: 1, title: 'Fix login redirect', assignee: 'Alice', status: 'Open', tags: 'bug' },
  { id: 2, title: 'Dark mode pass', assignee: 'Bob', status: 'Working', tags: 'design' },
  { id: 3, title: 'Broken CSV export', assignee: 'Alice', status: 'Open', tags: 'bug,export' },
  { id: 4, title: 'Onboarding tour', assignee: 'Carol', status: 'Closed', tags: 'design' },
  { id: 5, title: 'Rate limit uploads', assignee: 'Alice', status: 'Working', tags: 'infra' },
  { id: 6, title: 'Audit log screen', assignee: 'Bob', status: 'Open', tags: 'infra,bug' },
];

const ticketColumns: DataTableColumn<Ticket>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'assignee', header: 'Assignee' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'tags', header: 'Tags' },
];

const countBy = (rows: Ticket[], pick: (row: Ticket) => string[]): DataTableFacetOption[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of pick(row)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .toSorted((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

/**
 * The intended composition: facet menus slot into the DataTableToolbar
 * action cluster (customActions) beside the Filter button, feeding the
 * host's own filter state — here the story filters the rows it hands the
 * table, the same shape a server-backed host would supply.
 */
const InToolbarStory = () => {
  const [assignee, setAssignee] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          (assignee.length === 0 || assignee.includes(ticket.assignee)) &&
          (statuses.length === 0 || statuses.includes(ticket.status)),
      ),
    [assignee, statuses],
  );

  // Each facet's counts respect every OTHER facet's selection.
  const assigneeOptions = useMemo(
    () =>
      countBy(
        tickets.filter((row) => statuses.length === 0 || statuses.includes(row.status)),
        (row) => [row.assignee],
      ),
    [statuses],
  );
  const statusOptions = useMemo(
    () =>
      countBy(
        tickets.filter((row) => assignee.length === 0 || assignee.includes(row.assignee)),
        (row) => [row.status],
      ),
    [assignee],
  );

  return (
    <YStack padding="$4">
      <DataTable
        data={rows}
        columns={ticketColumns}
        enableGlobalSearch
        renderToolbar={(props) => (
          <DataTableToolbar
            {...props}
            customActions={
              <XStack
                gap="$2"
                alignItems="center">
                <DataTableFacetMenu
                  label="Assignee"
                  options={assigneeOptions}
                  activeValues={assignee}
                  onActiveValuesChange={(next, pressed) => {
                    setAssignee(next);
                    action('assignee-change')(next, pressed.value);
                  }}
                />
                <DataTableFacetMenu
                  label="Status"
                  selection="toggle"
                  options={statusOptions}
                  activeValues={statuses}
                  onActiveValuesChange={(next, pressed) => {
                    setStatuses(next);
                    action('status-change')(next, pressed.value);
                  }}
                />
              </XStack>
            }
          />
        )}
        aria-label="Tickets with facet menus"
      />
    </YStack>
  );
};

export const Default = {
  name: 'Main',
  render: () => <InToolbarStory />,
};

const ReplaceSelectionStory = () => {
  const [active, setActive] = useState<string[]>(['Alice']);
  return (
    <YStack
      padding="$4"
      alignItems="flex-start"
      gap="$3">
      <DataTableFacetMenu
        label="Created By"
        options={[
          { value: 'Alice', label: 'Me', count: 3 },
          { value: 'Bob', count: 2 },
          { value: 'Carol', count: 1 },
        ]}
        activeValues={active}
        onActiveValuesChange={(next, pressed) => {
          setActive(next);
          action('created-by-change')(next, pressed.value);
        }}
      />
    </YStack>
  );
};

export const ReplaceSelection = {
  render: () => <ReplaceSelectionStory />,
};

const ToggleSelectionStory = () => {
  const [active, setActive] = useState<string[]>(['bug']);
  return (
    <YStack
      padding="$4"
      alignItems="flex-start"
      gap="$3">
      <DataTableFacetMenu
        label="Tags"
        selection="toggle"
        options={[
          { value: 'bug', count: 3 },
          { value: 'design', count: 2 },
          { value: 'infra', count: 2 },
          { value: 'export', count: 1 },
        ]}
        activeValues={active}
        onActiveValuesChange={(next, pressed) => {
          setActive(next);
          action('tags-change')(next, pressed.value);
        }}
      />
    </YStack>
  );
};

export const ToggleSelection = {
  render: () => <ToggleSelectionStory />,
};

export const LoadingWithStaleCounts = {
  render: () => (
    <YStack
      padding="$4"
      alignItems="flex-start">
      <DataTableFacetMenu
        label="Assigned To"
        loading
        options={[
          { value: 'Alice', count: 12 },
          { value: 'Bob', count: 4 },
        ]}
        activeValues={['Alice']}
        onActiveValuesChange={action('change')}
      />
    </YStack>
  ),
};

export const Empty = {
  render: () => (
    <YStack
      padding="$4"
      alignItems="flex-start">
      <DataTableFacetMenu
        label="Tags"
        options={[]}
        onActiveValuesChange={action('change')}
      />
    </YStack>
  ),
};
