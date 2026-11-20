import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRepository } from '../../src/modules/users/repositories/users.repository';
import type { UserDocument } from '../../src/modules/users/schemas/users.schema';
import { UserService } from '../../src/modules/users/users.service';

const createUserRepository = () => ({
  findByEmail: vi.fn<UserRepository['findByEmail']>(),
  findAll: vi.fn<UserRepository['findAll']>(),
  searchByName: vi.fn<UserRepository['searchByName']>(),
});

describe(UserService, () => {
  let service: UserService;
  let userRepository: ReturnType<typeof createUserRepository>;

  beforeEach(() => {
    userRepository = createUserRepository();

    service = new UserService(userRepository as unknown as UserRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const user = { email: 'test@test.com', name: 'Test' } as UserDocument;
      userRepository.findByEmail.mockResolvedValue(user);

      const result = await service.findByEmail('test@test.com');

      expect(result).toStrictEqual(user);
      expect(userRepository.findByEmail).toHaveBeenCalledWith('test@test.com');
    });

    it('should return null if no email is provided', async () => {
      const user = await service.findByEmail('');
      expect(user).toBeNull();
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('should return null if user is not found', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      const user = await service.findByEmail('test@test.com');
      expect(user).toBeNull();
    });

    it('should propagate repository errors', async () => {
      userRepository.findByEmail.mockRejectedValue(new Error('DB Error'));
      await expect(service.findByEmail('test@test.com')).rejects.toThrow('DB Error');
    });
  });

  describe('findAll', () => {
    it('should find all users', async () => {
      userRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toStrictEqual([]);
      expect(userRepository.findAll).toHaveBeenCalledWith();
    });

    it('should propagate repository errors', async () => {
      userRepository.findAll.mockRejectedValue(new Error('DB Error'));
      await expect(service.findAll()).rejects.toThrow('DB Error');
    });
  });

  describe('searchByName', () => {
    it('should search users by name', async () => {
      userRepository.searchByName.mockResolvedValue([]);

      await service.searchByName('test');

      expect(userRepository.searchByName).toHaveBeenCalledWith('test');
    });

    it('should search with empty name', async () => {
      userRepository.searchByName.mockResolvedValue([]);

      await service.searchByName('');

      expect(userRepository.searchByName).toHaveBeenCalledWith('');
    });

    it('should propagate repository errors', async () => {
      userRepository.searchByName.mockRejectedValue(new Error('DB Error'));
      await expect(service.searchByName('test')).rejects.toThrow('DB Error');
    });
  });
});
