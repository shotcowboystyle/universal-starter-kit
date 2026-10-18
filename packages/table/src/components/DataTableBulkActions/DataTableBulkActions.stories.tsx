import { Checkbox } from '@repo/forms';
import { action } from '@repo/storybook';
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { DataTableBulkActions, useRowSelection } from './index';
import type { BulkAction } from './index';

const MARK_COMPLETE = 'mark-complete';

const noop = (): void => undefined;

// Define the data type
interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
}

// Sample data
const sampleTasks: Task[] = [
  {
    id: '1',
    title: 'Implement user authentication',
    status: 'in-progress',
    priority: 'high',
    assignee: 'Alice',
  },
  {
    id: '2',
    title: 'Design landing page',
    status: 'todo',
    priority: 'medium',
    assignee: 'Bob',
  },
  {
    id: '3',
    title: 'Write unit tests',
    status: 'done',
    priority: 'high',
    assignee: 'Charlie',
  },
  {
    id: '4',
    title: 'Setup CI/CD pipeline',
    status: 'todo',
    priority: 'low',
    assignee: 'Diana',
  },
  {
    id: '5',
    title: 'Database optimization',
    status: 'in-progress',
    priority: 'medium',
    assignee: 'Eve',
  },
];

// Custom bulk actions
const customActions: BulkAction<Task>[] = [
  {
    id: MARK_COMPLETE,
    label: 'Mark Complete',
    onExecute: (items, clearSelection) => {
      action(MARK_COMPLETE)(items);
      clearSelection();
    },
  },
  {
    id: 'assign-to-me',
    label: 'Assign to Me',
    onExecute: (items, clearSelection) => {
      action('assign-to-me')(items);
      clearSelection();
    },
  },
  {
    id: 'change-priority',
    label: 'Change Priority',
    onExecute: (items, clearSelection) => {
      action('change-priority')(items);
      clearSelection();
    },
  },
];

export default {
  title: 'Table/DataTableBulkActions',
  component: DataTableBulkActions,
  parameters: {
    docs: {
      description: {
        component: 'A component for performing bulk actions on selected table items.',
      },
    },
  },
};

export const Default = () => {
  const [selectedItems, setSelectedItems] = React.useState<Task[]>([sampleTasks[0], sampleTasks[2]]);

  const actions = customActions;

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Bulk Actions Demo
      </Text>

      <DataTableBulkActions
        selectedItems={selectedItems}
        onClearSelection={() => {
          setSelectedItems([]);
        }}
        actions={actions}
      />

      <YStack gap="$2">
        <Text
          fontSize="$3"
          fontWeight="500">
          Selected Items:
        </Text>
        {selectedItems.map((item) => (
          <Text
            key={item.id}
            fontSize="$2">
            {item.title}
          </Text>
        ))}
      </YStack>
    </YStack>
  );
};

