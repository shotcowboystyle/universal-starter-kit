import type { OnModuleInit } from '@nestjs/common';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from 'eventemitter2';
import { Types } from 'mongoose';

import type { ProjectDeletedEvent } from '../../common/events/project-deleted.event';
import type { ProjectsService } from '../projects/projects.service';

import type { CreateTaskDto } from './dto/create-task.dto';
import type { TaskResponseDto } from './dto/task-response.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import type { TaskQuery, TaskRepository, TaskUpdate } from './repositories/tasks.repository';
import type { Task, TaskDocument } from './schemas/tasks.schema';
import { TaskStatus } from './schemas/tasks.schema';

const USER_FIELDS = 'name email';

interface PopulatedUserRef {
  _id: Types.ObjectId | string;
  name?: string | null;
  email?: string | null;
}

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly projectsService: ProjectsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on('project.deleted', (event: ProjectDeletedEvent) => {
      void this.handleProjectDeleted(event);
    });
  }

  async handleProjectDeleted(event: ProjectDeletedEvent): Promise<void> {
    await this.taskRepository.deleteByProjectId(event.projectId);
  }

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required to create a task');
    }

    const creatorId = new Types.ObjectId(userId);
    const projectId = new Types.ObjectId(createTaskDto.project);

    // Add creator to project members if not already a member
    if (createTaskDto.project) {
      try {
        await this.projectsService.addMemberIfNotExists(createTaskDto.project, userId);
      } catch (error) {
        this.logger.error('Error adding creator to project members:', error);
      }
    }

    const orderInProject = createTaskDto.orderInProject ?? 0;

    const { title, description, dueDate, assignee } = createTaskDto;
    const taskData: Partial<Task> = {
      title,
      description,
      dueDate,
      project: projectId,
      board: new Types.ObjectId(createTaskDto.board),
      creator: creatorId,
      lastModifier: creatorId,
      status: createTaskDto.status ?? TaskStatus.TODO,
      orderInProject,
      ...(assignee !== undefined &&
        assignee !== '' && {
          assignee: new Types.ObjectId(assignee),
        }),
    };

    const savedTask = await this.taskRepository.create(taskData);
    return await this.toTaskResponse(savedTask);
  }

  async findAll(projectId?: string, assigneeId?: string): Promise<TaskResponseDto[]> {
    const query: TaskQuery = {};

    if (projectId !== undefined && projectId !== '') {
      query.project = new Types.ObjectId(projectId);
    }
    if (assigneeId !== undefined && assigneeId !== '') {
      query.assignee = new Types.ObjectId(assigneeId);
    }

    const tasks = await this.taskRepository.findByQuery(query);
    return await Promise.all(tasks.map(async (task) => await this.toTaskResponse(task)));
  }

  async findOne(id: string): Promise<TaskResponseDto> {
    const task = await this.taskRepository.findByIdPopulated(id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return await this.toTaskResponse(task);
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string): Promise<TaskResponseDto> {
    await this.checkTaskPermission(id, userId);

    const { title, description, status, dueDate, orderInProject, assigneeId } = updateTaskDto;
    const updateData: TaskUpdate = {
      lastModifier: new Types.ObjectId(userId),
      updatedAt: new Date(),
    };

    // Only defined values are written
    if (title !== undefined) {
      updateData.title = title;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate;
    }
    if (orderInProject !== undefined) {
      updateData.orderInProject = orderInProject;
    }

    // Handle assigneeId → assignee conversion
    if (assigneeId !== undefined) {
      updateData.assignee = assigneeId !== null && assigneeId !== '' ? new Types.ObjectId(assigneeId) : null;
    }

    const updatedTask = await this.taskRepository.updateById(id, updateData);

    if (!updatedTask) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return await this.toTaskResponse(updatedTask);
  }

  async remove(id: string, userId: string): Promise<void> {
    const taskToDelete = await this.checkTaskPermission(id, userId, true);
    const { project: projectId, orderInProject: deletedOrder } = taskToDelete;

    const result = await this.taskRepository.deleteById(id);

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    await this.taskRepository.decrementOrderAfter(projectId, deletedOrder);
  }

  async moveTask(
    taskId: string,
    newProjectId: string,
    newOrderInProject: number,
    userId: string,
  ): Promise<TaskResponseDto> {
    await this.checkTaskPermission(taskId, userId);

    if (!Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException('Invalid task ID');
    }
    if (!Types.ObjectId.isValid(newProjectId)) {
      throw new BadRequestException('Invalid project ID');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID "${taskId}" not found`);
    }

    const oldProjectId = task.project.toString();
    const oldOrderInProject = task.orderInProject ?? 0;

    // Update the task
    task.project = new Types.ObjectId(newProjectId);
    task.orderInProject = newOrderInProject;
    task.lastModifier = new Types.ObjectId(userId);
    task.updatedAt = new Date();
    await this.taskRepository.save(task);

    if (oldProjectId === newProjectId) {
      // Same project: reorder within
      if (oldOrderInProject !== newOrderInProject) {
        await this.taskRepository.reorderOnMoveWithinProject(
          new Types.ObjectId(newProjectId),
          taskId,
          oldOrderInProject,
          newOrderInProject,
        );
      }
    } else {
      // Different project: adjust both
      await this.taskRepository.decrementOrderAfter(new Types.ObjectId(oldProjectId), oldOrderInProject);
      await this.taskRepository.incrementOrderFrom(new Types.ObjectId(newProjectId), newOrderInProject, taskId);
    }

    const updatedTask = await this.taskRepository.findByIdPopulated(taskId);
    if (!updatedTask) {
      throw new NotFoundException('Task not found after update');
    }

    return await this.toTaskResponse(updatedTask);
  }

  // --- Private helpers ---

  private async checkTaskPermission(taskId: string, userId: string, requireCreator = false): Promise<TaskDocument> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const creatorIdString = task.creator?.toString();
    const assigneeIdString = task.assignee?.toString();

    const isCreator = creatorIdString === userId;
    const isAssignee = assigneeIdString === userId;

    if (requireCreator && !isCreator) {
      throw new ForbiddenException('Only the task creator can perform this action');
    }

    if (!isCreator && !isAssignee) {
      throw new ForbiddenException('You do not have permission to modify this task');
    }

    return task;
  }

  private toUserResponse(user?: PopulatedUserRef | null): UserResponseDto | null {
    if (user == null) {
      return null;
    }
    return {
      _id: user._id?.toString() || '',
      name: user.name ?? null,
      email: user.email ?? undefined,
    };
  }

  private async toTaskResponse(task: TaskDocument): Promise<TaskResponseDto> {
    let populatedTask = task;
    if ('populate' in task) {
      populatedTask = await task.populate([
        { path: 'creator', select: USER_FIELDS },
        { path: 'assignee', select: USER_FIELDS },
        { path: 'lastModifier', select: USER_FIELDS },
      ]);
    }

    const { description, dueDate } = populatedTask;

    return {
      _id: populatedTask._id.toString(),
      title: populatedTask.title,
      status: populatedTask.status,
      board: populatedTask.board?.toString(),
      project: populatedTask.project?.toString(),
      createdAt: populatedTask.createdAt,
      updatedAt: populatedTask.updatedAt,
      orderInProject: populatedTask.orderInProject ?? 0,
      creator: this.toUserResponse(populatedTask.creator),
      assignee: this.toUserResponse(populatedTask.assignee),
      lastModifier: this.toUserResponse(populatedTask.lastModifier ?? populatedTask.creator),
      ...(description != null && description !== '' && { description }),
      ...(dueDate != null && { dueDate }),
    };
  }
}
