# Web App — Development Context

## Overview

Next.js 16 App Router application — a kanban project manager with drag-and-drop, email-based auth, and full EN/DE i18n. Communicates with the NestJS API at `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`). App name: `"Turbo Project Manager"` (set in `src/constants/ui.ts`).

## Key Files and Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx              # Root locale layout: font, NextIntlClientProvider, ClientProviders
│   │   │   ├── page.tsx                # Client entry point: redirects to /boards or /login
│   │   │   ├── (auth)/
│   │   │   │   ├── layout.tsx          # Auth shell: Toaster only (client component)
│   │   │   │   └── login/page.tsx      # Static ("use cache") — renders SignInView
│   │   │   └── (workspace)/
│   │   │       ├── layout.tsx          # Wraps children in RootWrapper (Suspense + sidebar shell)
│   │   │       ├── boards/page.tsx     # Boards overview (RSC, renders BoardOverview)
│   │   │       └── boards/[boardId]/page.tsx  # Board detail (client, sets currentBoardId in store)
│   │   ├── actions/
│   │   │   ├── board-actions.ts        # "use server" CRUD for boards (reads jwt cookie)
│   │   │   ├── project-actions.ts      # "use server" CRUD + getProjects
│   │   │   └── task-actions.ts         # "use server" CRUD + moveTask + getTasks
│   │   └── global-error.tsx
│   ├── components/
│   │   ├── auth/
│   │   │   ├── SignInView.tsx           # Two-panel layout, renders UserAuthForm
│   │   │   └── UserAuthForm.tsx         # React Hook Form + Zod email form
│   │   ├── kanban/
│   │   │   ├── BoardOverview.tsx        # Board grid with search/filter, handles login_success param
│   │   │   ├── board/
│   │   │   │   ├── Board.tsx            # DndContext + SortableContext wrapper
│   │   │   │   ├── BoardContext.tsx     # Context: currentUserId, isBoardOwner, isBoardMember
│   │   │   │   ├── BoardActions.tsx     # Edit/delete board dropdown
│   │   │   │   ├── BoardForm.tsx        # Shared create/edit board form
│   │   │   │   ├── NewBoardDialog.tsx   # Dialog wrapping BoardForm
│   │   │   │   ├── useBoardDnd.ts       # All DnD logic: drag start/over/end/cancel, API sync
│   │   │   │   └── useDndAnnouncements.ts  # Accessibility announcements for drag events
│   │   │   ├── project/
│   │   │   │   ├── Project.tsx          # Sortable project column with task list
│   │   │   │   ├── ProjectAction.tsx    # Edit/delete project menu
│   │   │   │   ├── ProjectForm.tsx      # Create/edit project form
│   │   │   │   └── NewProjectDialog.tsx
│   │   │   └── task/
│   │   │       ├── TaskCard.tsx         # Draggable task card
│   │   │       ├── TaskAction.tsx       # Edit/delete task menu
│   │   │       ├── TaskForm.tsx         # Create/edit task form
│   │   │       ├── TaskFilter.tsx       # Status + search filter bar
│   │   │       └── NewTaskDialog.tsx
│   │   └── layout/
│   │       ├── RootWrapper.tsx          # SidebarProvider + AppSidebar + Header + Toaster
│   │       ├── AppSidebar.tsx           # Sidebar: boards overview link + my/team boards list
│   │       ├── Header.tsx               # Top bar with breadcrumbs, theme toggle, user nav
│   │       ├── Breadcrumbs.tsx
│   │       ├── PageContainer.tsx        # Scroll container wrapper
│   │       ├── ThemeProvider.tsx        # Re-exports next-themes ThemeProvider
│   │       ├── ThemeToggle.tsx
│   │       ├── LanguageSwitcher.tsx
│   │       ├── UserNav.tsx              # Avatar dropdown with logout
│   │       ├── Icons.ts                 # Lucide icon exports
│   │       └── Providers.tsx            # (unused — providers are in client-providers.tsx)
│   ├── hooks/
│   │   ├── useAuth.ts          # Login mutation + session check + logout + useAuthForm
│   │   ├── useBoards.ts        # Facade over TanStack Query — splits boards into my/team
│   │   ├── useBreadcrumbs.tsx  # Derives breadcrumb items from pathname
│   │   ├── useDebounce.ts
│   │   └── useTaskForm.ts      # React Hook Form logic for task create/edit
│   ├── i18n/
│   │   ├── routing.ts          # defineRouting from @repo/i18n (locales: en, de)
│   │   ├── navigation.ts       # Exports Link, redirect, usePathname, useRouter, getPathname
│   │   └── request.ts          # getRequestConfig — loads cached messages server-side
│   ├── lib/
│   │   ├── api/
│   │   │   ├── fetchWithAuth.ts         # Shared client-side fetch: reads auth_token from localStorage
│   │   │   ├── boardApi.ts              # boardApi object (getBoards, getBoardById, create, update, delete, addMember)
│   │   │   ├── boards/
│   │   │   │   ├── index.ts             # Re-exports boardApi + BOARD_KEYS + query hooks
│   │   │   │   └── queries.ts           # useBoards, useBoard, useCreateBoard, useUpdateBoard, useDeleteBoard, useAddBoardMember
│   │   │   ├── projectApi.ts
│   │   │   ├── projects/index.ts + queries.ts
│   │   │   ├── taskApi.ts
│   │   │   ├── tasks/index.ts + queries.ts   # useUpdateTask has optimistic updates + rollback
│   │   │   ├── userApi.ts
│   │   │   └── users/index.ts + queries.ts
│   │   ├── auth/
│   │   │   ├── authService.ts   # AuthService class: login, getProfile, getSession, logout
│   │   │   └── authChecker.ts   # "use server" — checks jwt cookie for SSR auth
│   │   ├── config/
│   │   │   └── env.ts           # Centralized config (databaseUrl, nodeEnv, baseUrl, flags)
│   │   └── get-cached-messages.ts  # "use cache" + cacheLife("days"), interpolates {appName}
│   ├── providers/
│   │   └── client-providers.tsx    # Single QueryClient (staleTime 5min) + ThemeProvider + SyncAuthStore
│   ├── proxy.ts                    # Middleware: auth redirect + next-intl locale routing
│   ├── stores/
│   │   ├── auth-store.ts           # useAuthStore = createAuthStore() — Zustand default (localStorage)
│   │   ├── workspace-store.ts      # useWorkspaceStore: composed slices, persists currentBoardId + filter
│   │   ├── board-store.ts          # createBoardSlice: myBoards, teamBoards, addBoard, updateBoard, removeBoard
│   │   ├── project-store.ts        # createProjectSlice: projects, fetchProjects, fetchTasksByProject, CRUD
│   │   ├── task-store.ts           # createTaskSlice: addTask, updateTask, removeTask, dragTaskOnProject
│   │   └── types.ts                # Slice interfaces + WorkspaceState union type
│   ├── types/
│   │   ├── dbInterface.ts          # Re-exports Board, Project, Task, Session, UserInfo from @repo/store
│   │   ├── boardApi.ts             # CreateBoardInput, UpdateBoardInput, BOARD_KEYS
│   │   ├── taskApi.ts              # TASK_KEYS, TaskPermissions
│   │   ├── projectApi.ts           # PROJECT_KEYS
│   │   ├── userApi.ts
│   │   ├── boardForm.ts, taskForm.ts, projectForm.ts, authUserForm.ts  # Zod schemas + inferred types
│   │   └── drag&drop.ts            # DraggableData discriminated union (type: "Project" | "Task")
│   └── constants/
│       ├── routes.ts       # ROUTES (API_URL, auth, boards), URL_PARAMS
│       ├── ui.ts           # APP_NAME, TOAST_DURATION, NAVIGATION_DELAY_MS
│       ├── db.ts
│       ├── demoData.ts     # defaultEmail used in e2e tests
│       └── common.ts
└── __tests__/
    ├── e2e/
    │   └── Login.test.ts   # Playwright: load sign-in page, sign in with defaultEmail
    └── units/
        └── proxy.test.ts   # Vitest: middleware exports + config matcher
