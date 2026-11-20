import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Types } from 'mongoose';

import type { UserDocument } from '../users/schemas/users.schema';
import type { UserService } from '../users/users.service';

export interface LoginUser {
  _id: string | Types.ObjectId;
  email: string;
  name?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string): Promise<UserDocument | null> {
    if (!email) {
      return null;
    }

    try {
      return await this.userService.findByEmail(email);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error validating user: ${errorMessage}`);
      throw new InternalServerErrorException('Authentication failed. Please try again.');
    }
  }

  login(user: LoginUser) {
    const payload = { email: user.email, sub: user._id };
    const accessToken = this.jwtService.sign(payload);

    return { access_token: accessToken, user };
  }
}
