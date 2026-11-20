import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectsController } from '../../src/modules/projects/projects.controller';
import type { ProjectsService } from '../../src/modules/projects/projects.service';

const createService = () => ({
  create: vi.fn<ProjectsService['create']>(),
  findByBoardId: vi.fn<ProjectsService['findByBoardId']>(),
  update: vi.fn<ProjectsService['update']>(),
  remove: vi.fn<ProjectsService['remove']>(),
});

describe(ProjectsController, () => {
  let controller: ProjectsController;
  let service: ReturnType<typeof createService>;

  beforeEach(() => {
    service = createService();

    // Manually instantiate ProjectsController with the mock ProjectsService
    controller = new ProjectsController(service as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a project', async () => {
      const createProjectDto = { title: 'Test Project', boardId: '1', owner: '' };
      const user = { _id: '1', email: 'test@test.com' };
      const result = { ...createProjectDto, _id: '1', owner: '1' };

      vi.spyOn(service, 'create').mockResolvedValue(result as any);

      await expect(controller.create(createProjectDto, user)).resolves.toStrictEqual(result);
      expect(service.create).toHaveBeenCalledWith({ ...createProjectDto, owner: '1' });
    });
  });

  describe('getProjectsByBoard', () => {
    it('should find all projects for a board', async () => {
      const result: unknown[] = [];

      vi.spyOn(service, 'findByBoardId').mockResolvedValue(result as any);

      await expect(controller.getProjectsByBoard('1')).resolves.toStrictEqual(result);
      expect(service.findByBoardId).toHaveBeenCalledWith('1');
    });
  });

  describe('update', () => {
    it('should update a project', async () => {
      const updateProjectDto = { title: 'Test Project Updated' };
      const user = { _id: '1' };
      const result = { _id: '1', title: 'Test Project Updated', owner: '1' };

      vi.spyOn(service, 'update').mockResolvedValue(result as any);

      await expect(controller.update('1', updateProjectDto, user as any)).resolves.toStrictEqual(result);
      expect(service.update).toHaveBeenCalledWith('1', updateProjectDto, '1');
    });
  });

  describe('remove', () => {
    it('should remove a project', async () => {
      const user = { _id: '1' };
      const result = { success: true, message: 'Project deleted successfully' };

      vi.spyOn(service, 'remove').mockResolvedValue(result as any);

      await expect(controller.remove('1', user as any)).resolves.toStrictEqual(result);
      expect(service.remove).toHaveBeenCalledWith('1', '1');
    });
  });
});
