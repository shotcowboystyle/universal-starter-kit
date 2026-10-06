import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import type { UserDocument } from '../schemas/users.schema';
import { User } from '../schemas/users.schema';

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async findByEmail(email: string): Promise<User | null> {
    return await this.userModel.findOne({ email }).exec();
  }

  async findAll(): Promise<User[]> {
    return await this.userModel.find().exec();
  }

  async searchByName(name: string): Promise<User[]> {
    const query = name ? { name: { $regex: name, $options: 'i' } } : {};
    return await this.userModel.find(query).exec();
  }
}
