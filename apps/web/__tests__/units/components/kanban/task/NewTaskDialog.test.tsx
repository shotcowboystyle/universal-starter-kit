import { renderWithProviders as render } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewTaskDialog from '@/components/kanban/task/NewTaskDialog';

// Create hoisted mock for useWorkspaceStore
const { mockUseWorkspaceStore, mockGetState } = vi.hoisted(() => {
  const mockGetState = vi.fn();
  const mockUseWorkspaceStore = Object.assign(vi.fn(), {
    getState: mockGetState,
  });
  return { mockUseWorkspaceStore, mockGetState };
});

vi.mock('@/lib/api/tasks/queries', () => ({
  useCreateTask: vi.fn(),
}));

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: mockUseWorkspaceStore,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/kanban/task/TaskForm', () => ({
  TaskForm: ({ children, onSubmit, onCancel }: any) => (
    <form
      data-testid="task-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.({
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          dueDate: new Date('2024-12-31'),
          assignee: { _id: 'user-1', name: 'Test User', email: 'test@example.com' },
        });
      }}>
      {children}
      <button type="button" onClick={onCancel} data-testid="cancel-btn">
        Cancel
      </button>
      <button type="submit" data-testid="submit-btn">
        Submit
      </button>
    </form>
  ),
}));

describe('NewTaskDialog', () => {
  const mockProjectId = 'project-1';

  beforeEach(async () => {
    vi.clearAllMocks();

    const { useCreateTask } = await import('@/lib/api/tasks/queries');

    vi.mocked(useCreateTask).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ _id: 'task-1' }),
      mutate: vi.fn(),
      isPending: false,
    } as any);

    const store = {
      addTask: vi.fn().mockResolvedValue('task-1'),
      projects: [
        {
          _id: 'project-1',
          title: 'Test Project',
          tasks: [
            { _id: 'task-1', orderInProject: 0 },
            { _id: 'task-2', orderInProject: 1 },
          ],
        },
      ],
    };

    // Setup the mock implementation
    mockUseWorkspaceStore.mockImplementation((selector?: any) => (selector ? selector(store) : store));
    mockGetState.mockReturnValue(store);
  });

  const openDialog = async () => {
    render(<NewTaskDialog projectId={mockProjectId} />);
    fireEvent.click(screen.getByTestId('new-task-trigger'));
    await screen.findByTestId('new-task-dialog');
  };

  it('renders only the trigger while closed', () => {
    render(<NewTaskDialog projectId={mockProjectId} />);
    expect(screen.getByTestId('new-task-trigger')).toHaveTextContent('addNewTask');
    expect(screen.queryByTestId('new-task-dialog')).not.toBeInTheDocument();
  });

  it('opens the dialog with title, description and form', async () => {
    await openDialog();
    expect(screen.getByText('addNewTaskTitle')).toBeInTheDocument();
    expect(screen.getByText('addNewTaskDescription')).toBeInTheDocument();
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
  });

  it('creates the task with the next order and closes the dialog', async () => {
    const { toast } = await import('sonner');
    await openDialog();
    const store = mockGetState();

    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(store.addTask).toHaveBeenCalledWith(
        mockProjectId,
        'Test Task',
        'todo',
        expect.any(Function),
        'Test Description',
        expect.any(Date),
        'user-1',
        2,
      );
    });
    expect(toast.success).toHaveBeenCalledWith('createSuccess');
    await waitFor(() => expect(screen.queryByTestId('new-task-dialog')).not.toBeInTheDocument());
  });

  it('closes the dialog on cancel', async () => {
    await openDialog();
    fireEvent.click(screen.getByTestId('cancel-btn'));
    await waitFor(() => expect(screen.queryByTestId('new-task-dialog')).not.toBeInTheDocument());
  });
});
