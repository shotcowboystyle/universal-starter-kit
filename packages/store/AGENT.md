# @repo/store — Development Context

## Overview

Shared state management package providing cross-platform auth store, a platform-agnostic `StorageAdapter` interface, domain types, and the `WorkspaceState` interface contract. The store factory pattern lets web and mobile inject their own storage backends without duplicating store logic.

## Key Files and Structure

```
packages/store/
├── package.json              # Single export "." → src/index.ts
└── src/
    ├── index.ts              # Public API: re-exports all types, createAuthStore, StorageAdapter, WorkspaceState
    ├── auth-store.ts         # createAuthStore(adapter?) factory — Zustand + persist middleware
    ├── storage.ts            # StorageAdapter type alias + createStorage() wrapper
    ├── types.ts              # Domain types: Board, Project, Task, TaskStatus, User, UserInfo, Session, CreateTaskInput, UpdateTaskInput
    └── workspace-types.ts    # WorkspaceState interface — shared contract, implementations live in each app
```

## Usage

### Auth store — platform instantiation

**Web** (`apps/web/src/stores/auth-store.ts`): no adapter needed, Zustand defaults to `localStorage`.
```typescript
import { createAuthStore } from "@repo/store";
export const useAuthStore = createAuthStore();
```

**Mobile** (`apps/mobile/stores/auth.ts`): inject `expo-secure-store` as the adapter.
```typescript
import { createAuthStore, type StorageAdapter } from "@repo/store";
import * as SecureStore from "expo-secure-store";

const secureStorageAdapter: StorageAdapter = {
  getItem: async (name) => SecureStore.getItemAsync(name),
  setItem: async (name, value) => { await SecureStore.setItemAsync(name, value); },
  removeItem: async (name) => { await SecureStore.deleteItemAsync(name); },
};

export const useAuthStore = createAuthStore(secureStorageAdapter);
```

### StorageAdapter interface

`StorageAdapter` is a re-export of Zustand's `StateStorage`:
```typescript
interface StorageAdapter {
  getItem(name: string): string | null | Promise<string | null>;
  setItem(name: string, value: string): void | Promise<void>;
  removeItem(name: string): void | Promise<void>;
}
```

Any sync or async storage that satisfies this shape can be injected.

### AuthState shape

```typescript
interface AuthState {
  session: Session | null;   // persisted to storage
  user: UserInfo | null;     // not persisted (runtime only)
  isLoading: boolean;
  error: string | null;
  setSession(session: Session | null): void;
  setUser(user: UserInfo | null): void;
  setLoading(isLoading: boolean): void;
  setError(error: string | null): void;
  clear(): void;             // resets all state
}
```

Only `session` is persisted via `partialize`. `user`, `isLoading`, and `error` are runtime-only.

### Domain types

| Type | Description |
|------|-------------|
| `Session` | `{ user: UserInfo; accessToken: string }` |
| `UserInfo` | `{ _id, name, email }` |
| `User` | Full user with timestamps |
| `Board` | Board with populated `members: UserInfo[]` and `projects: Project[]` |
| `BoardDocument` | Raw Mongoose document shape (IDs as strings) |
| `Project` | Project with `tasks: Task[]`, polymorphic `owner` and `members` |
| `Task` | Task with `status: TaskStatus`, `assignee`, `creator`, `lastModifier`, `orderInProject` |
| `TaskStatus` | Enum: `TODO`, `IN_PROGRESS`, `DONE` |
| `CreateTaskInput` | DTO for task creation |
| `UpdateTaskInput` | DTO for task update (requires `lastModifier`) |
| `WorkspaceState` | Interface contract for workspace Zustand store — implemented per-app |

## Development Guidelines

- **Do not add app-specific logic** to this package. It must remain a neutral contract layer.
- **`WorkspaceState` is interface-only**: full implementations live in `apps/web` and are not shared (mobile uses TanStack Query hooks instead).
- **New domain types** belong in `src/types.ts`. Export them via `src/index.ts`.
- **New stores** follow the same factory pattern as `createAuthStore`: accept an optional `StorageAdapter` and return a Zustand store instance.
- `UpdateTaskInput` requires `lastModifier` — on mobile this is auto-injected by `useUpdateTask`. Do not add it to the interface as optional.
