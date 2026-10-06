import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { UserService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

const fromCookie = (req: Request): string | null => {
  // SAFETY: cookie-parser populates req.cookies with a string-valued map; typings expose it as any.
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const token = cookies?.jwt;
  return token !== undefined && token !== '' ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly userService: UserService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? '',
    });
  }

  async validate(payload: JwtPayload) {
    try {
      const user = await this.userService.findByEmail(payload.email);

      if (user == null) {
        this.logger.error(`User not found for ID: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      return {
        _id: user._id.toString(),
        email: user.email,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof Error) {
        this.logger.error(`Error validating JWT: ${error.message}`, error.stack);
      } else {
        this.logger.error('Unknown error validating JWT', error);
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
