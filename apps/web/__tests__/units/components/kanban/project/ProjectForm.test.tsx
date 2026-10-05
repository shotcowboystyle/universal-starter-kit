import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectForm } from '@/components/kanban/project/ProjectForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderForm(props: Partial<React.ComponentProps<typeof ProjectForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <ProjectForm onSubmit={onSubmit} {...props}>
      <Button action="submit" testID="submit">
        Submit
      </Button>
    </ProjectForm>,
  );
  return { onSubmit };
}

describe('ProjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders labelled title and description fields', () => {
    renderForm();
    expect(screen.getByText(/titleLabel/)).toBeInTheDocument();
    expect(screen.getByText(/descriptionLabel/)).toBeInTheDocument();
    expect(screen.getByTestId('project-title-input')).toHaveAttribute('placeholder', 'titlePlaceholder');
    expect(screen.getByTestId('project-description-input')).toHaveAttribute('placeholder', 'descriptionPlaceholder');
  });

  it('prefills default values in edit mode', () => {
    renderForm({ defaultValues: { title: 'Test Project', description: 'Test Description' } });
    expect(screen.getByTestId('project-title-input')).toHaveValue('Test Project');
    expect(screen.getByTestId('project-description-input')).toHaveValue('Test Description');
  });

  it('submits the entered values', async () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByTestId('project-title-input'), { target: { value: 'Roadmap' } });
    fireEvent.change(screen.getByTestId('project-description-input'), { target: { value: 'Q3 plan' } });
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
