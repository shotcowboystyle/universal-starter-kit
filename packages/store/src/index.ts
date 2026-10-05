import { useStore as tanstackUseStore } from '@tanstack/react-store';
import { type Store } from '@tanstack/store';

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
export type { WorkspaceState } from './workspaceTypes';

// Auth store (zustand + StorageAdapter)
export type { StorageAdapter } from './storageAdapter';
export { createStorage } from './storageAdapter';
export type { AuthState } from './authStore';
export { createAuthStore } from './authStore';

// TanStack Store primitives
export { createStore } from './createStore';
export type { StoreOptions } from './createStore';
export { storage } from './storage';
export type { Storage, PersistOptions, PersistStore } from './persist';
export { createPersistStore } from './persist';
export { Store, batch, createStore as createTanStackStore } from '@tanstack/store';
export { useStore as useTanStackStore } from '@tanstack/react-store';

type AnyStore = Store<any>;

export function useStore<TState, TSelected = TState>(
  store: Store<TState>,
  selector?: (state: TState) => TSelected,
): TSelected {
  return tanstackUseStore(store as AnyStore, selector ?? ((s) => s as unknown as TSelected));
}
