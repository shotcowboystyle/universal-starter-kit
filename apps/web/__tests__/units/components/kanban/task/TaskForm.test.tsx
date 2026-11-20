import { renderWithProviders as render } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { useTranslations } from 'next-intl';
import type { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskForm } from '@/components/kanban/task/TaskForm';
import type { TaskFormSubmitValues } from '@/hooks/use-task-form';
import type { userApi } from '@/lib/api/user-api';
import type { User } from '@/types/db-interface';
import { TaskStatus } from '@/types/db-interface';

const mocks = vi.hoisted(() => ({
  searchUsers: vi.fn<(search?: string) => Promise<User[]>>(),
  getUserById: vi.fn<(id: string) => Promise<User | null>>(),
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('next-intl'), () => ({
  useTranslations: (() => (key: string) => key) as typeof useTranslations,
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('sonner'), () => ({
  toast: {
    error: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
  } as unknown as typeof toast,
}));

// SAFETY: the test double implements only the members the code under test calls
vi.mock(import('@/lib/api/user-api'), () => ({
  userApi: mocks as typeof userApi,
}));

const mockUsers: User[] = [
  { _id: 'user-1', name: 'John Doe', email: 'john@example.com', createdAt: new Date(), updatedAt: new Date() },
  { _id: 'user-2', name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date(), updatedAt: new Date() },
];

// Local-time constructor keeps the fixture timezone-safe.
const dueDate = new Date(2030, 11, 31);

const defaultValues = {
  title: 'Test Task',
  description: 'Test Description',
  status: TaskStatus.IN_PROGRESS,
  dueDate,
  assignee: { _id: 'user-1', name: 'John Doe', email: 'john@example.com' },
  projectId: 'project-1',
  boardId: 'board-1',
};

const submit = () => fireEvent.click(screen.getByTestId('submit-task-button'));

describe(TaskForm, () => {
  const mockOnSubmit = vi.fn<(values: TaskFormSubmitValues) => Promise<void>>();
  const mockOnCancel = vi.fn<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue();
    mocks.searchUsers.mockResolvedValue(mockUsers);
  });

  it('renders all labeled fields', () => {
    render(<TaskForm onSubmit={mockOnSubmit} />);
    for (const label of ['titleLabel', 'dueDateLabel', 'assignToLabel', 'statusLabel', 'descriptionLabel']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('task-title-input')).toHaveAttribute('placeholder', 'titlePlaceholder');
    expect(screen.getByTestId('task-description-input')).toHaveAttribute('placeholder', 'descriptionPlaceholder');
  });

  it('renders the status radio options with TODO selected by default', () => {
    render(<TaskForm onSubmit={mockOnSubmit} />);
    expect(screen.getByRole('radio', { name: 'statusTodo' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'statusInProgress' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'statusDone' })).toBeInTheDocument();
  });

  it('renders the default submit label and no cancel button', () => {
    render(<TaskForm onSubmit={mockOnSubmit} />);
    expect(screen.getByTestId('submit-task-button')).toHaveTextContent('Submit');
    expect(screen.queryByTestId('cancel-task-button')).not.toBeInTheDocument();
  });

  it('renders a custom submit label and calls onCancel', () => {
    render(
      <TaskForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        submitLabel="Create Task"
      />,
    );
    expect(screen.getByTestId('submit-task-button')).toHaveTextContent('Create Task');
    fireEvent.click(screen.getByTestId('cancel-task-button'));
    expect(mockOnCancel).toHaveBeenCalledOnce();
  });

  it('shows the zod title error and does not submit an empty title', async () => {
    render(<TaskForm onSubmit={mockOnSubmit} />);
    submit();
    // Shown both inline and in the form's error summary.
    await expect(screen.findAllByText('Title is required')).resolves.not.toHaveLength(0);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits create-mode values in the schema shape', async () => {
    render(<TaskForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByTestId('task-title-input'), { target: { value: 'New Task' } });
    fireEvent.change(screen.getByTestId('task-description-input'), { target: { value: 'Details' } });
    fireEvent.click(screen.getByRole('radio', { name: 'statusDone' }));
    submit();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'New Task',
        description: 'Details',
        status: TaskStatus.DONE,
      });
    });
  });

  it('prefills edit-mode values and shows the current assignee', () => {
    render(
      <TaskForm
        defaultValues={defaultValues}
        onSubmit={mockOnSubmit}
      />,
    );
    expect(screen.getByTestId('task-title-input')).toHaveValue('Test Task');
    expect(screen.getByTestId('task-description-input')).toHaveValue('Test Description');
    expect(screen.getByRole('radio', { name: 'statusInProgress' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('John Doe');
  });

  it('submits edit-mode values with assignee and due date preserved', async () => {
    render(
      <TaskForm
        defaultValues={defaultValues}
        onSubmit={mockOnSubmit}
      />,
    );
    submit();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.IN_PROGRESS,
        dueDate,
        assignee: { _id: 'user-1', name: 'John Doe' },
      });
    });
  });

  it('shows a busy submit button while onSubmit is pending', async () => {
    mockOnSubmit.mockReturnValue(Promise.withResolvers<undefined>().promise);
    render(
      <TaskForm
        defaultValues={defaultValues}
        onSubmit={mockOnSubmit}
      />,
    );
    submit();
    const button = screen.getByTestId('submit-task-button');
    await waitFor(() => {
      expect(within(button).getByRole('status')).toBeInTheDocument();
    });
    submit();
    expect(mockOnSubmit).toHaveBeenCalledOnce();
  });

  it('loads assignee options from the user search', async () => {
    render(<TaskForm onSubmit={mockOnSubmit} />);
    await waitFor(() => {
      expect(mocks.searchUsers).toHaveBeenCalledWith('');
    });
    expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('selectUser');
  });
});
