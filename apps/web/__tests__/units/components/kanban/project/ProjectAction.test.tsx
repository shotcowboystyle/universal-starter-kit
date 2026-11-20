import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectActions } from '@/components/kanban/project/ProjectAction';
import { useDeleteProject, useUpdateProject } from '@/lib/api/projects/queries';
import type { WorkspaceState } from '@/stores/types';
import { useWorkspaceStore } from '@/stores/workspace-store';

// oxlint-disable-next-line vitest/prefer-import-in-mock -- useWorkspaceStore is an overloaded zustand hook that vi.fn can't satisfy
vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn<typeof useWorkspaceStore>(),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- useTranslations stub can't satisfy next-intl's Translator type
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { title?: string; error?: string }) => {
    if (values?.title !== undefined && values.title !== '') {
      return `${key}: ${values.title}`;
    }
    if (values?.error !== undefined && values.error !== '') {
      return `${key}: ${values.error}`;
    }
    return key;
  },
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

vi.mock(import('@/lib/api/projects/queries'), () => ({
  useDeleteProject: vi.fn<typeof useDeleteProject>(),
  useUpdateProject: vi.fn<typeof useUpdateProject>(),
}));

// Tamagui renders the confirm dialog in a <dialog> element that jsdom treats as
// hidden for role queries, so locate it directly.
const findConfirmDialog = async () =>
  await waitFor(() => {
    const el = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(el).toBeTruthy();
    return el!;
  });

const openMenu = async () => {
  fireEvent.click(screen.getByTestId('project-option-button'));
  await screen.findByRole('menu');
};

describe(ProjectActions, () => {
  const props = {
    id: 'project-1',
    title: 'Test Project',
    description: 'Test Description',
    ownerId: 'user-1',
  };

  const updateProject = vi.fn<WorkspaceState['updateProject']>();
  const removeProject = vi.fn<WorkspaceState['removeProject']>();
  const updateMutateAsync =
    vi.fn<(input: { id: string; title: string; description: string | null; owner: string }) => Promise<void>>();
  const deleteMutateAsync = vi.fn<(id: string) => Promise<void>>();

  const mockStore = (userId: string | null) => {
    const state = { userId, updateProject, removeProject };
    vi.mocked(useWorkspaceStore).mockImplementation(
      // SAFETY: the component only reads userId/updateProject/removeProject, which `state` provides.
      (<Selected,>(selector?: (current: typeof state) => Selected) =>
        selector === undefined ? state : selector(state)) as typeof useWorkspaceStore,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore('user-1');
    updateProject.mockResolvedValue();
    removeProject.mockResolvedValue();
    vi.mocked(useUpdateProject).mockReturnValue({ mutateAsync: updateMutateAsync } as any);
    vi.mocked(useDeleteProject).mockReturnValue({ mutateAsync: deleteMutateAsync } as any);
  });

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
    const [updateCall] = updateProject.mock.calls;
    const { 3: persist } = updateCall;
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

    const [removeCall] = removeProject.mock.calls;
    const { 1: persist } = removeCall;
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
    renderWithProviders(
      <ProjectActions
        {...props}
        ownerId={null as any}
      />,
    );
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
