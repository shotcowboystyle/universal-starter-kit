import type { OnModuleInit } from '@nestjs/common';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from 'eventemitter2';
import { Types } from 'mongoose';

import type { BoardDeletedEvent } from '../../common/events/board-deleted.event';
import { ProjectDeletedEvent } from '../../common/events/project-deleted.event';
import type { BoardService } from '../boards/boards.service';

import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectRepository } from './repositories/projects.repository';
import type { Project, ProjectDocument } from './schemas/projects.schema';

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly boardService: BoardService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on('board.deleted', (event: BoardDeletedEvent) => {
      void this.handleBoardDeleted(event);
    });
  }

  // Cascade step: triggered by 'board.deleted' event.
  // Finds all projects belonging to the deleted board and emits 'project.deleted' for each,
  // which TasksService then listens to for final cleanup.
  async handleBoardDeleted(event: BoardDeletedEvent): Promise<void> {
    const projects = await this.projectRepository.findByBoardId(event.boardId);

    // Emit project.deleted for each project so TasksService can clean up
    for (const project of projects) {
      this.eventEmitter.emit('project.deleted', new ProjectDeletedEvent(project._id.toString()));
    }

    await this.projectRepository.deleteByBoardId(event.boardId);
  }

  async findByBoardId(boardId: string): Promise<ProjectDocument[]> {
    if (!Types.ObjectId.isValid(boardId)) {
      throw new NotFoundException('Invalid board ID');
    }

    return await this.projectRepository.findByBoardId(boardId);
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, userId: string): Promise<ProjectDocument> {
    ProjectsService.validateIds(id, userId);

    const project = await this.findProjectById(id);
    await this.checkUpdatePermissions(project, userId, updateProjectDto);
    const updateData = ProjectsService.prepareUpdateData(updateProjectDto);

    const updatedProject = await this.projectRepository.updateById(id, updateData);
    if (!updatedProject) {
      throw new NotFoundException('Project not found after update');
    }
    return updatedProject;
  }

  async remove(id: string, userId: string): Promise<{ message: string }> {
    ProjectsService.validateIds(id, userId);

    const project = await this.findProjectById(id);

    if (project.owner.toString() !== userId) {
      throw new BadRequestException('You do not have permission to delete this project');
    }

    const { board: boardId, orderInBoard: deletedOrder } = project;

    // Emit event for cascade task deletion
    this.eventEmitter.emit('project.deleted', new ProjectDeletedEvent(id));

    const result = await this.projectRepository.deleteById(id);

    if (result.deletedCount === 0) {
      throw new NotFoundException('Failed to delete project');
    }

    // Reorder remaining projects in the same board
    if (deletedOrder !== undefined) {
      await this.projectRepository.decrementOrderAfter(boardId, deletedOrder);
    }

    return { message: 'Project deleted successfully' };
  }

  async addMemberIfNotExists(projectId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(projectId) || !Types.ObjectId.isValid(userId)) {
      return;
    }

    const userIdObj = new Types.ObjectId(userId);
    const isMember = await this.projectRepository.isMember(projectId, userIdObj);

    if (!isMember) {
      await this.projectRepository.addMember(projectId, userIdObj);
    }
  }

  async create(createProjectDto: CreateProjectDto & { owner: string }): Promise<ProjectDocument> {
    const { title, description, boardId, owner } = createProjectDto;

    if (!Types.ObjectId.isValid(boardId)) {
      throw new BadRequestException(`Invalid board ID: ${boardId}`);
    }

    if (!Types.ObjectId.isValid(owner)) {
      throw new BadRequestException(`Invalid owner ID: ${owner}`);
    }

    const order = createProjectDto.orderInBoard ?? (await this.projectRepository.getLastOrderInBoard(boardId));

    const projectData: Partial<Project> = {
      title,
      description: description === undefined || description === '' ? null : description,
      owner: new Types.ObjectId(owner),
      board: new Types.ObjectId(boardId),
      members: [new Types.ObjectId(owner)],
      orderInBoard: order,
    };

    const savedProject = await this.projectRepository.create(projectData);

    const populatedProject = await this.projectRepository.findByIdPopulated(savedProject._id.toString());

    if (!populatedProject) {
      throw new NotFoundException('Project not found after creation');
    }

    return populatedProject;
  }

  // --- Private helpers ---

  private static validateIds(id: string, userId: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid project ID');
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
  }

  private async findProjectById(id: string): Promise<ProjectDocument> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async checkUpdatePermissions(
    project: ProjectDocument,
    userId: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<void> {
    const isOwner = project.owner.toString() === userId;
    const isOrderOnly = ProjectsService.isOrderOnlyUpdate(updateProjectDto);

    if (!isOwner) {
      if (isOrderOnly) {
        await this.verifyBoardMembership(project, userId);
      } else {
        throw new BadRequestException('You do not have permission to update this project');
      }
    }
  }

  private static isOrderOnlyUpdate(updateProjectDto: UpdateProjectDto): boolean {
    const { orderInBoard, title, description, status, dueDate, assigneeId } = updateProjectDto;
    return (
      orderInBoard !== undefined &&
      [title, description, status, dueDate, assigneeId].every((value) => value === undefined)
    );
  }

  private async verifyBoardMembership(project: ProjectDocument, userId: string): Promise<void> {
    const boardId = project.board.toString();
    const board = await this.boardService.findOne(boardId, userId);
    if (!board) {
      throw new BadRequestException('You do not have permission to reorder projects in this board');
    }
  }

  private static prepareUpdateData(updateProjectDto: UpdateProjectDto): Partial<Project> {
    const updateData: Partial<Project> = {};

    if (updateProjectDto.title !== undefined) {
      updateData.title = updateProjectDto.title;
    }
    if (updateProjectDto.description !== undefined) {
      updateData.description = updateProjectDto.description;
    }
    if (updateProjectDto.status != null) {
      updateData.status = updateProjectDto.status;
    }
    if (updateProjectDto.dueDate != null && updateProjectDto.dueDate !== '') {
      updateData.dueDate = new Date(updateProjectDto.dueDate);
    }
    if (updateProjectDto.orderInBoard !== undefined) {
      updateData.orderInBoard = updateProjectDto.orderInBoard;
    }
    if (updateProjectDto.assigneeId !== undefined) {
      const { assigneeId } = updateProjectDto;
      updateData.assignee = assigneeId != null && assigneeId !== '' ? new Types.ObjectId(assigneeId) : null;
    }

    return updateData;
  }
}
