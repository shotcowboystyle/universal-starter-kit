import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewBoardDialog from '@/components/kanban/board/NewBoardDialog';
import { useBoards } from '@/hooks/useBoards';
import { useRouter } from '@/i18n/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';

vi.mock('@/hooks/useBoards', () => ({
  useBoards: vi.fn(),
}));

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(),
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

describe('NewBoardDialog', () => {
  const addBoard = vi.fn();
  const refresh = vi.fn();
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    addBoard.mockResolvedValue('board-1');
    vi.mocked(useBoards).mockReturnValue({ refresh } as any);
    vi.mocked(useWorkspaceStore).mockReturnValue({ addBoard } as any);
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), refresh: vi.fn() } as any);
  });

  const renderDialog = () =>
    renderWithProviders(
      <NewBoardDialog>
        <button type="button">New Board</button>
      </NewBoardDialog>,
    );

  const openDialog = async () => {
    fireEvent.click(screen.getByText('New Board'));
    return screen.findByTestId('new-board-dialog-title');
  };

  it('renders only the trigger while closed', () => {
    renderDialog();
    expect(screen.getByText('New Board')).toBeInTheDocument();
    expect(screen.queryByText('newBoardTitle')).not.toBeInTheDocument();
  });

  it('opens the dialog with title, description and the board form', async () => {
    renderDialog();
    expect(await openDialog()).toHaveTextContent('newBoardTitle');
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
    expect(refresh).toHaveBeenCalled();
  });

  it('does not create a board without a title', async () => {
    renderDialog();
    await openDialog();
    fireEvent.click(screen.getByTestId('create-button'));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
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
