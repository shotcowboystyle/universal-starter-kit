import { describe, expect, it } from 'vitest';

import {
  BOARD_KEYS,
  boardApi,
  useAddBoardMember,
  useBoard,
  useBoards,
  useCreateBoard,
  useDeleteBoard,
  useUpdateBoard,
} from '@/lib/api/boards';

describe('boards/index exports', () => {
  it('should export boardApi', () => {
    expect(boardApi).toBeDefined();
    for (const method of ['getBoards', 'getBoardById', 'createBoard', 'updateBoard', 'deleteBoard', 'addBoardMember']) {
      expect(boardApi).toHaveProperty(method);
    }
  });

  it('should export BOARD_KEYS', () => {
    expect(BOARD_KEYS).toBeDefined();
    expect(BOARD_KEYS.all).toBeDefined();
    expect(BOARD_KEYS.lists).toBeDefined();
    expect(BOARD_KEYS.detail).toBeDefined();
  });

  it.each([
    ['useBoards', useBoards],
    ['useBoard', useBoard],
    ['useCreateBoard', useCreateBoard],
    ['useUpdateBoard', useUpdateBoard],
    ['useDeleteBoard', useDeleteBoard],
    ['useAddBoardMember', useAddBoardMember],
  ])('should export %s hook', (_name, hook) => {
    expect(hook).toBeTypeOf('function');
  });
});
