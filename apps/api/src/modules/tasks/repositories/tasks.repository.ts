import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

import type { TaskDocument } from '../schemas/tasks.schema';
import { Task } from '../schemas/tasks.schema';

const USER_FIELDS = 'name email';

export interface TaskQuery {
  project?: Types.ObjectId;
  assignee?: Types.ObjectId;
}

export interface TaskUpdate extends Partial<Omit<Task, 'assignee'>> {
  assignee?: Types.ObjectId | null;
}

const DEFAULT_TASK_SORT = { orderInProject: 1 } satisfies Record<string, 1 | -1>;

@Injectable()
export class TaskRepository {
  constructor(@InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>) {}

  async create(data: Partial<Task>): Promise<TaskDocument> {
    const task = new this.taskModel(data);
    return await task.save();
  }

  async findByQuery(query: TaskQuery, sort: Record<string, 1 | -1> = DEFAULT_TASK_SORT): Promise<TaskDocument[]> {
    // oxlint-disable-next-line unicorn/no-array-sort -- Mongoose Query#sort, not Array#sort
    return await this.taskModel.find(query).sort(sort).populate('lastModifier', USER_FIELDS).exec();
  }

  async findById(id: string): Promise<TaskDocument | null> {
    return await this.taskModel.findById(id);
  }

  async findByIdPopulated(id: string): Promise<TaskDocument | null> {
    return await this.taskModel
      .findById(id)
      .populate('creator', USER_FIELDS)
      .populate('assignee', USER_FIELDS)
      .populate('lastModifier', USER_FIELDS)
      .exec();
  }

  async updateById(id: string, updateData: TaskUpdate): Promise<TaskDocument | null> {
    return await this.taskModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('lastModifier', USER_FIELDS)
      .exec();
  }

  async deleteById(id: string): Promise<{ deletedCount: number }> {
    const result = await this.taskModel.deleteOne({ _id: new Types.ObjectId(id) }).exec();
    return { deletedCount: result.deletedCount };
  }

  async deleteByProjectId(projectId: string): Promise<{ deletedCount: number }> {
    const result = await this.taskModel.deleteMany({ project: new Types.ObjectId(projectId) }).exec();
    return { deletedCount: result.deletedCount || 0 };
  }

  async decrementOrderAfter(projectId: Types.ObjectId, deletedOrder: number): Promise<void> {
    await this.taskModel
      .updateMany({ project: projectId, orderInProject: { $gt: deletedOrder } }, { $inc: { orderInProject: -1 } })
      .exec();
  }

  async reorderOnMoveWithinProject(
    projectId: Types.ObjectId,
    taskId: string,
    oldOrder: number,
    newOrder: number,
  ): Promise<void> {
    const isMovingDown = newOrder > oldOrder;
    await this.taskModel.updateMany(
      {
        project: projectId,
        orderInProject: isMovingDown ? { $gt: oldOrder, $lte: newOrder } : { $gte: newOrder, $lt: oldOrder },
        _id: { $ne: taskId },
      },
      { $inc: { orderInProject: isMovingDown ? -1 : 1 } },
    );
  }

  async incrementOrderFrom(projectId: Types.ObjectId, fromOrder: number, excludeTaskId: string): Promise<void> {
    await this.taskModel.updateMany(
      {
        project: projectId,
        orderInProject: { $gte: fromOrder },
        _id: { $ne: excludeTaskId },
      },
      { $inc: { orderInProject: 1 } },
    );
  }

  async save(task: TaskDocument): Promise<TaskDocument> {
    return await task.save();
  }
}
