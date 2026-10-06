// Core API client
export { taskApi } from '../task-api';

// Types and constants
export type { CreateTaskInput, UpdateTaskInput } from '@/types/task-api';
export { TASK_KEYS } from '@/types/task-api';

// Query and mutation hooks
export { useTasks, useTask, useCreateTask, useUpdateTask, useDeleteTask } from './queries';
