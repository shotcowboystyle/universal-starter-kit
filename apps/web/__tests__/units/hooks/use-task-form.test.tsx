import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskForm } from '@/hooks/use-task-form';
import type { TaskFormValues } from '@/hooks/use-task-form';
import { userApi } from '@/lib/api/user-api';
import type { User } from '@/types/db-interface';
import { TaskStatus } from '@/types/db-interface';

vi.mock(import('@/lib/api/user-api'), () => ({
  userApi: {
    searchUsers: vi.fn<(search?: string) => Promise<User[]>>(),
    getUserById: vi.fn<(id: string) => Promise<User | null>>(),
  },
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- sonner's toast is a callable with many members; the test stubs only toast.error
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn<(message: string) => void>(),
  },
}));

const searchUsers = vi.spyOn(userApi, 'searchUsers');

type SubmitHandler = Parameters<typeof useTaskForm>[0]['onSubmit'];

const mockUsers: User[] = [
  {
    _id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: 'user-2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const baseValues: TaskFormValues = {
  title: 'Test Task',
  description: 'Test Description',
  status: TaskStatus.TODO,
  dueDate: null,
  assigneeId: '',
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const renderTaskFormHook = (props: Parameters<typeof useTaskForm>[0]) =>
  renderHook(() => useTaskForm(props), { wrapper });

describe(useTaskForm, () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    searchUsers.mockResolvedValue(mockUsers);
  });

  it('initializes empty create-mode values', () => {
    const { result } = renderTaskFormHook({ onSubmit: vi.fn<SubmitHandler>() });

    expect(result.current.form.state.values).toStrictEqual({
      title: '',
      description: '',
      status: TaskStatus.TODO,
      dueDate: null,
      assigneeId: '',
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.searchQuery).toBe('');
    expect(result.current.assigneeLabel).toBeUndefined();
  });

  it('maps edit-mode default values onto the flat field state', () => {
    const dueDate = new Date(2030, 11, 31);
    const { result } = renderTaskFormHook({
      onSubmit: vi.fn<SubmitHandler>(),
      defaultValues: {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.IN_PROGRESS,
        dueDate,
        assignee: { _id: 'user-1', name: 'John Doe', email: 'john@example.com' },
      },
    });

    expect(result.current.form.state.values).toStrictEqual({
      title: 'Test Task',
      description: 'Test Description',
      status: TaskStatus.IN_PROGRESS,
      dueDate,
      assigneeId: 'user-1',
    });
    expect(result.current.assigneeLabel).toBe('John Doe');
  });

  it('falls back to email, then id, for the pre-selected assignee label', () => {
    const withEmail = renderTaskFormHook({
      onSubmit: vi.fn<SubmitHandler>(),
      defaultValues: { assignee: { _id: 'user-1', name: null, email: 'john@example.com' } },
    });
    expect(withEmail.result.current.assigneeLabel).toBe('john@example.com');

    const idOnly = renderTaskFormHook({
      onSubmit: vi.fn<SubmitHandler>(),
      defaultValues: { assignee: { _id: 'user-1', name: null } },
    });
    expect(idOnly.result.current.assigneeLabel).toBe('user-1');
  });

  it('loads the initial user list with an empty search', async () => {
    const { result } = renderTaskFormHook({ onSubmit: vi.fn<SubmitHandler>() });

    await waitFor(() => {
      expect(result.current.users).toStrictEqual(mockUsers);
    });
    expect(searchUsers).toHaveBeenCalledWith('');
  });

  it('searches users when the search query changes', async () => {
    const { result } = renderTaskFormHook({ onSubmit: vi.fn<SubmitHandler>() });

    act(() => {
      result.current.setSearchQuery('john');
    });

    await waitFor(() => {
      expect(searchUsers).toHaveBeenCalledWith('john');
    });
  });

  it('reports isSearching while a search is in flight', async () => {
    const search = Promise.withResolvers<User[]>();
    searchUsers.mockReturnValue(search.promise);

    const { result } = renderTaskFormHook({ onSubmit: vi.fn<SubmitHandler>() });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(true);
    });

    act(() => {
      search.resolve(mockUsers);
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });
  });

  it('returns no users when the search fails', async () => {
    searchUsers.mockRejectedValue(new Error('Search failed'));

    const { result } = renderTaskFormHook({ onSubmit: vi.fn<SubmitHandler>() });

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });
    expect(result.current.users).toStrictEqual([]);
  });

  it('submits schema-shaped values without an assignee', async () => {
    const onSubmit = vi.fn<SubmitHandler>().mockResolvedValue();
    const { result } = renderTaskFormHook({ onSubmit });

    await act(async () => {
      await result.current.handleSubmit(baseValues);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Test Task',
      description: 'Test Description',
      status: TaskStatus.TODO,
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('resolves the assignee name from loaded users and keeps the due date', async () => {
    const onSubmit = vi.fn<SubmitHandler>().mockResolvedValue();
    const { result } = renderTaskFormHook({ onSubmit });
    await waitFor(() => {
      expect(result.current.users).toHaveLength(2);
    });
    const dueDate = new Date(2030, 0, 15);

    await act(async () => {
      await result.current.handleSubmit({ ...baseValues, dueDate, assigneeId: 'user-2' });
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate, assignee: { _id: 'user-2', name: 'Jane Smith' } }),
    );
  });

  it('falls back to the default assignee name when it is not in the search results', async () => {
    searchUsers.mockResolvedValue([]);
    const onSubmit = vi.fn<SubmitHandler>().mockResolvedValue();
    const { result } = renderTaskFormHook({
      onSubmit,
      defaultValues: { assignee: { _id: 'user-9', name: 'Old Assignee' } },
    });

    await act(async () => {
      await result.current.handleSubmit({ ...baseValues, assigneeId: 'user-9' });
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ assignee: { _id: 'user-9', name: 'Old Assignee' } }),
    );
  });

  it('shows a toast and resets isSubmitting when submit fails', async () => {
    const { toast } = await import('sonner');
    const onSubmit = vi.fn<SubmitHandler>().mockRejectedValue(new Error('Submit failed'));
    const { result } = renderTaskFormHook({ onSubmit });

    await act(async () => {
      await result.current.handleSubmit(baseValues);
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Submit failed'));
    expect(result.current.isSubmitting).toBe(false);
  });

  it('sets isSubmitting while the submission is pending', async () => {
    const submission = Promise.withResolvers<Awaited<ReturnType<SubmitHandler>>>();
    const onSubmit = vi.fn<SubmitHandler>().mockReturnValue(submission.promise);
    const { result } = renderTaskFormHook({ onSubmit });

    act(() => {
      void result.current.handleSubmit(baseValues);
    });
    await waitFor(() => {
      expect(result.current.isSubmitting).toBe(true);
    });

    act(() => {
      submission.resolve();
    });
    await waitFor(() => {
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  it('routes form.handleSubmit through the converted submit handler', async () => {
    const onSubmit = vi.fn<SubmitHandler>().mockResolvedValue();
    const { result } = renderTaskFormHook({
      onSubmit,
      defaultValues: { title: 'From form', status: TaskStatus.DONE },
    });

    await act(async () => {
      await result.current.form.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'From form',
      description: '',
      status: TaskStatus.DONE,
    });
  });
});
