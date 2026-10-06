import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type TaskFormValues, useTaskForm } from '@/hooks/useTaskForm';
import { TaskStatus, User } from '@/types/dbInterface';

vi.mock('@/lib/api/userApi', () => ({
  userApi: {
    searchUsers: vi.fn(),
    getUserById: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderTaskFormHook(props: Parameters<typeof useTaskForm>[0]) {
  return renderHook(() => useTaskForm(props), { wrapper });
}

describe('useTaskForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { userApi } = await import('@/lib/api/userApi');
    vi.mocked(userApi.searchUsers).mockResolvedValue(mockUsers);
  });

  it('initializes empty create-mode values', () => {
    const { result } = renderTaskFormHook({ onSubmit: vi.fn() });

    expect(result.current.form.state.values).toEqual({
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
      onSubmit: vi.fn(),
      defaultValues: {
        title: 'Test Task',
        description: 'Test Description',
        status: TaskStatus.IN_PROGRESS,
        dueDate,
        assignee: { _id: 'user-1', name: 'John Doe', email: 'john@example.com' },
      },
    });

    expect(result.current.form.state.values).toEqual({
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
      onSubmit: vi.fn(),
      defaultValues: { assignee: { _id: 'user-1', name: null, email: 'john@example.com' } },
    });
    expect(withEmail.result.current.assigneeLabel).toBe('john@example.com');

    const idOnly = renderTaskFormHook({
      onSubmit: vi.fn(),
      defaultValues: { assignee: { _id: 'user-1', name: null } },
    });
    expect(idOnly.result.current.assigneeLabel).toBe('user-1');
  });

  it('loads the initial user list with an empty search', async () => {
    const { userApi } = await import('@/lib/api/userApi');
    const { result } = renderTaskFormHook({ onSubmit: vi.fn() });

    await waitFor(() => expect(result.current.users).toEqual(mockUsers));
    expect(userApi.searchUsers).toHaveBeenCalledWith('');
  });

  it('searches users when the search query changes', async () => {
    const { userApi } = await import('@/lib/api/userApi');
    const { result } = renderTaskFormHook({ onSubmit: vi.fn() });

    act(() => {
      result.current.setSearchQuery('john');
    });

    await waitFor(() => expect(userApi.searchUsers).toHaveBeenCalledWith('john'));
  });

  it('reports isSearching while a search is in flight', async () => {
    const { userApi } = await import('@/lib/api/userApi');
    let resolveSearch!: (value: User[]) => void;
    vi.mocked(userApi.searchUsers).mockReturnValue(
      new Promise<User[]>((resolve) => {
        resolveSearch = resolve;
      }),
    );

    const { result } = renderTaskFormHook({ onSubmit: vi.fn() });
    await waitFor(() => expect(result.current.isSearching).toBe(true));

    act(() => resolveSearch(mockUsers));
    await waitFor(() => expect(result.current.isSearching).toBe(false));
  });

  it('returns no users when the search fails', async () => {
    const { userApi } = await import('@/lib/api/userApi');
    vi.mocked(userApi.searchUsers).mockRejectedValue(new Error('Search failed'));

    const { result } = renderTaskFormHook({ onSubmit: vi.fn() });

    await waitFor(() => expect(result.current.isSearching).toBe(false));
    expect(result.current.users).toEqual([]);
  });

  it('submits schema-shaped values without an assignee', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderTaskFormHook({ onSubmit });

    await act(async () => {
      await result.current.handleSubmit(baseValues);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Test Task',
      description: 'Test Description',
      status: TaskStatus.TODO,
      dueDate: undefined,
      assignee: undefined,
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('resolves the assignee name from loaded users and keeps the due date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderTaskFormHook({ onSubmit });
    await waitFor(() => expect(result.current.users).toHaveLength(2));
    const dueDate = new Date(2030, 0, 15);

    await act(async () => {
      await result.current.handleSubmit({ ...baseValues, dueDate, assigneeId: 'user-2' });
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate, assignee: { _id: 'user-2', name: 'Jane Smith' } }),
    );
  });

  it('falls back to the default assignee name when it is not in the search results', async () => {
    const { userApi } = await import('@/lib/api/userApi');
    vi.mocked(userApi.searchUsers).mockResolvedValue([]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
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
    const onSubmit = vi.fn().mockRejectedValue(new Error('Submit failed'));
    const { result } = renderTaskFormHook({ onSubmit });

    await act(async () => {
      await result.current.handleSubmit(baseValues);
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Submit failed'));
    expect(result.current.isSubmitting).toBe(false);
  });

  it('sets isSubmitting while the submission is pending', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const { result } = renderTaskFormHook({ onSubmit });

    act(() => {
      result.current.handleSubmit(baseValues).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    act(() => resolveSubmit());
    await waitFor(() => expect(result.current.isSubmitting).toBe(false));
  });

  it('routes form.handleSubmit through the converted submit handler', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
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
      dueDate: undefined,
      assignee: undefined,
    });
  });
});
