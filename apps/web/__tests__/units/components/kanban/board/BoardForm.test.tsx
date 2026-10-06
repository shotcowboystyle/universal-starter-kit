import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardForm } from '@/components/kanban/board/BoardForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderForm(props: Partial<React.ComponentProps<typeof BoardForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <BoardForm onSubmit={onSubmit} {...props}>
      <Button action="submit" testID="submit">
        Submit
      </Button>
    </BoardForm>,
  );
  return { onSubmit };
}

describe('BoardForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders labelled title and description fields', () => {
    renderForm();
    expect(screen.getByText(/boardTitleLabel/)).toBeInTheDocument();
    expect(screen.getByText(/descriptionLabel/)).toBeInTheDocument();
    expect(screen.getByTestId('board-title-input')).toHaveAttribute('placeholder', 'boardTitlePlaceholder');
    expect(screen.getByTestId('board-description-input')).toHaveAttribute('placeholder', 'descriptionPlaceholder');
  });

  it('prefills default values in edit mode', () => {
    renderForm({ defaultValues: { title: 'Test Board', description: 'Test Description' } });
    expect(screen.getByTestId('board-title-input')).toHaveValue('Test Board');
    expect(screen.getByTestId('board-description-input')).toHaveValue('Test Description');
  });

  it('submits the entered values', async () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByTestId('board-title-input'), { target: { value: 'Roadmap' } });
    fireEvent.change(screen.getByTestId('board-description-input'), { target: { value: 'Q3 plan' } });
    fireEvent.click(screen.getByTestId('submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ title: 'Roadmap', description: 'Q3 plan' });
    });
  });

  it('blocks submit and shows the zod error when the title is empty', async () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByTestId('submit'));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
