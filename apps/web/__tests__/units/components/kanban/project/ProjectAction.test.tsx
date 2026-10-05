import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectActions } from '@/components/kanban/project/ProjectAction';
import { useDeleteProject, useUpdateProject } from '@/lib/api/projects/queries';
import { useWorkspaceStore } from '@/stores/workspace-store';

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: any) => {
    if (values?.title) {
      return `${key}: ${values.title}`;
    }
    if (values?.error) {
      return `${key}: ${values.error}`;
    }
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api/projects/queries', () => ({
  useDeleteProject: vi.fn(),
  useUpdateProject: vi.fn(),
}));

// Tamagui renders the confirm dialog in a <dialog> element that jsdom treats as
// hidden for role queries, so locate it directly.
const findConfirmDialog = () =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(el).toBeTruthy();
    return el!;
  });

describe('ProjectActions', () => {
  const props = {
    id: 'project-1',
    title: 'Test Project',
    description: 'Test Description',
    ownerId: 'user-1',
  };

  const updateProject = vi.fn();
  const removeProject = vi.fn();
  const updateMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();

  const mockStore = (userId: string | null) => {
    vi.mocked(useWorkspaceStore).mockImplementation((selector?: any) => {
      const state = { userId, updateProject, removeProject };
      return selector ? selector(state) : state;
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore('user-1');
    updateProject.mockResolvedValue(undefined);
    removeProject.mockResolvedValue(undefined);
    vi.mocked(useUpdateProject).mockReturnValue({ mutateAsync: updateMutateAsync } as any);
    vi.mocked(useDeleteProject).mockReturnValue({ mutateAsync: deleteMutateAsync } as any);
  });

  const openMenu = async () => {
    fireEvent.click(screen.getByTestId('project-option-button'));
    await screen.findByRole('menu');
  };

  it('renders the actions trigger', () => {
    renderWithProviders(<ProjectActions {...props} />);
    expect(screen.getByTestId('project-option-button')).toHaveAttribute('aria-label', 'Test Project actions');
  });

  it('enables edit and delete for the owner', async () => {
    renderWithProviders(<ProjectActions {...props} />);
    await openMenu();
    expect(screen.getByTestId('edit-project-button')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('delete-project-button')).not.toHaveAttribute('aria-disabled');
  });

  it('disables edit and delete for non-owners', async () => {
    mockStore('user-2');
    renderWithProviders(<ProjectActions {...props} />);
    await openMenu();
    expect(screen.getByTestId('edit-project-button')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('delete-project-button')).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByTestId('delete-project-button'));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeInTheDocument();
  });

  it('updates the project through the prefilled form', async () => {
    renderWithProviders(<ProjectActions {...props} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('edit-project-button'));

    const titleInput = await screen.findByTestId('project-title-input');
    expect(screen.getByText('editProjectTitle')).toBeInTheDocument();
    expect(titleInput).toHaveValue('Test Project');
    fireEvent.change(titleInput, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('save-project-button'));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('project-1', 'Renamed', 'Test Description', expect.any(Function));
    });
    expect(toast.success).toHaveBeenCalledWith('updateSuccess');

    // The store callback maps to the update mutation with the current user as owner
    const persist = updateProject.mock.calls[0][3];
    await persist('project-1', { title: 'Renamed', description: '' });
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'project-1',
      title: 'Renamed',
      description: null,
      owner: 'user-1',
    });
  });

  it('reports update failures', async () => {
    updateProject.mockRejectedValue(new Error('Server down'));
    renderWithProviders(<ProjectActions {...props} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('edit-project-button'));
    await screen.findByTestId('project-title-input');
    fireEvent.click(screen.getByTestId('save-project-button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('updateFailed: Server down');
    });
  });

  it('deletes the project after confirmation', async () => {
    renderWithProviders(<ProjectActions {...props} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('delete-project-button'));

    const dialog = await findConfirmDialog();
    expect(within(dialog).getByText('confirmDeleteTitle: Test Project')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete', hidden: true }));

    await waitFor(() => {
      expect(removeProject).toHaveBeenCalledWith('project-1', expect.any(Function));
    });
    expect(toast.success).toHaveBeenCalledWith('deleteSuccess: Test Project');

    const persist = removeProject.mock.calls[0][1];
    await persist('project-1');
    expect(deleteMutateAsync).toHaveBeenCalledWith('project-1');
  });

  it('reports delete failures', async () => {
    removeProject.mockRejectedValue(new Error('nope'));
    renderWithProviders(<ProjectActions {...props} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('delete-project-button'));
    const dialog = await findConfirmDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete', hidden: true }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('deleteFailed: nope');
    });
  });

  it('refuses to update when the user is not authenticated', async () => {
    mockStore(null);
    renderWithProviders(<ProjectActions {...props} ownerId={null as any} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('edit-project-button'));
    await screen.findByTestId('project-title-input');
    fireEvent.click(screen.getByTestId('save-project-button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('userNotAuthenticated');
    });
    expect(updateProject).not.toHaveBeenCalled();
  });
});
