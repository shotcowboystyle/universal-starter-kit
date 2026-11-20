import type { Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service';
import type { UserDocument } from '../../src/modules/users/schemas/users.schema';
import type { UserService } from '../../src/modules/users/users.service';

const createUserService = () => ({
  findByEmail: vi.fn<UserService['findByEmail']>(),
});

const createJwtService = () => ({
  sign: vi.fn<JwtService['sign']>(),
});

const createLogger = () => ({
  log: vi.fn<Logger['log']>(),
  error: vi.fn<Logger['error']>(),
  warn: vi.fn<Logger['warn']>(),
  debug: vi.fn<Logger['debug']>(),
});

describe(AuthService, () => {
  let service: AuthService;
  let userService: ReturnType<typeof createUserService>;
  let jwtService: ReturnType<typeof createJwtService>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    userService = createUserService();
    jwtService = createJwtService();
    logger = createLogger();

    // Manually instantiate AuthService with the mocks
    service = new AuthService(userService as any, jwtService as any);
    // Manually inject logger
    (service as any).logger = logger;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user if found', async () => {
      const user = { email: 'test@test.com' } as UserDocument;
      userService.findByEmail.mockResolvedValue(user);

      await expect(service.validateUser('test@test.com')).resolves.toStrictEqual(user);
    });

    it('should return null if user not found', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('test@test.com')).resolves.toBeNull();
    });

    it('should return null if email is empty', async () => {
      await expect(service.validateUser('')).resolves.toBeNull();
    });

    it('should throw error if validation fails', async () => {
      userService.findByEmail.mockRejectedValue(new Error('Database error'));

      let thrownError: Error | null = null;
      try {
        await service.validateUser('test@test.com');
      } catch (error) {
        thrownError = error as Error;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toBe('Authentication failed. Please try again.');
      expect(logger.error).toHaveBeenCalledWith('Error validating user: Database error');
    });
  });

  describe('login', () => {
    it('should return access_token and user', () => {
      const user = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        email: 'test@test.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const token = 'token';
      jwtService.sign.mockReturnValue(token);

      const result = service.login(user);

      expect(result.access_token).toStrictEqual(token);
      expect(result.user).toStrictEqual(user);
    });

    it('should throw error if JWT sign fails', () => {
      const user = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        email: 'test@test.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jwtService.sign.mockImplementation(() => {
        throw new Error('JWT error');
      });

      let thrownError: Error | null = null;
      try {
        service.login(user);
      } catch (error) {
        thrownError = error as Error;
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toBe('JWT error');
    });
  });
});
