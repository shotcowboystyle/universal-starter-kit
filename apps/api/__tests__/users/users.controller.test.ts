import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserController } from '../../src/modules/users/users.controller';
import type { UserService } from '../../src/modules/users/users.service';

const createService = () => ({
  findAll: vi.fn<UserService['findAll']>(),
  searchByName: vi.fn<UserService['searchByName']>(),
});

describe(UserController, () => {
  let controller: UserController;
  let service: ReturnType<typeof createService>;

  beforeEach(() => {
    service = createService();

    // Manually instantiate UserController with the mock UserService
    controller = new UserController(service as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result: unknown[] = [];
      service.findAll.mockResolvedValue(result as any);
      await expect(controller.findAll()).resolves.toStrictEqual({ users: result });
    });
  });

  describe('search', () => {
    it('should return an array of users', async () => {
      const result: unknown[] = [];
      service.searchByName.mockResolvedValue(result as any);
      await expect(controller.search('test')).resolves.toStrictEqual({ users: result });
    });
  });
});
