import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewProjectDialog from '@/components/kanban/project/NewProjectDialog';
import { useCreateProject } from '@/lib/api/projects/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';

vi.mock('@/lib/api/projects/queries', () => ({
  useCreateProject: vi.fn(),
}));

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn(),
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

describe('NewProjectDialog', () => {
  const addProject = vi.fn();
  const mutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    addProject.mockResolvedValue('project-1');
    mutateAsync.mockResolvedValue({ _id: 'project-1' });
    vi.mocked(useCreateProject).mockReturnValue({ mutateAsync } as any);
    vi.mocked(useWorkspaceStore).mockImplementation((selector?: any) => {
      const state = { addProject };
      return selector ? selector(state) : state;
    });
  });

  const openDialog = async () => {
    fireEvent.click(screen.getByTestId('new-project-trigger'));
    return screen.findByText('addNewProjectTitle');
  };

  const submitTitle = (title: string) => {
    fireEvent.change(screen.getByTestId('project-title-input'), { target: { value: title } });
    fireEvent.click(screen.getByTestId('submit-project-button'));
  };

  it('renders the trigger and keeps the dialog closed', () => {
    renderWithProviders(<NewProjectDialog />);
    expect(screen.getByTestId('new-project-trigger')).toHaveTextContent('addNewProject');
    expect(screen.queryByText('addNewProjectTitle')).not.toBeInTheDocument();
  });

  it('opens the dialog with the project form', async () => {
    renderWithProviders(<NewProjectDialog />);
    expect(await openDialog()).toBeInTheDocument();
    expect(screen.getByText('addNewProjectDescription')).toBeInTheDocument();
    expect(screen.getByTestId('project-title-input')).toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
    expect(screen.getByTestId('submit-project-button')).toHaveTextContent('addProject');
  });

  it('creates the project via the store + mutation and notifies the callback', async () => {
    const onProjectAdd = vi.fn();
    renderWithProviders(<NewProjectDialog onProjectAdd={onProjectAdd} />);
    await openDialog();
    submitTitle('Backlog');

    await waitFor(() => {
      expect(onProjectAdd).toHaveBeenCalledWith('Backlog', '');
    });
    expect(addProject).toHaveBeenCalledWith('Backlog', '', expect.any(Function));
    expect(toast.success).toHaveBeenCalledWith('createSuccess');

    // The store callback delegates to the create mutation
    const persist = addProject.mock.calls[0][2];
    await persist({ title: 'Backlog' });
    expect(mutateAsync).toHaveBeenCalledWith({ title: 'Backlog' });

    await waitFor(() => {
      expect(screen.queryByText('addNewProjectTitle')).not.toBeInTheDocument();
    });
  });

  it('shows an error toast when the store returns no project id', async () => {
    addProject.mockResolvedValue(null);
    const onProjectAdd = vi.fn();
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

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(addProject).not.toHaveBeenCalled();
  });
});
