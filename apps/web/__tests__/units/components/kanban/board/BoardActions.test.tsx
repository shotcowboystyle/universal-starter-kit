import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardActions } from '@/components/kanban/board/BoardActions';
import { useRouter } from '@/i18n/navigation';
import { useDeleteBoard, useUpdateBoard } from '@/lib/api/boards/queries';
import type { Board } from '@/types/dbInterface';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api/boards/queries', () => ({
  useDeleteBoard: vi.fn(),
  useUpdateBoard: vi.fn(),
}));

interface MutationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// Tamagui renders the confirm dialog in a <dialog> element that jsdom treats as
// hidden for role queries, so locate it directly.
const findConfirmDialog = () =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(el).toBeTruthy();
    return el!;
  });

describe('BoardActions', () => {
  const mockBoard: Board = {
    _id: 'board-1',
    title: 'Test Board',
    description: 'Test Description',
    owner: 'user-1',
    members: [{ _id: 'user-1', name: 'John', email: 'john@example.com' }],
    projects: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const router = { push: vi.fn(), refresh: vi.fn() };
  const updateMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(router as any);
    updateMutateAsync.mockImplementation(async (_vars: unknown, options: MutationOptions) => {
      options.onSuccess?.();
    });
    deleteMutateAsync.mockImplementation(async (_id: string, options: MutationOptions) => {
      options.onSuccess?.();
    });
    vi.mocked(useUpdateBoard).mockReturnValue({ mutateAsync: updateMutateAsync } as any);
    vi.mocked(useDeleteBoard).mockReturnValue({ mutate: vi.fn(), mutateAsync: deleteMutateAsync } as any);
  });

  const openMenu = async () => {
    fireEvent.click(screen.getByTestId('board-option-button'));
    await screen.findByRole('menu');
  };

  it('renders the default actions trigger', () => {
    renderWithProviders(<BoardActions board={mockBoard} />);
    const trigger = screen.getByTestId('board-option-button');
    expect(trigger).toHaveAttribute('aria-label', 'Test Board actions');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('uses a custom trigger when children are given', () => {
    renderWithProviders(
      <BoardActions board={mockBoard}>
        <button type="button" data-testid="custom-trigger">
          Custom Trigger
        </button>
      </BoardActions>,
    );
    expect(screen.getByTestId('custom-trigger')).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByTestId('board-option-button')).not.toBeInTheDocument();
  });

  it('shows edit and delete items in the menu', async () => {
    renderWithProviders(<BoardActions board={mockBoard} />);
    await openMenu();
    expect(screen.getByTestId('edit-board-button')).toHaveTextContent('edit');
    expect(screen.getByTestId('delete-board-button')).toHaveTextContent('delete');
  });

  it('edits the board through the prefilled form', async () => {
    renderWithProviders(<BoardActions board={mockBoard} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('edit-board-button'));

    const titleInput = await screen.findByTestId('board-title-input');
    expect(screen.getByText('editBoardTitle')).toBeInTheDocument();
    expect(titleInput).toHaveValue('Test Board');
    expect(screen.getByTestId('board-description-input')).toHaveValue('Test Description');

    fireEvent.change(titleInput, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('save-board-button'));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith(
        { id: 'board-1', title: 'Renamed', description: 'Test Description' },
        expect.any(Object),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('boardUpdated');
    expect(router.refresh).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('editBoardTitle')).not.toBeInTheDocument();
    });
  });

  it('reports update failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    updateMutateAsync.mockRejectedValue(new Error('Server down'));
    renderWithProviders(<BoardActions board={mockBoard} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('edit-board-button'));
    await screen.findByTestId('board-title-input');
    fireEvent.click(screen.getByTestId('save-board-button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update board: Server down');
    });
  });

  it('deletes the board after confirmation', async () => {
    const onDelete = vi.fn();
    renderWithProviders(<BoardActions board={mockBoard} onDelete={onDelete} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('delete-board-button'));

    const dialog = await findConfirmDialog();
    expect(within(dialog).getByText('confirmDeleteTitle')).toBeInTheDocument();
    expect(within(dialog).getByText('confirmDeleteDescription')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete', hidden: true }));

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith('board-1', expect.any(Object));
    });
    expect(onDelete).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('boardDeleted');
    expect(router.push).toHaveBeenCalledWith('/boards');
  });

  it('does not delete when the confirmation is cancelled', async () => {
    renderWithProviders(<BoardActions board={mockBoard} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('delete-board-button'));

    const dialog = await findConfirmDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'cancel', hidden: true }));

    await waitFor(() => {
      expect(document.querySelector('[role="alertdialog"]')).not.toBeInTheDocument();
    });
    expect(deleteMutateAsync).not.toHaveBeenCalled();
  });

  it('reports delete failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMutateAsync.mockImplementation(async (_id: string, options: MutationOptions) => {
      options.onError?.(new Error('nope'));
    });
    renderWithProviders(<BoardActions board={mockBoard} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('delete-board-button'));
    const dialog = await findConfirmDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete', hidden: true }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('boardDeleteFailed');
    });
  });
});
