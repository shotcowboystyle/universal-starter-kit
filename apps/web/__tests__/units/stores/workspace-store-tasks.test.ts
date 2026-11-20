import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { projectApi } from '@/lib/api/project-api';
import type { taskApi } from '@/lib/api/task-api';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { TaskStatus } from '@/types/db-interface';
import type { Project, Task } from '@/types/db-interface';
import type { CreateTaskInput } from '@/types/task-api';

// Mock the API modules
const mockApi = vi.hoisted(() => ({
  project: {
    getProjects: vi.fn<typeof projectApi.getProjects>(),
    createProject: vi.fn<typeof projectApi.createProject>(),
    updateProject: vi.fn<typeof projectApi.updateProject>(),
    deleteProject: vi.fn<typeof projectApi.deleteProject>(),
  },
  task: {
    getTasks: vi.fn<typeof taskApi.getTasks>(),
    createTask: vi.fn<typeof taskApi.createTask>(),
    updateTask: vi.fn<typeof taskApi.updateTask>(),
    deleteTask: vi.fn<typeof taskApi.deleteTask>(),
  },
}));

vi.mock(import('@/lib/api/project-api'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, projectApi: { ...actual.projectApi, ...mockApi.project } };
});

vi.mock(import('@/lib/api/task-api'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, taskApi: { ...actual.taskApi, ...mockApi.task } };
});

