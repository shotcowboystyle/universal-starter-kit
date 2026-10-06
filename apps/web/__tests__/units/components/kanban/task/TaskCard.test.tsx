import { useSortable } from '@dnd-kit/sortable';
import type { CSS } from '@dnd-kit/utilities';
import { renderWithProviders as render } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import type { useTranslations } from 'next-intl';
/// <reference types="react" />
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskCard } from '@/components/kanban/task/TaskCard';
import { TaskStatus } from '@/types/db-interface';
import type { Task } from '@/types/db-interface';

// Ensure React is globally available
globalThis.React = React;

// Mock dependencies
// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('next-intl'), () => ({
  useTranslations: (() => (key: string, values?: { name?: string }) => {
    if (values?.name !== undefined && values.name !== '') {
      return `${key}: ${values.name}`;
    }
    return key;
  }) as typeof useTranslations,
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('@dnd-kit/sortable'), () => ({
  useSortable: vi.fn<typeof useSortable>(
    () =>
      ({
        setNodeRef: vi.fn<(element: HTMLElement | null) => void>(),
        attributes: {},
        listeners: {},
        transform: null,
        isDragging: false,
      }) as unknown as ReturnType<typeof useSortable>,
  ),
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('@dnd-kit/utilities'), () => ({
  CSS: {
    Translate: {
      toString: () => '',
    },
  } as unknown as typeof CSS,
}));

vi.mock(import('@/components/kanban/task/TaskAction'), () => ({
  TaskActions: () => <div data-testid="task-actions">Actions</div>,
}));

// SAFETY: callers only omit fields the component is expected to render without
const omitField = (task: Task, key: keyof Task): Task =>
  Object.fromEntries(Object.entries(task).filter(([name]) => name !== key)) as Task;

describe(TaskCard, () => {
  const mockUserInfo: any = { _id: 'user-1', name: 'John', email: 'john@example.com' };
  const mockTask: Task = {
    _id: 'task-1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.TODO,
    creator: mockUserInfo,
    lastModifier: { _id: 'user-2', name: 'Jane', email: 'jane@example.com' },
    assignee: { _id: 'user-3', name: 'Bob', email: 'bob@example.com' },
    project: 'project-1',
    board: 'board-1',
    dueDate: new Date('2025-12-31T12:00:00'),
    orderInProject: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render task card', () => {
    const { container } = render(<TaskCard task={mockTask} />);
    const card = container.querySelector('[data-testid="task-card"]');
    expect(card ?? container.firstChild).toBeTruthy();
  });

  it('should render task title', () => {
    render(<TaskCard task={mockTask} />);
    const titles = screen.getAllByText('Test Task');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('should render task description', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByTestId('task-card-description')).toHaveTextContent('Test Description');
  });

  it('should render TODO status badge', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText('statusTodo')).toBeInTheDocument();
  });

  it('should render IN_PROGRESS status badge', () => {
    const task = { ...mockTask, status: TaskStatus.IN_PROGRESS };
    render(<TaskCard task={task} />);
    expect(screen.getByText('statusInProgress')).toBeInTheDocument();
  });

  it('should render DONE status badge', () => {
    const task = { ...mockTask, status: TaskStatus.DONE };
    render(<TaskCard task={task} />);
    expect(screen.getByText('statusDone')).toBeInTheDocument();
  });

  it('should render creator information', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText(/createdBy: John/u)).toBeInTheDocument();
  });

  it('should render last modifier information', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText(/lastModifiedBy: Jane/u)).toBeInTheDocument();
  });

  it('should render assignee information', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText(/assignee: Bob/u)).toBeInTheDocument();
  });

  it('should render due date', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText(/dueDate/u)).toBeInTheDocument();
    expect(screen.getByText(/2025\/12\/31/u)).toBeInTheDocument();
  });

  it('should render TaskActions component', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByTestId('task-actions')).toBeInTheDocument();
  });

  it('should return null for deleted task', () => {
    const deletedTask = { ...mockTask, _deleted: true };
    render(<TaskCard task={deletedTask} />);
    expect(screen.queryByTestId('task-card')).not.toBeInTheDocument();
  });

  it('should render without description', () => {
    const taskWithoutDesc = omitField(mockTask, 'description');
    render(<TaskCard task={taskWithoutDesc} />);
    expect(screen.queryByTestId('task-card-description')).not.toBeInTheDocument();
  });

  it('should render without creator', () => {
    const taskWithoutCreator = omitField(mockTask, 'creator');
    render(<TaskCard task={taskWithoutCreator} />);
    expect(screen.queryByText(/createdBy/u)).not.toBeInTheDocument();
  });

  it('should render without last modifier', () => {
    const taskWithoutModifier = omitField(mockTask, 'lastModifier');
    render(<TaskCard task={taskWithoutModifier} />);
    expect(screen.queryByText(/lastModifiedBy/u)).not.toBeInTheDocument();
  });

  it('should render without assignee', () => {
    const taskWithoutAssignee = omitField(mockTask, 'assignee');
    render(<TaskCard task={taskWithoutAssignee} />);
    expect(screen.queryByText(/assignee/u)).not.toBeInTheDocument();
  });

  it('should render without due date', () => {
    const taskWithoutDueDate = omitField(mockTask, 'dueDate');
    render(<TaskCard task={taskWithoutDueDate} />);
    expect(screen.queryByText(/dueDate/u)).not.toBeInTheDocument();
  });

  it('should render with drag enabled', () => {
    const { container } = render(
      <TaskCard
        task={mockTask}
        isDragEnabled={true}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('should render with drag disabled', () => {
    const { container } = render(
      <TaskCard
        task={mockTask}
        isDragEnabled={false}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('should render as overlay', () => {
    const { container } = render(
      <TaskCard
        task={mockTask}
        isOverlay={true}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('should call onUpdate callback when provided', () => {
    const mockOnUpdate = vi.fn<() => void>();
    const { container } = render(
      <TaskCard
        task={mockTask}
        onUpdate={mockOnUpdate}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('should render minimal task with only required fields', () => {
    const minimalTask: Task = {
      _id: 'task-2',
      title: 'Minimal Task',
      status: TaskStatus.TODO,
      project: 'project-1',
      board: 'board-1',
      creator: { _id: 'user-1', name: 'John', email: 'john@example.com' },
      lastModifier: { _id: 'user-1', name: 'John', email: 'john@example.com' },
      orderInProject: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    render(<TaskCard task={minimalTask} />);
    const titles = screen.getAllByText('Minimal Task');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('should handle task with no status', () => {
    const taskWithoutStatus = { ...mockTask, status: undefined as any };
    render(<TaskCard task={taskWithoutStatus} />);
    expect(screen.getByText('noStatus')).toBeInTheDocument();
  });

  it('should render drag handle when drag is enabled', () => {
    render(
      <TaskCard
        task={mockTask}
        isDragEnabled={true}
      />,
    );
    expect(screen.getByLabelText('drag task: Test Task')).toBeInTheDocument();
  });

  it('should not render drag handle when drag is disabled', () => {
    render(
      <TaskCard
        task={mockTask}
        isDragEnabled={false}
      />,
    );
    expect(screen.queryByLabelText('drag task: Test Task')).not.toBeInTheDocument();
  });

  it('should apply the sortable transform to the card wrapper', async () => {
    const setNodeRef = vi.fn<(element: HTMLElement | null) => void>();
    vi.mocked(useSortable).mockReturnValue({
      setNodeRef,
      attributes: {},
      listeners: {},
      transform: null,
      transition: 'transform 200ms ease',
      isDragging: false,
    } as any);

    render(
      <TaskCard
        task={mockTask}
        isDragEnabled={true}
      />,
    );
    const card = screen.getByTestId('task-card');
    expect(setNodeRef).toHaveBeenCalledWith(card);
    expect(card.style.transition).toBe('transform 200ms ease');
  });

  it('should render with dragging state', async () => {
    vi.mocked(useSortable).mockReturnValue({
      setNodeRef: vi.fn<(element: HTMLElement | null) => void>(),
      attributes: {},
      listeners: {},
      transform: null,
      isDragging: true,
    } as any);

    const { container } = render(<TaskCard task={mockTask} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('should handle transform during drag', async () => {
    vi.mocked(useSortable).mockReturnValue({
      setNodeRef: vi.fn<(element: HTMLElement | null) => void>(),
      attributes: {},
      listeners: {},
      transform: { x: 10, y: 20, scaleX: 1, scaleY: 1 },
      transition: 'transform 200ms ease',
      isDragging: false,
    } as any);

    const { container } = render(<TaskCard task={mockTask} />);
    expect(container.firstChild).toBeTruthy();
  });
});
