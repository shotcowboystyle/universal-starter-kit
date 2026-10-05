import { PlusIcon } from '@phosphor-icons/react';
// Catalog Button (story honesty): stories compose catalog controls, never raw tamagui ones.
import { Button } from '@repo/forms';
import { action } from '@repo/storybook';
import type { Meta } from '@storybook/react-native-web-vite';
import { useCallback, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Kanban, type KanbanColumn } from './Kanban';

interface Task {
  id: string;
  title: string;
  priority: string;
}

const columns: KanbanColumn<Task>[] = [
  {
    id: 'todo',
    title: 'To Do',
    color: '$blue9',
    items: [
      { id: '1', title: 'Research new API', priority: 'high' },
      { id: '2', title: 'Write docs', priority: 'medium' },
    ],
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: '$orange9',
    items: [{ id: '3', title: 'Implement auth', priority: 'high' }],
  },
  {
    id: 'done',
    title: 'Done',
    color: '$green9',
    items: [{ id: '4', title: 'Setup CI/CD', priority: 'low' }],
  },
];

function TaskCard({ item }: { item: Task }) {
  return (
    <YStack gap="$1">
      <Text fontSize="$3">{item.title}</Text>
      <Text fontSize="$2" color="$color11" textTransform="capitalize">
        {item.priority}
      </Text>
    </YStack>
  );
}

function columnAdd(column: KanbanColumn<Task>) {
  return (
    <Button
      size="$2"
      circular
      chromeless
      icon=<PlusIcon size={14} />
      aria-label={`Add card to ${column.title}`}
      onPress={action('add-card')}
    />
  );
}

const meta: Meta = {
  title: 'Components/Kanban',
  parameters: {
    status: { type: 'stable' },
  },
};

export default meta;

export const Default = {
  name: 'Main',
  render: () => (
    <Kanban<Task>
      columns={columns}
      getItemKey={(item) => item.id}
      getItemLabel={(item) => item.title}
      renderCard={(item) => <TaskCard item={item} />}
      renderColumnActions={columnAdd}
      onCardSelect={action('onCardSelect')}
      height={400}
    />
  ),
};

/**
 * Full drag-and-drop demo backed by local state: pointer drag (lift, sibling
 * displacement, settle), keyboard drag (Space lifts, arrows move, Space
 * drops, Escape cancels), touch long-press, auto-scroll, and an empty
 * "Blocked" column showing the drop-here affordance. Add/Remove buttons
 * exercise the enter/exit card animations.
 */
export const Interactive = {
  render: function InteractiveStory() {
    const [board, setBoard] = useState<KanbanColumn<Task>[]>(() => [
      {
        id: 'todo',
        title: 'To Do',
        color: '$blue9',
        items: [
          { id: '1', title: 'Research new API', priority: 'high' },
          { id: '2', title: 'Write docs', priority: 'medium' },
          { id: '5', title: 'Fix login bug', priority: 'high' },
          { id: '6', title: 'Refactor settings page', priority: 'low' },
        ],
      },
      {
        id: 'in-progress',
        title: 'In Progress',
        color: '$orange9',
        items: [
          { id: '3', title: 'Implement auth', priority: 'high' },
          { id: '7', title: 'Design review', priority: 'medium' },
        ],
      },
      {
        id: 'blocked',
        title: 'Blocked',
        color: '$red9',
        items: [],
      },
      {
        id: 'done',
        title: 'Done',
        color: '$green9',
        items: [{ id: '4', title: 'Setup CI/CD', priority: 'low' }],
      },
    ]);
    const [nextId, setNextId] = useState(8);

    const moveCard = useCallback((item: Task, fromColumn: string, toColumn: string, toIndex?: number) => {
      action('onCardMove')(item.id, fromColumn, toColumn, toIndex);
      setBoard((prev) =>
        prev.map((col) => {
          if (col.id === fromColumn) {
            return { ...col, items: col.items.filter((i) => i.id !== item.id) };
          }
          if (col.id === toColumn) {
            const items = [...col.items];
            items.splice(toIndex ?? items.length, 0, item);
            return { ...col, items };
          }
          return col;
        }),
      );
    }, []);

    const reorderCard = useCallback((item: Task, columnId: string, fromIndex: number, toIndex: number) => {
      action('onCardReorder')(item.id, columnId, fromIndex, toIndex);
      setBoard((prev) =>
        prev.map((col) => {
          if (col.id !== columnId) {
            return col;
          }
          const items = [...col.items];
          items.splice(fromIndex, 1);
          items.splice(toIndex, 0, item);
          return { ...col, items };
        }),
      );
    }, []);

    const addCard = useCallback(() => {
      setBoard((prev) =>
        prev.map((col, index) =>
          index === 0
            ? {
                ...col,
                items: [{ id: String(nextId), title: `New task ${nextId}`, priority: 'medium' }, ...col.items],
              }
            : col,
        ),
      );
      setNextId((n) => n + 1);
    }, [nextId]);

    const removeCard = useCallback(() => {
      setBoard((prev) => {
        const target = prev.findIndex((col) => col.items.length > 0);
        if (target < 0) {
          return prev;
        }
        return prev.map((col, index) => (index === target ? { ...col, items: col.items.slice(1) } : col));
      });
    }, []);

    return (
      <YStack gap="$2">
        <XStack gap="$2">
          <Button size="$2" onPress={addCard}>
            Add card
          </Button>
          <Button size="$2" onPress={removeCard}>
            Remove card
          </Button>
        </XStack>
        <Kanban<Task>
          columns={board}
          getItemKey={(item) => item.id}
          getItemLabel={(item) => item.title}
          renderCard={(item) => <TaskCard item={item} />}
          renderColumnActions={columnAdd}
          onCardMove={moveCard}
          onCardReorder={reorderCard}
          onCardSelect={action('onCardSelect')}
          height={480}
        />
      </YStack>
    );
  },
};

/** Initial board load with no cards renders the kanban skeleton. */
export const Loading = {
  render: () => (
    <Kanban<Task>
      columns={columns.map((c) => ({ ...c, items: [] }))}
      getItemKey={(item) => item.id}
      renderCard={(item) => <TaskCard item={item} />}
      isLoading
      height={400}
    />
  ),
};

/** No columns at all — board-level empty state (Axiom 6: empty ≠ error). */
export const Empty = {
  render: () => (
    <Kanban<Task>
      columns={[]}
      getItemKey={(item) => item.id}
      renderCard={(item) => <TaskCard item={item} />}
      height={400}
    />
  ),
};

/** Failed board load — error chrome with retry wins over empty columns. */
export const Error = {
  render: () => (
    <Kanban<Task>
      columns={columns.map((c) => ({ ...c, items: [] }))}
      getItemKey={(item) => item.id}
      renderCard={(item) => <TaskCard item={item} />}
      error="Board failed to load."
      onRetry={action('onRetry')}
      height={400}
    />
  ),
};