describe('workspace-store - Task actions', () => {
  const mockUserInfo: any = { _id: 'user-1', name: 'John', email: 'john@example.com' };

  beforeEach(() => {
    // Reset the store before each test
    useWorkspaceStore.setState({
      userEmail: null,
      userId: null,
      projects: [],
      isLoadingProjects: false,
      currentBoardId: null,
      myBoards: [],
      teamBoards: [],
      filter: {
        status: null,
        search: '',
      },
    });
    vi.clearAllMocks();
  });

  describe('Task actions', () => {
    it('should fetch tasks by project', async () => {
      const mockTasks: Task[] = [
        {
          _id: 'task-1',
          title: 'Task 1',
          description: 'Description 1',
          status: TaskStatus.TODO,
          project: 'project-1',
          board: 'board-1',
          creator: mockUserInfo,
          lastModifier: mockUserInfo,
          orderInProject: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockProject: Project = {
        _id: 'project-1',
        title: 'Project 1',
        description: 'Description 1',
        board: 'board-1',
        owner: 'user-1',
        members: [],
        orderInBoard: 0,
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useWorkspaceStore.setState({
        projects: [mockProject],
      });

      mockApi.task.getTasks.mockResolvedValue(mockTasks);

      const store = useWorkspaceStore.getState();
      const tasks = await store.fetchTasksByProject('project-1');

      expect(tasks).toHaveLength(1);
      expect(tasks[0]._id).toBe('task-1');

      const state = useWorkspaceStore.getState();
      expect(state.projects[0].tasks).toStrictEqual(mockTasks);
    });

    it('should return empty array when fetching tasks fails', async () => {
      mockApi.task.getTasks.mockRejectedValue(new Error('Failed to fetch'));

      const store = useWorkspaceStore.getState();
      const tasks = await store.fetchTasksByProject('project-1');

      expect(tasks).toStrictEqual([]);
    });

    it('should return empty array when projectId is empty', async () => {
      const store = useWorkspaceStore.getState();
      const tasks = await store.fetchTasksByProject('');

      expect(tasks).toStrictEqual([]);
    });

    it('should return empty array when getTasks does not return an array', async () => {
      mockApi.task.getTasks.mockResolvedValue(null as any);

      const store = useWorkspaceStore.getState();
      const tasks = await store.fetchTasksByProject('project-1');

      expect(tasks).toStrictEqual([]);
    });

    it('should add a new task', async () => {
      const mockTask: Task = {
        _id: 'task-new',
        title: 'New Task',
        description: 'New Description',
        status: TaskStatus.TODO,
        project: 'project-1',
        board: 'board-1',
        creator: mockUserInfo,
        lastModifier: mockUserInfo,
        orderInProject: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockProject: Project = {
        _id: 'project-1',
        title: 'Project 1',
        description: 'Description 1',
        board: 'board-1',
        owner: 'user-1',
        members: [],
        orderInBoard: 0,
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useWorkspaceStore.setState({
        userId: 'user-1',
        currentBoardId: 'board-1',
        projects: [mockProject],
      });

      const createTaskMock = vi.fn<(task: CreateTaskInput) => Promise<Task>>().mockResolvedValue(mockTask);
      mockApi.project.getProjects.mockResolvedValue([{ ...mockProject, tasks: [mockTask] }]);

      const store = useWorkspaceStore.getState();
      await store.addTask('project-1', 'New Task', TaskStatus.TODO, createTaskMock, 'New Description');

      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Task',
          description: 'New Description',
          status: TaskStatus.TODO,
          project: 'project-1',
          board: 'board-1',
        }),
      );
    });

    it('should throw error when adding task without user authenticated', async () => {
      useWorkspaceStore.setState({
        userId: null,
        currentBoardId: 'board-1',
      });

      const createTaskMock = vi.fn<(task: CreateTaskInput) => Promise<Task>>();
      const store = useWorkspaceStore.getState();

      await expect(store.addTask('project-1', 'New Task', TaskStatus.TODO, createTaskMock)).rejects.toMatchObject({
        message: expect.stringContaining('User not authenticated or no board selected'),
      });
    });

    it('should throw error when adding task without board selected', async () => {
      useWorkspaceStore.setState({
        userId: 'user-1',
        currentBoardId: null,
      });

      const createTaskMock = vi.fn<(task: CreateTaskInput) => Promise<Task>>();
      const store = useWorkspaceStore.getState();

      await expect(store.addTask('project-1', 'New Task', TaskStatus.TODO, createTaskMock)).rejects.toMatchObject({
        message: expect.stringContaining('User not authenticated or no board selected'),
      });
    });

    it('should update a task', async () => {
      const mockProject: Project = {
        _id: 'project-1',
        title: 'Project 1',
        description: 'Description 1',
        board: 'board-1',
        owner: 'user-1',
        members: [],
        orderInBoard: 0,
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useWorkspaceStore.setState({
        userId: 'user-1',
        currentBoardId: 'board-1',
        projects: [mockProject],
      });

      mockApi.task.updateTask.mockResolvedValue(undefined as any);
      mockApi.project.getProjects.mockResolvedValue([mockProject]);

      const store = useWorkspaceStore.getState();
      await store.updateTask('task-1', 'Updated Title', TaskStatus.IN_PROGRESS, 'Updated Description');

      expect(mockApi.task.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          title: 'Updated Title',
          status: TaskStatus.IN_PROGRESS,
          description: 'Updated Description',
          lastModifier: 'user-1',
        }),
      );
    });

    it('should throw error when updating task without user authenticated', async () => {
      useWorkspaceStore.setState({
        userId: null,
        currentBoardId: 'board-1',
      });

      const store = useWorkspaceStore.getState();

      await expect(store.updateTask('task-1', 'Title', TaskStatus.TODO)).rejects.toMatchObject({
        message: expect.stringContaining('User not authenticated'),
      });
    });

    it('should remove a task', async () => {
      const mockTask: Task = {
        _id: 'task-1',
        title: 'Task 1',
        description: 'Description 1',
        status: TaskStatus.TODO,
        project: 'project-1',
        board: 'board-1',
        creator: mockUserInfo,
        lastModifier: mockUserInfo,
        orderInProject: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockProject: Project = {
        _id: 'project-1',
        title: 'Project 1',
        description: 'Description 1',
        board: 'board-1',
        owner: 'user-1',
        members: [],
        orderInBoard: 0,
        tasks: [mockTask],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useWorkspaceStore.setState({
        currentBoardId: 'board-1',
        projects: [mockProject],
      });

      mockApi.task.deleteTask.mockResolvedValue();
      mockApi.project.getProjects.mockResolvedValue([{ ...mockProject, tasks: [] }]);

      const store = useWorkspaceStore.getState();
      await store.removeTask('task-1');

      expect(mockApi.task.deleteTask).toHaveBeenCalledWith('task-1');
      const state = useWorkspaceStore.getState();
      expect(state.projects[0].tasks).toHaveLength(0);
    });

    it('should drag task to another project', async () => {
      const mockTask: Task = {
        _id: 'task-1',
        title: 'Task 1',
        description: 'Description 1',
        status: TaskStatus.TODO,
        project: 'project-1',
        board: 'board-1',
        creator: mockUserInfo,
        lastModifier: mockUserInfo,
        orderInProject: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      useWorkspaceStore.setState({
        userId: 'user-1',
        currentBoardId: 'board-1',
        projects: [],
      });

      const getTaskMock = vi.fn<(taskId: string) => Promise<Task | undefined>>().mockResolvedValue(mockTask);
      mockApi.task.updateTask.mockResolvedValue(undefined as any);
      mockApi.project.getProjects.mockResolvedValue([]);

      const store = useWorkspaceStore.getState();
      await store.dragTaskOnProject('task-1', 'project-2', getTaskMock);

      expect(getTaskMock).toHaveBeenCalledWith('task-1');
      expect(mockApi.task.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          projectId: 'project-2',
        }),
      );
    });

    it('should throw error when dragging task that does not exist', async () => {
      useWorkspaceStore.setState({
        currentBoardId: 'board-1',
      });

      const getTaskMock = vi.fn<(taskId: string) => Promise<Task | undefined>>();
      const store = useWorkspaceStore.getState();

      await expect(store.dragTaskOnProject('task-1', 'project-2', getTaskMock)).rejects.toMatchObject({
        message: expect.stringContaining('Task not found'),
      });
    });
  });
});
