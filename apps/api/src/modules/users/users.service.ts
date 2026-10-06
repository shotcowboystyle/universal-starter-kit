import { Injectable, Logger } from '@nestjs/common';

import type { UserRepository } from './repositories/users.repository';
import type { UserDocument } from './schemas/users.schema';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userRepository: UserRepository) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    if (!email) {
      return null;
    }
    return await this.userRepository.findByEmail(email);
  }

  async findAll(): Promise<UserDocument[]> {
    return await this.userRepository.findAll();
  }

  async searchByName(name: string): Promise<UserDocument[]> {
    return await this.userRepository.searchByName(name);
  }
}
