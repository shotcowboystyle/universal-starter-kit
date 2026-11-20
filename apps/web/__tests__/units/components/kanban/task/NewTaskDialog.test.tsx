import { renderWithProviders as render } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import NewTaskDialog from '@/components/kanban/task/NewTaskDialog';
import { useCreateTask } from '@/lib/api/tasks/queries';

// Create hoisted mock for useWorkspaceStore
interface TestStore {
  addTask: Mock;
  projects: object[];
}

const { mockUseWorkspaceStore, mockGetState } = vi.hoisted(() => {
  const getState = vi.fn<() => TestStore>();
  const useStore = Object.assign(vi.fn<(selector?: (state: TestStore) => object) => object>(), {
    getState,
  });
  return { mockUseWorkspaceStore: useStore, mockGetState: getState };
});

vi.mock(import('@/lib/api/tasks/queries'), () => ({
  useCreateTask: vi.fn<typeof useCreateTask>(),
}));

vi.mock(import('@/stores/workspace-store'), () => ({
  useWorkspaceStore: mockUseWorkspaceStore as never,
}));

vi.mock(import('next-intl'), () => ({
  useTranslations: (() => (key: string) => key) as never,
}));

vi.mock(import('sonner'), () => ({
  toast: {
    success: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  } as never,
}));

vi.mock(import('@/components/kanban/task/TaskForm'), () => ({
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
      <button
        type="button"
        onClick={onCancel}
        data-testid="cancel-btn">
        Cancel
      </button>
      <button
        type="submit"
        data-testid="submit-btn">
        Submit
      </button>
    </form>
  ),
}));

describe(NewTaskDialog, () => {
  const mockProjectId = 'project-1';

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(useCreateTask).mockReturnValue({
      mutateAsync: vi.fn<() => Promise<{ _id: string }>>().mockResolvedValue({ _id: 'task-1' }),
      mutate: vi.fn<() => void>(),
      isPending: false,
    } as any);

    const store = {
      addTask: vi.fn<() => Promise<string>>().mockResolvedValue('task-1'),
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
    mockUseWorkspaceStore.mockImplementation((selector) => (selector === undefined ? store : selector(store)));
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
    await waitFor(() => {
      expect(screen.queryByTestId('new-task-dialog')).not.toBeInTheDocument();
    });
  });

  it('closes the dialog on cancel', async () => {
    await openDialog();
    fireEvent.click(screen.getByTestId('cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('new-task-dialog')).not.toBeInTheDocument();
    });
  });
});
