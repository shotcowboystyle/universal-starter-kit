import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import type { BoardService } from './boards.service';
import type { CreateBoardDto } from './dto/create-boards.dto';
import type { UpdateBoardDto } from './dto/update-boards.dto';
import { Board } from './schemas/boards.schema';

const UNAUTHORIZED_DESCRIPTION = 'Unauthorized.';
const BOARD_NOT_FOUND_DESCRIPTION = 'Board not found.';
const FORBIDDEN_DESCRIPTION = 'Forbidden.';

@ApiTags('boards')
@ApiBearerAuth()
@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new board' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The board has been successfully created.',
    type: Board,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  async create(@Body() createBoardDto: CreateBoardDto, @CurrentUser() user: { _id: string; email: string }) {
    createBoardDto.owner = user._id;
    return await this.boardService.create(createBoardDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all boards for the authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Return all boards for the user, separated into owned and team boards.',
    schema: {
      type: 'object',
      properties: {
        myBoards: { type: 'array', items: { $ref: getSchemaPath(Board) } },
        teamBoards: { type: 'array', items: { $ref: getSchemaPath(Board) } },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  async findAll(@CurrentUser() user: { _id: string }) {
    return await this.boardService.findAll(user._id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a board by ID' })
  @ApiParam({ name: 'id', description: 'Board ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Return the board with the specified ID.',
    type: Board,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: BOARD_NOT_FOUND_DESCRIPTION,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async findOne(@Param('id') id: string, @CurrentUser() user: { _id: string }) {
    return await this.boardService.findOne(id, user._id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a board' })
  @ApiParam({ name: 'id', description: 'Board ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The board has been successfully updated.',
    type: Board,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: BOARD_NOT_FOUND_DESCRIPTION,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async update(@Param('id') id: string, @Body() updateBoardDto: UpdateBoardDto, @CurrentUser() user: { _id: string }) {
    return await this.boardService.update(id, updateBoardDto, user._id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a board' })
  @ApiParam({ name: 'id', description: 'Board ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'The board has been successfully deleted.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: BOARD_NOT_FOUND_DESCRIPTION,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async remove(@Param('id') id: string, @CurrentUser() user: { _id: string }) {
    return await this.boardService.remove(id, user._id);
  }

  @Post(':id/members/:memberId')
  @ApiOperation({ summary: 'Add a member to a board' })
  @ApiParam({ name: 'id', description: 'Board ID' })
  @ApiParam({ name: 'memberId', description: 'User ID of the member to add' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The member has been successfully added to the board.',
    type: Board,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: BOARD_NOT_FOUND_DESCRIPTION,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async addMember(@Param('id') id: string, @Param('memberId') memberId: string, @CurrentUser() user: { _id: string }) {
    return await this.boardService.addMember(id, user._id, memberId);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from a board' })
  @ApiParam({ name: 'id', description: 'Board ID' })
  @ApiParam({
    name: 'memberId',
    description: 'User ID of the member to remove',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The member has been successfully removed from the board.',
    type: Board,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: BOARD_NOT_FOUND_DESCRIPTION,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: UNAUTHORIZED_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: { _id: string },
  ) {
    return await this.boardService.removeMember(id, user._id, memberId);
  }
}
