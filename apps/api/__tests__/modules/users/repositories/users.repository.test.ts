import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserRepository } from '../../../../src/modules/users/repositories/users.repository';

type AnyFn = (...args: any[]) => any;

const createMockModel = () => ({
  findOne: vi.fn<AnyFn>().mockReturnThis(),
  find: vi.fn<AnyFn>().mockReturnThis(),
  exec: vi.fn<AnyFn>(),
});

describe(UserRepository, () => {
  let repository: UserRepository;
  let mockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    mockModel = createMockModel();

    repository = new UserRepository(mockModel as any);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const mockUser = { email: 'test@example.com', name: 'Test User' };
      mockModel.exec.mockResolvedValue(mockUser);

      const result = await repository.findByEmail('test@example.com');

      expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(result).toStrictEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      mockModel.exec.mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const mockUsers = [
        { email: 'user1@example.com', name: 'User 1' },
        { email: 'user2@example.com', name: 'User 2' },
      ];
      mockModel.exec.mockResolvedValue(mockUsers);

      const result = await repository.findAll();

      expect(mockModel.find).toHaveBeenCalledWith();
      expect(result).toStrictEqual(mockUsers);
    });

    it('should return empty array if no users', async () => {
      mockModel.exec.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toStrictEqual([]);
    });
  });

  describe('searchByName', () => {
    it('should search users by name with regex', async () => {
      const mockUsers = [{ email: 'john@example.com', name: 'John Doe' }];
      mockModel.exec.mockResolvedValue(mockUsers);

      const result = await repository.searchByName('john');

      expect(mockModel.find).toHaveBeenCalledWith({
        name: { $regex: 'john', $options: 'i' },
      });
      expect(result).toStrictEqual(mockUsers);
    });

    it('should return all users when name is empty', async () => {
      const mockUsers = [
        { email: 'user1@example.com', name: 'User 1' },
        { email: 'user2@example.com', name: 'User 2' },
      ];
      mockModel.exec.mockResolvedValue(mockUsers);

      const result = await repository.searchByName('');

      expect(mockModel.find).toHaveBeenCalledWith({});
      expect(result).toStrictEqual(mockUsers);
    });

    it('should return empty array if no matches', async () => {
      mockModel.exec.mockResolvedValue([]);

      const result = await repository.searchByName('nonexistent');

      expect(result).toStrictEqual([]);
    });
  });
});
