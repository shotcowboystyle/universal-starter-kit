// Core API client
export { boardApi } from '../board-api';

// Types and constants
export type { CreateBoardInput, UpdateBoardInput } from '@/types/board-api';
export { BOARD_KEYS } from '@/types/board-api';

// Query and mutation hooks
export { useBoards, useBoard, useCreateBoard, useUpdateBoard, useDeleteBoard, useAddBoardMember } from './queries';
