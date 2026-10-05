import { renderWithProviders as render } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskFilter } from '@/components/kanban/task/TaskFilter';
import { TaskStatus } from '@/types/dbInterface';

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockSetFilter = vi.fn();

const mockProjects = [
  {
    _id: 'project-1',
    title: 'Project 1',
    tasks: [
      { _id: 'task-1', title: 'Task 1', status: TaskStatus.TODO },
      { _id: 'task-2', title: 'Task 2', status: TaskStatus.IN_PROGRESS },
      { _id: 'task-3', title: 'Task 3', status: TaskStatus.DONE },
    ],
  },
  {
    _id: 'project-2',
    title: 'Project 2',
    tasks: [
      { _id: 'task-4', title: 'Task 4', status: TaskStatus.TODO },
      { _id: 'task-5', title: 'Task 5', status: TaskStatus.TODO },
    ],
  },
];

async function mockStore(state: { filter?: { status: string | null; search: string }; projects?: unknown }) {
  const { useWorkspaceStore } = await import('@/stores/workspace-store');
  vi.mocked(useWorkspaceStore).mockReturnValue({
    filter: { status: null, search: '' },
    setFilter: mockSetFilter,
    projects: mockProjects,
    ...state,
  } as any);
}

const chip = (name: RegExp) => screen.getByRole('button', { name });

describe('TaskFilter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockStore({});
  });

  it('renders the search input with placeholder', () => {
    render(<TaskFilter />);
    expect(screen.getByTestId('search-input')).toHaveAttribute('placeholder', 'searchPlaceholder');
  });

  it('displays the current search value', async () => {
    await mockStore({ filter: { status: null, search: 'test query' } });
    render(<TaskFilter />);
    expect(screen.getByTestId('search-input')).toHaveValue('test query');
  });

  it('calls setFilter on every search change', () => {
    render(<TaskFilter />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(mockSetFilter).toHaveBeenNthCalledWith(1, { search: 'a' });
    expect(mockSetFilter).toHaveBeenNthCalledWith(2, { search: 'ab' });
  });

  it('renders status chips with per-status counts', () => {
    render(<TaskFilter />);
    expect(chip(/^total 5$/)).toBeInTheDocument();
    expect(chip(/^statusTodo 3$/)).toBeInTheDocument();
    expect(chip(/^statusInProgress 1$/)).toBeInTheDocument();
    expect(chip(/^statusDone 1$/)).toBeInTheDocument();
  });

  it('marks the TOTAL chip as selected when no status filter is set', () => {
    render(<TaskFilter />);
    expect(chip(/^total/)).toHaveAttribute('aria-pressed', 'true');
    expect(chip(/^statusTodo/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the active status chip as selected', async () => {
    await mockStore({ filter: { status: TaskStatus.DONE, search: '' } });
    render(<TaskFilter />);
    expect(chip(/^statusDone/)).toHaveAttribute('aria-pressed', 'true');
    expect(chip(/^total/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('sets the status filter when a status chip is pressed', () => {
    render(<TaskFilter />);
    fireEvent.click(chip(/^statusInProgress/));
    expect(mockSetFilter).toHaveBeenCalledWith({ status: TaskStatus.IN_PROGRESS });
  });

  it('clears the status filter when TOTAL is pressed', async () => {
    await mockStore({ filter: { status: TaskStatus.TODO, search: '' } });
    render(<TaskFilter />);
    fireEvent.click(chip(/^total/));
    expect(mockSetFilter).toHaveBeenCalledWith({ status: null });
  });

  it('hides the clear button when no filter is active', () => {
    render(<TaskFilter />);
    expect(screen.queryByTestId('clear-filter-button')).not.toBeInTheDocument();
  });

  it('shows the clear button for an active search', async () => {
    await mockStore({ filter: { status: null, search: 'some query' } });
    render(<TaskFilter />);
    expect(screen.getByTestId('clear-filter-button')).toBeInTheDocument();
  });

  it('resets status and search when clear is pressed', async () => {
    await mockStore({ filter: { status: TaskStatus.TODO, search: 'test' } });
    render(<TaskFilter />);
    fireEvent.click(screen.getByTestId('clear-filter-button'));
    expect(mockSetFilter).toHaveBeenCalledWith({ status: null, search: '' });
  });

  it.each([
    ['empty projects', []],
    ['null projects', null],
    ['projects with null tasks', [{ _id: 'p', title: 'P', tasks: null }]],
    ['tasks without status', [{ _id: 'p', title: 'P', tasks: [{ _id: 't', status: undefined }] }]],
  ])('handles %s with zero status counts', async (_label, projects) => {
    await mockStore({ projects });
    render(<TaskFilter />);
    expect(chip(/^statusTodo 0$/)).toBeInTheDocument();
  });
});
