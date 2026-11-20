import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewBoardDialog from '@/components/kanban/board/NewBoardDialog';
import { useBoards } from '@/hooks/use-boards';
import { useRouter } from '@/i18n/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';

vi.mock(import('@/hooks/use-boards'), () => ({
  useBoards: vi.fn<typeof useBoards>(),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the zustand hook stub omits the store statics (getState, setState, subscribe)
vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn<typeof useWorkspaceStore>(),
}));

vi.mock(import('@/i18n/navigation'), () => ({
  useRouter: vi.fn<typeof useRouter>(),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the identity translator stub does not match next-intl's typed translator signature
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- sonner's toast is a callable with many members; the test stubs only success/error
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  },
}));

const renderDialog = () =>
  renderWithProviders(
    <NewBoardDialog>
      <button type="button">New Board</button>
    </NewBoardDialog>,
  );

const openDialog = async () => {
  fireEvent.click(screen.getByText('New Board'));
  return await screen.findByTestId('new-board-dialog-title');
};

describe(NewBoardDialog, () => {
  const addBoard = vi.fn<(title: string, description?: string) => Promise<string>>();
  const refresh = vi.fn<() => Promise<void>>();
  const push = vi.fn<(href: string) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    addBoard.mockResolvedValue('board-1');
    vi.mocked(useBoards).mockReturnValue({ refresh } as any);
    vi.mocked(useWorkspaceStore).mockReturnValue({ addBoard } as any);
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn<() => void>(), refresh: vi.fn<() => void>() } as any);
  });

  it('renders only the trigger while closed', () => {
    renderDialog();
    expect(screen.getByText('New Board')).toBeInTheDocument();
    expect(screen.queryByText('newBoardTitle')).not.toBeInTheDocument();
  });

  it('opens the dialog with title, description and the board form', async () => {
    renderDialog();
    await expect(openDialog()).resolves.toHaveTextContent('newBoardTitle');
    expect(screen.getByText('newBoardDescription')).toBeInTheDocument();
    expect(screen.getByTestId('board-title-input')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-button')).toHaveTextContent('cancel');
    expect(screen.getByTestId('create-button')).toHaveTextContent('create');
  });

  it('creates the board, refreshes and navigates to it', async () => {
    renderDialog();
    await openDialog();
    fireEvent.change(screen.getByTestId('board-title-input'), { target: { value: 'Roadmap' } });
    fireEvent.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/boards/board-1');
    });
    expect(addBoard).toHaveBeenCalledWith('Roadmap', '');
    expect(toast.success).toHaveBeenCalledWith('boardCreatedSuccess');
    expect(refresh).toHaveBeenCalledWith();
  });

  it('does not create a board without a title', async () => {
    renderDialog();
    await openDialog();
    fireEvent.click(screen.getByTestId('create-button'));

    await expect(screen.findByText('Title is required')).resolves.toBeInTheDocument();
    expect(addBoard).not.toHaveBeenCalled();
  });

  it('shows an error toast when creation fails', async () => {
    addBoard.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDialog();
    await openDialog();
    fireEvent.change(screen.getByTestId('board-title-input'), { target: { value: 'Roadmap' } });
    fireEvent.click(screen.getByTestId('create-button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('boardCreateFailed');
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('closes the dialog on cancel', async () => {
    renderDialog();
    await openDialog();
    fireEvent.click(screen.getByTestId('cancel-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('new-board-dialog-title')).not.toBeInTheDocument();
    });
  });
});
