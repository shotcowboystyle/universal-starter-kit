import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import type { CreateTaskDto } from './dto/create-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { TasksService } from './tasks.service';

const UNAUTHORIZED_DESCRIPTION = 'Unauthorized';
const BAD_REQUEST_DESCRIPTION = 'Bad request';
const TASK_NOT_FOUND_DESCRIPTION = 'Task not found';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 400, description: BAD_REQUEST_DESCRIPTION })
  @ApiResponse({ status: 401, description: UNAUTHORIZED_DESCRIPTION })
  async create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: { _id: string }): Promise<TaskResponseDto> {
    return await this.tasksService.create(createTaskDto, user._id);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all tasks (optionally filtered by project or assignee)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of tasks',
    type: [TaskResponseDto],
  })
  @ApiResponse({ status: 401, description: UNAUTHORIZED_DESCRIPTION })
  async findAll(
    @Query('projectId') projectId?: string,
    @Query('assigneeId') assigneeId?: string,
  ): Promise<TaskResponseDto[]> {
    return await this.tasksService.findAll(projectId, assigneeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  @ApiResponse({
    status: 200,
    description: 'Task found',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 404, description: TASK_NOT_FOUND_DESCRIPTION })
  @ApiResponse({ status: 401, description: UNAUTHORIZED_DESCRIPTION })
  async findOne(@Param('id', ParseObjectIdPipe) id: string): Promise<TaskResponseDto> {
    return await this.tasksService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({
    status: 200,
    description: 'Task updated',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 404, description: TASK_NOT_FOUND_DESCRIPTION })
  @ApiResponse({ status: 400, description: BAD_REQUEST_DESCRIPTION })
  @ApiResponse({ status: 401, description: UNAUTHORIZED_DESCRIPTION })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @CurrentUser() user: { _id: string },
  ): Promise<TaskResponseDto> {
    return await this.tasksService.update(id, updateTaskDto, user._id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: TASK_NOT_FOUND_DESCRIPTION })
  @ApiResponse({ status: 401, description: UNAUTHORIZED_DESCRIPTION })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only the task creator can delete the task',
  })
  async remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: { _id: string }): Promise<void> {
    await this.tasksService.remove(id, user._id);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move task to a different project' })
  @ApiResponse({
    status: 200,
    description: 'Task moved successfully',
    type: TaskResponseDto,
  })
  @ApiResponse({ status: 404, description: TASK_NOT_FOUND_DESCRIPTION })
  @ApiResponse({ status: 400, description: BAD_REQUEST_DESCRIPTION })
  @ApiResponse({ status: 401, description: UNAUTHORIZED_DESCRIPTION })
  async moveTask(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() moveData: { projectId: string; orderInProject: number },
    @CurrentUser() user: { _id: string },
  ): Promise<TaskResponseDto> {
    return await this.tasksService.moveTask(id, moveData.projectId, moveData.orderInProject, user._id);
  }
}
