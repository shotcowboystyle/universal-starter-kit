import { Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-custom';

import type { UserDocument } from '../../users/schemas/users.schema';
import type { AuthService } from '../auth.service';

@Injectable()
export class EmailStrategy extends PassportStrategy(Strategy, 'email') {
  private readonly logger = new Logger(EmailStrategy.name);

  constructor(private readonly authService: AuthService) {
    super();
  }

  async validate(req: Request<unknown, unknown, { email?: string }>): Promise<UserDocument> {
    try {
      const { email } = req.body;

      if (email === undefined || email === '') {
        throw new UnauthorizedException('The login email is incorrect, please correct it');
      }

      const user = await this.authService.validateUser(email);

      if (!user) {
        throw new UnauthorizedException('The login email is incorrect, please correct it');
      }

      return user;
    } catch (error: unknown) {
      // Re-throw UnauthorizedException as-is (業務邏輯錯誤)
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Log and wrap unexpected errors (系統錯誤)
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error during validation: ${message}`, error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('An error occurred during authentication');
    }
  }
}
