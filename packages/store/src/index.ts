import { useSelector } from '@tanstack/react-store';
import type { Store } from '@tanstack/store';

// Domain types
export type {
  Board,
  BoardDocument,
  CreateTaskInput,
  Project,
  Session,
  Task,
  UpdateTaskInput,
  User,
  UserInfo,
} from './types';
export { TaskStatus } from './types';

// Workspace types (interface only — implementations live in each app)
export type { WorkspaceState } from './workspace-types';

// Auth store (zustand + StorageAdapter)
export type { StorageAdapter } from './storage-adapter';
export { createStorage } from './storage-adapter';
export type { AuthState } from './auth-store';
export { createAuthStore } from './auth-store';

// TanStack Store primitives
export { createStore } from './create-store';
export type { StoreOptions } from './create-store';
export { storage } from './storage';
export type { Storage, PersistOptions, PersistStore } from './persist';
export { createPersistStore } from './persist';
export { Store, batch, createStore as createTanStackStore } from '@tanstack/store';
// oxlint-disable-next-line typescript/no-deprecated -- public export kept for API compatibility; same hook as useSelector with a positional compare argument
export { useStore as useTanStackStore } from '@tanstack/react-store';

export const useStore = <TState, TSelected = TState>(
  store: Store<TState>,
  selector?: (state: TState) => TSelected,
): TSelected => useSelector<TState, TSelected>(store, selector);
