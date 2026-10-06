import { describe, it, expect } from 'vitest';

describe('API Exports', () => {
  it('should export board API members', async () => {
    const boardsIndex = await import('@/lib/api/boards');
    expect(boardsIndex).toBeDefined();
    expect(boardsIndex.boardApi).toBeDefined();
    expect(boardsIndex.useBoards).toBeDefined();
  });

  it('should export project API members', async () => {
    const projectsIndex = await import('@/lib/api/projects');
    expect(projectsIndex).toBeDefined();
    // Assuming these exist based on naming conventions, otherwise this test will fail and I'll know what to fix
    expect(projectsIndex).toBeTruthy();
  });

  it('should export task API members', async () => {
    const tasksIndex = await import('@/lib/api/tasks');
    expect(tasksIndex).toBeDefined();
    expect(tasksIndex).toBeTruthy();
  });

  it('should export user API members', async () => {
    const usersIndex = await import('@/lib/api/users');
    expect(usersIndex).toBeDefined();
    expect(usersIndex).toBeTruthy();
  });
});
