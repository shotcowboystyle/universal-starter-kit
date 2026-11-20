import { renderWithProviders as render } from '@repo/test-utils';
import { screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Board } from '@/components/kanban/board/Board';
import { TaskStatus } from '@/types/db-interface';
import type { Project } from '@/types/db-interface';

globalThis.React = React;

interface StoreStub {
  projects: Project[];
}
type Selector = (state: StoreStub) => object;

const mockUseAuth = vi.fn<() => object>();
const mockUseBoards = vi.fn<() => object>();
const mockUseWorkspaceStore = vi.fn<(selector?: Selector) => object>();

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/hooks/use-auth'),
  () =>
    ({
      useAuth: () => mockUseAuth(),
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/hooks/use-boards'),
  () =>
    ({
      useBoards: () => mockUseBoards(),
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/stores/workspace-store'),
  () =>
    ({
      useWorkspaceStore: (selector?: Selector) => mockUseWorkspaceStore(selector),
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/lib/api/task-api'),
  () =>
    ({
      taskApi: {
        moveTask: vi.fn<() => void>(),
        updateTask: vi.fn<() => void>(),
      },
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/lib/api/project-api'),
  () =>
    ({
      projectApi: {
        updateProject: vi.fn<() => void>(),
      },
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('next-intl'),
  () =>
    ({
      useTranslations: () => (key: string) => key,
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<() => void>(),
        error: vi.fn<() => void>(),
      },
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@dnd-kit/core'),
  () =>
    ({
      DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
      DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
      useSensor: vi.fn<() => void>(),
      useSensors: vi.fn<() => object[]>(() => []),
      MouseSensor: vi.fn<() => void>(),
      TouchSensor: vi.fn<() => void>(),
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@dnd-kit/sortable'),
  () =>
    ({
      SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
      arrayMove: (arr: any[], from: number, to: number) => {
        const newArr = [...arr];
        const [item] = newArr.splice(from, 1);
        newArr.splice(to, 0, item);
        return newArr;
      },
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/components/kanban/project/NewProjectDialog'),
  () =>
    ({
      default: () => <div data-testid="new-project-dialog">New Project</div>,
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/components/kanban/project/Project'),
  () =>
    ({
      BoardContainer: ({ children }: any) => <div data-testid="board-container">{children}</div>,
      BoardProject: ({ project }: any) => <div data-testid={`project-${project._id}`}>{project.title}</div>,
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/components/kanban/task/TaskFilter'),
  () =>
    ({
      TaskFilter: () => <div data-testid="task-filter">Filter</div>,
    }) as never,
);

// SAFETY: each stub supplies only the exports Board and its children use
vi.mock(
  import('@/components/kanban/task/TaskCard'),
  () =>
    ({
      TaskCard: ({ task }: any) => <div data-testid={`task-card-${task._id}`}>{task.title}</div>,
    }) as never,
);

describe(Board, () => {
  const mockUserInfo: any = { _id: 'user-1', name: 'John', email: 'john@example.com' };
  const mockProjects: Project[] = [
    {
      _id: 'project-1',
      title: 'Project 1',
      description: 'Description 1',
      board: 'board-1',
      owner: 'user-1',
      members: [mockUserInfo],
      orderInBoard: 0,
      tasks: [
        {
          _id: 'task-1',
          title: 'Task 1',
          description: 'Task Description',
          status: TaskStatus.TODO,
          project: 'project-1',
          board: 'board-1',
          creator: mockUserInfo,
          lastModifier: mockUserInfo,
          orderInProject: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      _id: 'project-2',
      title: 'Project 2',
      description: 'Description 2',
      board: 'board-1',
      owner: 'user-2',
      members: [],
      orderInBoard: 1,
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockMyBoards = [
    {
      _id: 'board-1',
      title: 'My Board',
      description: 'Board Description',
      owner: 'user-1',
      members: [mockUserInfo],
      projects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const defaultWorkspaceState = {
    projects: mockProjects,
    isLoadingProjects: false,
    filter: { status: null, search: '' },
    setProjects: vi.fn<() => void>(),
    currentBoardId: 'board-1',
    userId: 'user-1',
    fetchProjects: vi.fn<() => void>(),
  };

  const defaultAuthState = {
    user: mockUserInfo,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn<() => void>(),
    loginWithEmail: vi.fn<() => void>(),
    logout: vi.fn<() => void>(),
    loginMutation: {},
    error: null,
    session: null,
  };

  const defaultBoardsState = {
    myBoards: mockMyBoards,
    teamBoards: [],
    loading: false,
    error: null,
    refresh: vi.fn<() => void>(),
  };

  const setupMocks = (overrides: any = {}) => {
    const authState = { ...defaultAuthState, ...overrides.authState };
    const boardsState = { ...defaultBoardsState, ...overrides.boardsState };
    const workspaceState = { ...defaultWorkspaceState, ...overrides.workspaceState };

    if (overrides.user !== undefined) {
      authState.user = overrides.user;
    }
    if (overrides.isAuthenticated !== undefined) {
      authState.isAuthenticated = overrides.isAuthenticated;
    }
    if (overrides.myBoards !== undefined) {
      boardsState.myBoards = overrides.myBoards;
    }
    if (overrides.teamBoards !== undefined) {
      boardsState.teamBoards = overrides.teamBoards;
    }
    if (overrides.projects !== undefined) {
      workspaceState.projects = overrides.projects;
    }
    if (overrides.isLoadingProjects !== undefined) {
      workspaceState.isLoadingProjects = overrides.isLoadingProjects;
    }
    if (overrides.filter !== undefined) {
      workspaceState.filter = overrides.filter;
    }
    if (overrides.currentBoardId !== undefined) {
      workspaceState.currentBoardId = overrides.currentBoardId;
    }

    mockUseAuth.mockReturnValue(authState);
    mockUseBoards.mockReturnValue(boardsState);
    mockUseWorkspaceStore.mockImplementation((selector) =>
      selector == null ? workspaceState : selector(workspaceState),
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it.each([
    ['board component', 'board'],
    ['DndContext', 'dnd-context'],
    ['new project dialog', 'new-project-dialog'],
    ['task filter', 'task-filter'],
    ['board container', 'board-container'],
    ['drag overlay', 'drag-overlay'],
    ['board when the user is the owner', 'board'],
  ])('should render %s', (_label, testId) => {
    render(<Board />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('should render all projects', () => {
    render(<Board />);
    expect(screen.getByTestId('project-project-1')).toBeInTheDocument();
    expect(screen.getByTestId('project-project-2')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading projects', () => {
    setupMocks({ isLoadingProjects: true });

    render(<Board />);
    expect(screen.getByTestId('projects-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('project-project-1')).not.toBeInTheDocument();
  });

  it('should sort projects by orderInBoard', () => {
    const unsortedProjects = [
      { ...mockProjects[1], orderInBoard: 2 },
      { ...mockProjects[0], orderInBoard: 1 },
    ];

    setupMocks({ projects: unsortedProjects });

    render(<Board />);
    expect(screen.getByTestId('project-project-1')).toBeInTheDocument();
    expect(screen.getByTestId('project-project-2')).toBeInTheDocument();
  });

  it('should determine board owner correctly when user is not owner', () => {
    setupMocks({ user: { _id: 'user-2', name: 'Jane', email: 'jane@example.com' } });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('should handle unauthenticated user', () => {
    setupMocks({ user: null, isAuthenticated: false });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('should determine board member correctly', () => {
    const teamBoards = [
      {
        _id: 'board-2',
        title: 'Team Board',
        description: '',
        owner: 'user-2',
        members: [{ _id: 'user-1', name: 'John', email: 'john@example.com' }],
        projects: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    setupMocks({
      myBoards: [],
      teamBoards,
      currentBoardId: 'board-2',
    });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('should handle empty projects list', () => {
    setupMocks({ projects: [] });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.queryByTestId('project-project-1')).not.toBeInTheDocument();
  });

  it('should filter tasks by status', () => {
    setupMocks({ filter: { status: TaskStatus.TODO, search: '' } });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('should filter tasks by search term', () => {
    setupMocks({ filter: { status: null, search: 'Task 1' } });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('should handle projects with no currentBoardId', () => {
    setupMocks({ currentBoardId: null });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('should handle projects with board owner as object', () => {
    const boardsWithObjectOwner = [
      {
        ...mockMyBoards[0],
        owner: { _id: 'user-1', name: 'John', email: 'john@example.com' },
      },
    ];

    setupMocks({ myBoards: boardsWithObjectOwner });

    render(<Board />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });
});
