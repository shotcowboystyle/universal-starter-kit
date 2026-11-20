import type { CreateTaskInput, Project, Task, TaskStatus, UpdateTaskInput } from '@repo/store';
import type { StateCreator } from 'zustand';

import { taskApi } from '@/lib/api/task-api';

import type { BoardSliceState, ProjectSliceState, TaskSliceState, UserSliceState } from './types';

const hasValue = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== '';

const withoutTask = (projects: Project[], taskId: string): Project[] =>
  projects.map((project) => ({
    ...project,
    tasks: project.tasks?.filter((task) => task._id !== taskId) ?? [],
  }));

export const createTaskSlice: StateCreator<
  TaskSliceState & UserSliceState & BoardSliceState & ProjectSliceState,
  [],
  [],
  TaskSliceState
> = (set, get) => ({
  addTask: async (
    projectId: string,
    title: string,
    status: TaskStatus,
    createTask: (task: CreateTaskInput) => Promise<Task>,
    description?: string,
    dueDate?: Date,
    assigneeId?: string,
    _orderInProject?: number,
  ) => {
    try {
      const { userId, currentBoardId, projects, fetchProjects } = get();
      if (!hasValue(userId) || !hasValue(currentBoardId)) {
        throw new Error('User not authenticated or no board selected');
      }

      const currentProject = projects.find((p) => p._id === projectId);
      const currentTasks = currentProject?.tasks ?? [];
      const calculatedOrderInProject = _orderInProject ?? currentTasks.length;

      const taskInput: CreateTaskInput = {
        title,
        description,
        status,
        project: projectId,
        board: currentBoardId,
        orderInProject: calculatedOrderInProject,
        ...(dueDate !== undefined && { dueDate }),
        ...(hasValue(assigneeId) && { assignee: assigneeId }),
      };

      await createTask(taskInput);

      await fetchProjects(currentBoardId);
    } catch (error) {
      console.error('Error adding task:', error);
      throw error;
    }
  },

  updateTask: async (
    taskId: string,
    title: string,
    status: TaskStatus,
    description?: string,
    dueDate?: Date,
    assigneeId?: string,
    newProjectId?: string,
    orderInProject?: number,
  ) => {
    try {
      const { userId, currentBoardId, fetchProjects } = get();
      if (!hasValue(userId)) {
        throw new Error('User not authenticated');
      }

      const updateData: UpdateTaskInput = {
        title,
        status,
        lastModifier: userId,
        ...(description !== undefined && { description }),
        ...(dueDate !== undefined && { dueDate }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(orderInProject !== undefined && { orderInProject }),
        ...(hasValue(newProjectId) && { projectId: newProjectId }),
      };

      await taskApi.updateTask(taskId, updateData);

      if (hasValue(currentBoardId)) {
        await fetchProjects(currentBoardId);
      }
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  },

  removeTask: async (taskId: string) => {
    try {
      const { currentBoardId, fetchProjects } = get();

      set((state) => ({ projects: withoutTask(state.projects, taskId) }));

      await taskApi.deleteTask(taskId);

      if (hasValue(currentBoardId)) {
        await fetchProjects(currentBoardId);
      }
    } catch (error) {
      console.error('Error in removeTask:', error);
      throw error;
    }
  },

  dragTaskOnProject: async (
    taskId: string,
    newProjectId: string,
    getTask: (taskId: string) => Promise<Task | undefined>,
  ) => {
    try {
      const { currentBoardId, fetchProjects, updateTask } = get();

      const taskToMove = await getTask(taskId);

      if (!taskToMove) {
        throw new Error('Task not found');
      }

      await updateTask(
        taskId,
        taskToMove.title,
        taskToMove.status,
        hasValue(taskToMove.description) ? taskToMove.description : undefined,
        taskToMove.dueDate == null ? undefined : new Date(taskToMove.dueDate),
        hasValue(taskToMove.assignee?._id) ? taskToMove.assignee._id : undefined,
        newProjectId,
      );

      if (hasValue(currentBoardId)) {
        await fetchProjects(currentBoardId);
      }
    } catch (error) {
      console.error('Error moving task to project:', error);
      throw error;
    }
  },
});