Default.storyName = 'Main';
export const WithConfirmation = () => {
  const [selectedItems, setSelectedItems] = React.useState<Task[]>([sampleTasks[1]]);

  const actions: BulkAction<Task>[] = [
    {
      id: 'delete',
      label: 'Delete Tasks',
      variant: 'destructive',
      requiresConfirmation: true,
      confirmTitle: 'Delete Selected Tasks',
      confirmMessage: 'Are you sure you want to delete these tasks? This action cannot be undone.',
      onExecute: (items, clearSelection) => {
        action('delete')(items);
        clearSelection();
      },
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Bulk Actions with Confirmation
      </Text>

      <DataTableBulkActions
        selectedItems={selectedItems}
        onClearSelection={() => {
          setSelectedItems([]);
        }}
        actions={actions}
      />
    </YStack>
  );
};

export const ManyActions = () => {
  const [selectedItems, setSelectedItems] = React.useState<Task[]>([sampleTasks[0], sampleTasks[1]]);

  const manyActions: BulkAction<Task>[] = [
    ...customActions,
    {
      id: 'archive',
      label: 'Archive',
      onExecute: (items, clearSelection) => {
        action('archive')(items);
        clearSelection();
      },
    },
    {
      id: 'export-json',
      label: 'Export JSON',
      onExecute: (items, clearSelection) => {
        action('export-json')(items);
        clearSelection();
      },
    },
    {
      id: 'duplicate-multiple',
      label: 'Duplicate (x3)',
      onExecute: (items, clearSelection) => {
        action('duplicate-multiple')(items);
        clearSelection();
      },
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Many Actions (Overflow Menu)
      </Text>

      <DataTableBulkActions
        selectedItems={selectedItems}
        onClearSelection={() => {
          setSelectedItems([]);
        }}
        actions={manyActions}
        maxVisibleActions={3}
      />
    </YStack>
  );
};

export const NoSelectionCount = () => {
  const [selectedItems, setSelectedItems] = React.useState<Task[]>([sampleTasks[0]]);

  const actions = customActions;

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Without Selection Count
      </Text>

      <DataTableBulkActions
        selectedItems={selectedItems}
        onClearSelection={() => {
          setSelectedItems([]);
        }}
        actions={actions}
        showSelectionCount={false}
      />
    </YStack>
  );
};

export const DisabledActions = () => {
  const [selectedItems, setSelectedItems] = React.useState<Task[]>([sampleTasks[0], sampleTasks[1]]);

  const actions: BulkAction<Task>[] = [
    {
      id: 'enabled',
      label: 'Enabled Action',
      onExecute: (items, clearSelection) => {
        action('enabled')(items);
        clearSelection();
      },
    },
    {
      id: 'disabled',
      label: 'Disabled Action',
      disabled: true,
      disabledReason: 'Needs the admin role',
      onExecute: (items, clearSelection) => {
        action('disabled')(items);
        clearSelection();
      },
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        With Disabled Actions
      </Text>

      <DataTableBulkActions
        selectedItems={selectedItems}
        onClearSelection={() => {
          setSelectedItems([]);
        }}
        actions={actions}
      />
    </YStack>
  );
};

export const WithRowSelectionHook = () => {
  const selection = useRowSelection({
    data: sampleTasks,
    selectionKey: 'id',
  });

  const actions: BulkAction<Task>[] = [
    {
      id: MARK_COMPLETE,
      label: 'Mark Complete',
      onExecute: (items, clearSelection) => {
        action(MARK_COMPLETE)(items);
        clearSelection();
      },
    },
  ];

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        With Row Selection Hook
      </Text>

      {/* Mock table rows for demonstration */}
      <YStack gap="$2">
        {sampleTasks.map((task) => (
          <XStack
            key={task.id}
            gap="$3"
            padding="$2"
            backgroundColor={selection.isSelected(task) ? '$blue2' : 'transparent'}
            borderRadius="$2"
            cursor="pointer"
            onPress={() => {
              selection.toggleItem(task);
            }}>
            <Checkbox
              checked={selection.isSelected(task)}
              // Handled by onPress
              onChange={noop}
            />
            <YStack flex={1}>
              <Text fontWeight="500">{task.title}</Text>
              <Text
                fontSize="$2"
                color="$gray11">
                {task.assignee} • {task.status}
              </Text>
            </YStack>
          </XStack>
        ))}
      </YStack>

      <XStack
        gap="$3"
        alignItems="center">
        <Checkbox
          checked={selection.isAllSelected || selection.isIndeterminate}
          onChange={() => {
            selection.toggleAll();
          }}
          label="Select All"
        />
        <Text
          fontSize="$2"
          color="$gray11">
          ({selection.selectedItems.length} selected)
        </Text>
      </XStack>

      {selection.selectedItems.length > 0 && (
        <DataTableBulkActions
          selectedItems={selection.selectedItems}
          onClearSelection={() => {
            selection.clearSelection();
          }}
          actions={actions}
        />
      )}
    </YStack>
  );
};

export const EmptyState = () => {
  const actions = customActions;

  return (
    <YStack
      gap="$4"
      padding="$4">
      <Text
        fontSize="$4"
        fontWeight="600">
        Empty State (No Selection)
      </Text>

      <Text
        fontSize="$3"
        color="$gray11">
        No items selected - component should not render anything
      </Text>

      <DataTableBulkActions
        selectedItems={[]}
        onClearSelection={noop}
        actions={actions}
      />

      <Text
        fontSize="$2"
        color="$green11">
        ✅ Nothing should be visible above this line
      </Text>
    </YStack>
  );
};