```

## Architecture Patterns

### Route Groups

- `(auth)` — unauthenticated pages. Layout is a client component that adds only a `Toaster`.
- `(workspace)` — authenticated pages. Layout wraps children in `RootWrapper` which provides the full sidebar + header shell.

### Auth Flow

The middleware (`src/proxy.ts`) guards all non-login routes by checking for a `jwt` or `isAuthenticated` cookie. If missing, it redirects to `/{locale}/login?callbackUrl=...`.

Client-side auth uses two mechanisms in parallel:
- `auth_token` in `localStorage` — attached as `Authorization: Bearer` header by `fetchWithAuth.ts`
- `jwt` HTTP-only cookie — sent via `credentials: "include"` as a fallback

`AuthService` (`lib/auth/authService.ts`) is a static class used by `useAuth`. It also writes an `isAuthenticated` non-HTTP-only cookie (readable by middleware) on login.

`useAuthStore` (Zustand, `@repo/store` factory, no explicit adapter) persists via Zustand's default — `localStorage`. `useWorkspaceStore` persists only `currentBoardId` and `filter` via `zustand/middleware persist`.

### Server Actions vs API Clients

**Server actions** (`app/actions/*.ts`) — called from form submissions or RSC contexts. They read the `jwt` cookie via `next/headers` and call the API directly.

**Client API clients** (`lib/api/*.ts`) — plain objects (`boardApi`, `projectApi`, etc.) wrapping `fetchWithAuth`. Used exclusively by TanStack Query hooks. Never call these directly from components — always go through the query hooks.

### Drag and Drop

`useBoardDnd.ts` handles all DnD logic using `@dnd-kit/core`:
- Task drag over different project columns: optimistic reorder in Zustand store
- Task drag end: calls `taskApi.moveTask(taskId, projectId, newIndex)` and rolls back on error
- Project reorder: calls `projectApi.updateProject` for each project whose `orderInBoard` changed

### Query Key Factories

Query keys live in `src/types/boardApi.ts`, `taskApi.ts`, and `projectApi.ts`:

```typescript
BOARD_KEYS.list()          // ["boards", "list"]
BOARD_KEYS.detail(id)      // ["boards", "detail", id]
TASK_KEYS.list({ project }) // ["tasks", "list", { project }]
TASK_KEYS.detail(id)        // ["tasks", "detail", id]
```

Always invalidate at the correct key level. `useUpdateTask` includes full optimistic update with rollback via `onMutate`/`onError`.

## i18n and Routing

Locale routing is handled by `next-intl`. All pages live under `app/[locale]/`. The middleware applies locale detection before the auth check.

**Always import navigation from `@/i18n/navigation`**, not from `next/navigation`:

```typescript
// CORRECT
import { useRouter, Link, usePathname } from "@/i18n/navigation";
router.push("/boards");          // locale prepended automatically

// WRONG
import { useRouter } from "next/navigation";
router.push("/en/boards");       // never hardcode locale prefix
```

Translations are loaded via `getCachedMessages` (cached for `"days"` using Next.js `"use cache"` directive). The `{appName}` placeholder in translation strings is replaced with `APP_NAME` from `src/constants/ui.ts` at cache-fill time.

To add a new translation key: edit `packages/i18n/src/locales/en.json` and `de.json`. The `Messages` type from `@repo/i18n` enforces completeness.

## Data Fetching

### TanStack Query hooks (client components)

All data fetching in components uses hooks from `src/lib/api/*/queries.ts`, re-exported via `src/lib/api/*/index.ts`:

```typescript
import { useBoards, useCreateBoard } from "@/lib/api/boards";
import { useTasks, useUpdateTask } from "@/lib/api/tasks";
```

`useBoards` in `src/hooks/useBoards.ts` is a facade that wraps the raw query and splits the result into `myBoards` / `teamBoards` based on `userId` from `useWorkspaceStore`.

### Global defaults (set in `client-providers.tsx`)

- `staleTime`: 5 minutes
- `retry`: 1
- `refetchOnWindowFocus`: false

`useTasks` overrides `staleTime: 0` to always fetch fresh on mount.

### Workspace store data loading

`boards/[boardId]/page.tsx` calls `fetchProjects(boardId)` directly on `useWorkspaceStore` after setting `currentBoardId`. The projects slice fetches tasks per-project via `fetchTasksByProject`.

## Testing Strategy

### Unit tests (Vitest + jsdom)

- Config: `apps/web/vitest.config.ts` extends root config, pins React via `require.resolve` to avoid hook dispatcher conflicts across pnpm workspaces
- Test files: `__tests__/units/**/*.test.{ts,tsx}`
- Coverage threshold: 80% statements
- Excluded from coverage: Next.js file conventions (`page.tsx`, `layout.tsx`, etc.), kanban DnD components, action components, `src/types/**`

### E2E tests (Playwright)

- Config: `playwright.config.ts` — `testDir: __tests__/e2e/`
- Browsers: Chromium, Edge, WebKit, Mobile Chrome, Mobile Safari
- Runs `pnpm dev` as `webServer` if not CI
- Base URL from `NEXT_PUBLIC_WEB_URL` (default `http://localhost:3000/`)
- Requires API + MongoDB running (see root playwright.config notes)

```bash
pnpm test             # Vitest unit tests with coverage
pnpm playwright       # Playwright e2e tests
```

## Common Tasks

### Add a new page under the workspace layout

1. Create `src/app/[locale]/(workspace)/your-route/page.tsx`
2. If the page needs translations, add keys to `packages/i18n/src/locales/en.json` + `de.json`
3. Use `useTranslations("namespace")` client-side or `getTranslations({ locale, namespace })` in RSC metadata

### Add a new API query hook

1. Add the API function to the relevant `src/lib/api/*Api.ts` file
2. Add query key constants to `src/types/*Api.ts` following the `all → lists → list(filters) → details → detail(id)` factory pattern
3. Add the hook to `src/lib/api/*/queries.ts` and re-export from `index.ts`
4. Invalidate using the appropriate key level in `onSuccess`

### Modify auth behavior

- Middleware redirect logic: `src/proxy.ts`
- Token storage + profile fetch: `src/lib/auth/authService.ts`
- Session state management: `src/hooks/useAuth.ts`
- Auth store (user object): `src/stores/auth-store.ts`
- Workspace store (userId for API calls): `src/stores/workspace-store.ts`

### Add a new Shadcn UI component

Import from `@repo/ui/components/<name>` (package export path), not from relative paths. Do not modify files in `packages/ui/src/components/ui` unless no other option exists — prefer extending in `apps/web/src/components`.

### Environment variables

All env vars accessed via `src/lib/config/env.ts` (`config` export) for server-side use. Client-side public vars (`NEXT_PUBLIC_*`) are accessed directly where needed (e.g., `API_URL` in `src/constants/routes.ts`).

Required for local dev:
- `NEXT_PUBLIC_API_URL` — NestJS API base URL (default: `http://localhost:3001`)
- `NEXT_PUBLIC_WEB_URL` — web app base URL (default: `http://localhost:3000`)
