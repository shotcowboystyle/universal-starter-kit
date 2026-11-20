import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewProjectDialog from '@/components/kanban/project/NewProjectDialog';
import { useCreateProject } from '@/lib/api/projects/queries';
import type { WorkspaceState } from '@/stores/types';
import { useWorkspaceStore } from '@/stores/workspace-store';

vi.mock(import('@/lib/api/projects/queries'), () => ({
  useCreateProject: vi.fn<typeof useCreateProject>(),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- useWorkspaceStore is an overloaded zustand hook that vi.fn can't satisfy
vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn<typeof useWorkspaceStore>(),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- useTranslations stub can't satisfy next-intl's Translator type
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock(import('sonner'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    toast: Object.assign(vi.fn<typeof toast>(), actual.toast, {
      success: vi.fn<typeof toast.success>(),
      error: vi.fn<typeof toast.error>(),
    }),
  };
});

const openDialog = async () => {
  fireEvent.click(screen.getByTestId('new-project-trigger'));
  return await screen.findByText('addNewProjectTitle');
};

const submitTitle = (title: string) => {
  fireEvent.change(screen.getByTestId('project-title-input'), { target: { value: title } });
  fireEvent.click(screen.getByTestId('submit-project-button'));
};

describe(NewProjectDialog, () => {
  const addProject = vi.fn<(...args: Parameters<WorkspaceState['addProject']>) => Promise<string | null>>();
  const mutateAsync =
    vi.fn<
      (input: { title: string; description: string; boardId: string; owner: string }) => Promise<{ _id: string }>
    >();

  beforeEach(() => {
    vi.clearAllMocks();
    addProject.mockResolvedValue('project-1');
    mutateAsync.mockResolvedValue({ _id: 'project-1' });
    vi.mocked(useCreateProject).mockReturnValue({ mutateAsync } as any);
    const state = { addProject };
    vi.mocked(useWorkspaceStore).mockImplementation(
      // SAFETY: the component only reads addProject, which `state` provides.
      (<Selected,>(selector?: (current: typeof state) => Selected) =>
        selector === undefined ? state : selector(state)) as typeof useWorkspaceStore,
    );
  });

  it('renders the trigger and keeps the dialog closed', () => {
    renderWithProviders(<NewProjectDialog />);
    expect(screen.getByTestId('new-project-trigger')).toHaveTextContent('addNewProject');
    expect(screen.queryByText('addNewProjectTitle')).not.toBeInTheDocument();
  });

  it('opens the dialog with the project form', async () => {
    renderWithProviders(<NewProjectDialog />);
    await expect(openDialog()).resolves.toBeInTheDocument();
    expect(screen.getByText('addNewProjectDescription')).toBeInTheDocument();
    expect(screen.getByTestId('project-title-input')).toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
    expect(screen.getByTestId('submit-project-button')).toHaveTextContent('addProject');
  });

  it('creates the project via the store + mutation and notifies the callback', async () => {
    const onProjectAdd = vi.fn<(title: string, description?: string) => void>();
    renderWithProviders(<NewProjectDialog onProjectAdd={onProjectAdd} />);
    await openDialog();
    submitTitle('Backlog');

    await waitFor(() => {
      expect(onProjectAdd).toHaveBeenCalledWith('Backlog', '');
    });
    expect(addProject).toHaveBeenCalledWith('Backlog', '', expect.any(Function));
    expect(toast.success).toHaveBeenCalledWith('createSuccess');

    // The store callback delegates to the create mutation
    const [addCall] = addProject.mock.calls;
    const { 2: persist } = addCall;
    const input = { title: 'Backlog', description: '', boardId: 'board-1', owner: 'user-1' };
    await persist(input);
    expect(mutateAsync).toHaveBeenCalledWith(input);

    await waitFor(() => {
      expect(screen.queryByText('addNewProjectTitle')).not.toBeInTheDocument();
    });
  });

  it('shows an error toast when the store returns no project id', async () => {
    addProject.mockResolvedValue(null);
    const onProjectAdd = vi.fn<(title: string, description?: string) => void>();
    renderWithProviders(<NewProjectDialog onProjectAdd={onProjectAdd} />);
    await openDialog();
    submitTitle('Backlog');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('createFailed');
    });
    expect(onProjectAdd).not.toHaveBeenCalled();
  });

  it('shows an error toast when creation throws', async () => {
    addProject.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProviders(<NewProjectDialog />);
    await openDialog();
    submitTitle('Backlog');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('createFailed');
    });
  });

  it('does not submit without a title', async () => {
    renderWithProviders(<NewProjectDialog />);
    await openDialog();
    fireEvent.click(screen.getByTestId('submit-project-button'));

    await expect(screen.findByText('Title is required')).resolves.toBeInTheDocument();
    expect(addProject).not.toHaveBeenCalled();
  });
});
