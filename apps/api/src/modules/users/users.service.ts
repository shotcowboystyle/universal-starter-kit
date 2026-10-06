import { Injectable, Logger } from '@nestjs/common';

import type { UserRepository } from './repositories/users.repository';
import type { User } from './schemas/users.schema';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userRepository: UserRepository) {}

  async findByEmail(email: string): Promise<User | null> {
    if (!email) {
      return null;
    }
    return await this.userRepository.findByEmail(email);
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.findAll();
  }

  async searchByName(name: string): Promise<User[]> {
    return await this.userRepository.searchByName(name);
  }
}
