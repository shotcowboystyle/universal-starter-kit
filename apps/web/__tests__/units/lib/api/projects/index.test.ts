import { describe, expect, it } from 'vitest';

import {
  PROJECT_KEYS,
  projectApi,
  useCreateProject,
  useDeleteProject,
  useProject,
  useProjects,
  useUpdateProject,
} from '@/lib/api/projects';

describe('projects/index exports', () => {
  it('should export projectApi', () => {
    expect(projectApi).toBeDefined();
    expect(projectApi).toHaveProperty('getProjects');
    expect(projectApi).toHaveProperty('getProjectById');
    expect(projectApi).toHaveProperty('createProject');
    expect(projectApi).toHaveProperty('updateProject');
    expect(projectApi).toHaveProperty('deleteProject');
  });

  it('should export PROJECT_KEYS', () => {
    expect(PROJECT_KEYS).toBeDefined();
    expect(PROJECT_KEYS).toHaveProperty('all');
    expect(PROJECT_KEYS).toHaveProperty('lists');
    expect(PROJECT_KEYS).toHaveProperty('detail');
  });

  it('should export useProjects hook', () => {
    expect(useProjects).toBeDefined();
    expect(useProjects).toBeTypeOf('function');
  });

  it('should export useProject hook', () => {
    expect(useProject).toBeDefined();
    expect(useProject).toBeTypeOf('function');
  });

  it('should export useCreateProject hook', () => {
    expect(useCreateProject).toBeDefined();
    expect(useCreateProject).toBeTypeOf('function');
  });

  it('should export useUpdateProject hook', () => {
    expect(useUpdateProject).toBeDefined();
    expect(useUpdateProject).toBeTypeOf('function');
  });

  it('should export useDeleteProject hook', () => {
    expect(useDeleteProject).toBeDefined();
    expect(useDeleteProject).toBeTypeOf('function');
  });
});
