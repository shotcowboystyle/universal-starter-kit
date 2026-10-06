import { renderWithProviders as render } from '@repo/test-utils';
import type { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { useTranslations } from 'next-intl';
import type { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskActions } from '@/components/kanban/task/TaskAction';
import { useDeleteTask, useTask, useUpdateTask } from '@/lib/api/tasks/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { TaskStatus } from '@/types/db-interface';

// Mock dependencies
// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('@/stores/workspace-store'), () => ({
  useWorkspaceStore: vi.fn<() => { userId: string }>(() => ({
    userId: 'user-1',
  })) as unknown as typeof useWorkspaceStore,
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('next-intl'), () => ({
  useTranslations: (() => (key: string) => key) as typeof useTranslations,
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('sonner'), () => ({
  toast: {
    success: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  } as unknown as typeof toast,
}));

vi.mock(import('@/lib/api/tasks/queries'), () => ({
  useTask: vi.fn<typeof useTask>(),
  useUpdateTask: vi.fn<typeof useUpdateTask>(),
  useDeleteTask: vi.fn<typeof useDeleteTask>(),
}));

vi.mock(import('@/components/kanban/task/TaskForm'), () => ({
  TaskForm: ({ onSubmit, onCancel }: any) => (
    <div data-testid="task-form">
      <button
        type="button"
        data-testid="form-submit"
        onClick={() => onSubmit({ title: 'Updated Task' })}>
        Submit
      </button>
      <button
        type="button"
        data-testid="form-cancel"
        onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

// SAFETY: the test double implements only the QueryClient members the code under test calls
vi.mock(import('@tanstack/react-query'), async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: vi.fn<() => QueryClient>(
    () =>
      ({
        invalidateQueries: vi.fn<() => void>(),
        getQueryData: vi.fn<() => void>(),
        setQueryData: vi.fn<() => void>(),
        cancelQueries: vi.fn<() => void>(),
        removeQueries: vi.fn<() => void>(),
        refetchQueries: vi.fn<() => void>(),
        getQueryCache: vi.fn<() => { findAll: () => never[] }>(() => ({
          findAll: vi.fn<() => never[]>(() => []),
        })),
      }) as unknown as QueryClient,
  ),
}));

const openMenu = async () => {
  fireEvent.click(screen.getByTestId('task-actions-trigger'));
  return within(await screen.findByRole('menu'));
};

// The alertdialog sits in a portal that testing-library's role query treats as inaccessible.
const findConfirmDialog = async () =>
  await waitFor(() => {
    const el = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(el).not.toBeNull();
    return el!;
  });

describe(TaskActions, () => {
  const mockTask = {
    _id: 'task-1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.TODO,
    creator: { _id: 'user-1', name: 'John', email: 'john@example.com' },
    assignee: { _id: 'user-2', name: 'Jane', email: 'jane@example.com' },
    project: 'project-1',
    board: 'board-1',
    dueDate: new Date('2025-12-31'),
    orderInProject: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProps = {
    id: 'task-1',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.TODO,
    projectId: 'project-1',
    boardId: 'board-1',
    assigneeId: 'user-2',
    dueDate: new Date('2025-12-31'),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useWorkspaceStore).mockReturnValue({ userId: 'user-1' } as any);

    vi.mocked(useTask).mockReturnValue({
      data: mockTask,
      isLoading: false,
    } as any);

    vi.mocked(useUpdateTask).mockReturnValue({
      mutateAsync: vi.fn<() => Promise<typeof mockTask>>().mockResolvedValue(mockTask),
      isPending: false,
    } as any);

    vi.mocked(useDeleteTask).mockReturnValue({
      mutateAsync: vi.fn<() => Promise<void>>().mockResolvedValue(),
      isPending: false,
    } as any);
  });

  it('should render task actions trigger', () => {
    render(<TaskActions {...mockProps} />);
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should show loading state when task is loading', async () => {
    vi.mocked(useTask).mockReturnValue({
      isLoading: true,
    } as any);

    render(<TaskActions {...mockProps} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render task actions component with creator permissions', () => {
    const { container } = render(<TaskActions {...mockProps} />);
    expect(container).toBeTruthy();
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render with assignee permissions', async () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({ userId: 'user-2' } as any);

    render(<TaskActions {...mockProps} />);
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render with no permissions', async () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({ userId: 'user-3' } as any);

    render(<TaskActions {...mockProps} />);
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should return null when task not found and not loading', async () => {
    vi.mocked(useTask).mockReturnValue({
      isLoading: false,
    } as any);

    render(<TaskActions {...mockProps} />);
    expect(screen.queryByTestId('task-actions-trigger')).not.toBeInTheDocument();
  });

  it('should render task with default values', () => {
    render(<TaskActions {...mockProps} />);
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render with dueDate', () => {
    render(
      <TaskActions
        {...mockProps}
        dueDate={new Date('2025-12-31')}
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render without dueDate', () => {
    render(
      <TaskActions
        {...mockProps}
        dueDate={undefined}
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render without assignee', () => {
    render(
      <TaskActions
        {...mockProps}
        assigneeId={undefined}
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render with description', () => {
    render(
      <TaskActions
        {...mockProps}
        description="Test description"
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should render without description', () => {
    render(
      <TaskActions
        {...mockProps}
        description={undefined}
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('should handle different task statuses', () => {
    render(
      <TaskActions
        {...mockProps}
        status={TaskStatus.IN_PROGRESS}
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();

    render(
      <TaskActions
        {...mockProps}
        status={TaskStatus.DONE}
      />,
    );
    expect(screen.getAllByTestId('task-actions-trigger').length).toBeGreaterThan(0);
  });

  it('should handle onUpdate callback when provided', () => {
    const mockOnUpdate = vi.fn<() => void>();
    render(
      <TaskActions
        {...mockProps}
        onUpdate={mockOnUpdate}
      />,
    );
    expect(screen.getByTestId('task-actions-trigger')).toBeInTheDocument();
  });

  it('enables edit and delete for the creator', async () => {
    render(<TaskActions {...mockProps} />);
    const menu = await openMenu();
    expect(menu.getByRole('menuitem', { name: /edit/u })).not.toHaveAttribute('aria-disabled', 'true');
    expect(menu.getByRole('menuitem', { name: /delete/u })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('only enables edit for the assignee', async () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({ userId: 'user-2' } as any);
    render(<TaskActions {...mockProps} />);
    const menu = await openMenu();
    expect(menu.getByRole('menuitem', { name: /edit/u })).not.toHaveAttribute('aria-disabled', 'true');
    expect(menu.getByRole('menuitem', { name: /delete/u })).toHaveAttribute('aria-disabled', 'true');
  });

  it('disables both actions for other users', async () => {
    vi.mocked(useWorkspaceStore).mockReturnValue({ userId: 'user-3' } as any);
    render(<TaskActions {...mockProps} />);
    const menu = await openMenu();
    expect(menu.getByRole('menuitem', { name: /edit/u })).toHaveAttribute('aria-disabled', 'true');
    expect(menu.getByRole('menuitem', { name: /delete/u })).toHaveAttribute('aria-disabled', 'true');
  });

  it('opens the edit dialog and submits the update', async () => {
    render(<TaskActions {...mockProps} />);
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('menuitem', { name: /edit/u }));

    const dialog = await screen.findByTestId('edit-task-dialog');
    expect(within(dialog).getByText('editTaskTitle')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('form-submit'));

    const { mutateAsync } = vi.mocked(useUpdateTask).mock.results[0].value;
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1', title: 'Updated Task', assigneeId: null }),
        expect.any(Object),
      );
    });
  });

  it('confirms deletion through the destructive confirm dialog', async () => {
    render(<TaskActions {...mockProps} />);
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('menuitem', { name: /delete/u }));

    const dialog = within(await findConfirmDialog());
    expect(dialog.getByText('confirmDeleteTitle')).toBeInTheDocument();
    fireEvent.click(dialog.getByText('delete'));

    const { mutateAsync } = vi.mocked(useDeleteTask).mock.results[0].value;
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith('task-1', expect.any(Object));
    });
  });

  it('does not delete when the confirm dialog is cancelled', async () => {
    render(<TaskActions {...mockProps} />);
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('menuitem', { name: /delete/u }));

    const dialog = within(await findConfirmDialog());
    fireEvent.click(dialog.getByText('cancel'));

    await waitFor(() => {
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    });
    const { mutateAsync } = vi.mocked(useDeleteTask).mock.results[0].value;
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
