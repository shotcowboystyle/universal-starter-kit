# Mobile App — Development Context

## Overview

Expo Router (file-based routing) app with React Native + Tamagui UI, TanStack Query for server state, Zustand for auth state, and i18next for EN/DE translations. The app is a kanban board manager with boards, projects, and tasks.

**Tech stack**: Expo SDK (latest), React (latest + React Compiler), Tamagui v4, TanStack Query v5, Zustand, i18next, Vitest.

**API base URL**: `EXPO_PUBLIC_API_URL` env var, defaults to `http://localhost:3001`. All routes defined in `constants/routes.ts` as `API_ROUTES`.

---

## Key Files and Structure

```
apps/mobile/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root: GestureHandlerRootView → TamaguiProvider → QueryClientProvider → auth guard → Stack
│   ├── +not-found.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx           # Email login, KeyboardAvoidingView
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Bottom tabs: index + settings (hidden: error, loading)
│   │   ├── index.tsx           # Boards overview: search bar, filter pills (all/my/team), BoardCard list
│   │   └── settings.tsx        # Theme/language segmented controls + logout
│   ├── boards/
│   │   ├── [boardId].tsx       # Board detail: status filter bar, ProjectColumn vertical list, pull-to-refresh
│   │   └── form.tsx            # Create/edit board (formSheet)
│   ├── projects/
│   │   └── new.tsx             # Create/edit project (formSheet, reuses for edit via projectId param)
│   └── tasks/
│       ├── [taskId].tsx        # Edit task: status buttons, assignee modal picker, DateTimePicker, delete
│       └── new.tsx             # Create task (formSheet, requires projectId + boardId params)
├── components/
│   ├── board-card.tsx          # Board list card: haptic press, BoardActions menu
│   ├── board-actions.tsx       # Alert.alert action sheet: edit → /boards/form?boardId, delete
│   ├── project-column.tsx      # Project card: header + Link.Menu (edit/delete), add task button, SortableTaskList
│   ├── sortable-task-list.tsx  # Renders tasks sorted by orderInProject; manages MoveTaskSheet state
│   ├── task-card.tsx           # Swipeable card (Gesture Handler + Reanimated): swipe right → cycle status, swipe left → move; Link.Menu
│   └── move-task-sheet.tsx     # iOS: ActionSheetIOS; Android: Modal bottom sheet
├── hooks/
│   ├── use-auth.ts             # login mutation, session query (AUTH_KEYS), logout clears store + QueryClient
│   ├── use-boards.ts           # BOARD_KEYS factory, staleTime 5min, exponential retry
│   ├── use-projects.ts         # PROJECT_KEYS factory, scoped to boardId
│   ├── use-tasks.ts            # TASK_KEYS factory + useMoveTask; useUpdateTask auto-injects lastModifier
│   └── use-users.ts            # User search query, staleTime 5min
├── lib/
│   ├── api/
│   │   ├── fetch-with-auth.ts  # Centralized fetch: Bearer token, 401 → logout + redirect, error parsing
│   │   ├── board-api.ts        # CRUD for boards
│   │   ├── project-api.ts      # CRUD for projects
│   │   ├── task-api.ts         # CRUD + moveTask for tasks
│   │   └── user-api.ts         # User search
│   ├── auth/
│   │   └── auth-service.ts     # Token via SecureStore (key: "auth_token"), login → store token → fetch profile
│   ├── i18n/
│   │   └── index.ts            # i18next init: resources from @repo/i18n, device locale detection, persisted override
│   ├── tamagui/
│   │   └── tamagui.config.ts   # Light/dark Tamagui themes with semantic tokens ($primary, $card, $background, etc.)
│   ├── language.ts             # AsyncStorage-based language preference ("language-preference")
│   ├── query-client.ts         # Single QueryClient: staleTime 5min, retry 2, no refetchOnWindowFocus
│   └── theme.ts                # AsyncStorage-based theme preference ("theme-preference"), Appearance.setColorScheme
├── stores/
│   └── auth.ts                 # Zustand auth store via createAuthStore(@repo/store) with expo-secure-store adapter
├── constants/
│   ├── app.ts                  # APP_NAME, DEFAULT_EMAIL
│   └── routes.ts               # API_ROUTES object built from EXPO_PUBLIC_API_URL
├── __tests__/                  # 22 Vitest test files
│   └── test-utils.tsx          # Wrapper: QueryClientProvider with retry:false
├── vitest.config.ts            # jsdom, react-native → react-native-web alias, monorepo React dedup, 80% coverage threshold
└── vitest.setup.ts
```

---

## Route Structure

All routes use Expo Router's file-based system with typed routes enabled.

| Route | Presentation | Purpose |
|---|---|---|
| `(auth)/login` | full screen | Email-only login |
| `(tabs)/index` | tab | Boards overview with search + filter |
| `(tabs)/settings` | tab | Theme, language, logout |
| `boards/[boardId]` | stack push | Board detail with projects |
| `boards/form` | `formSheet` | Create or edit board (param: `boardId?`) |
| `projects/new` | `formSheet` | Create or edit project (params: `boardId`, `projectId?`) |
| `tasks/new` | `formSheet` | Create task (params: `projectId`, `boardId`) |
| `tasks/[taskId]` | stack push | Edit task with all fields |

**Auth guard** in `app/_layout.tsx`: checks `useAuth().session` on mount; redirects to `/(auth)/login` if unauthenticated, to `/(tabs)` if authenticated and in auth group. Navigation waits for `isNavigationReady` before redirecting.

**Tab bar chrome** uses hardcoded HSL values (`hsl(180, 35%, 5%)`) — this is the only place hardcoded colors are acceptable.

---

## Component Patterns

### UI Library: Tamagui
All layout and text uses `View`, `Text`, `useTheme` from `@tamagui/core`. Never use bare React Native `View`/`Text` for styled components — Tamagui tokens won't apply.

Access theme colors via `useTheme()`:
```tsx
const theme = useTheme();
// Inline style: theme.primary.val, theme.card.val, theme.background.val
// Tamagui prop: backgroundColor="$primary", color="$mutedForeground"
```

Never hardcode colors (exception: tab bar/header chrome navigation config).

Available semantic tokens: `$background`, `$color`, `$muted`, `$mutedForeground`, `$primary`, `$primaryForeground`, `$secondary`, `$card`, `$borderColor`, `$input`, `$destructive`, `$primaryAlpha10`, `$secondaryAlpha50`, `$destructiveAlpha10`.

### Icons: expo-image SF Symbols
```tsx
<Image source="sf:chevron.right" style={{ width: 16, height: 16 }} tintColor="gray" />
```

### TaskCard swipe gestures
`react-native-gesture-handler` `Gesture.Pan()` + `react-native-reanimated` `useSharedValue`/`useAnimatedStyle`. Threshold is 60px. Right swipe → `cycleStatus()`, left swipe → `onMoveToProject()`. Both snap back to 0 with `withSpring`.

### Link.Menu (native context menus)
Used on `TaskCard` and `ProjectColumn` for edit/delete. Pattern:
```tsx
<Link href={...} asChild>
  <Link.Trigger><Pressable>...</Pressable></Link.Trigger>
  <Link.Menu>
    <Link.MenuAction title="Edit" icon="pencil" onPress={...} />
    <Link.MenuAction title="Delete" icon="trash" destructive onPress={...} />
  </Link.Menu>
</Link>
```

### formSheet screens
All create/edit screens use this pattern in `Stack.Screen options`:
```tsx
presentation: "formSheet",
sheetGrabberVisible: true,  // boards/form only; tasks/new and projects/new omit this
headerLeft: () => <Pressable onPress={() => router.back()}><Text color="$primary">Cancel</Text></Pressable>,
headerRight: () => <Pressable onPress={handleSubmit}><Text color="$primary">Create</Text></Pressable>
```

### Haptics
- `Haptics.impactAsync(ImpactFeedbackStyle.Light)` — board card press
- `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` — task swipe, move task
- `Haptics.selectionAsync()` — settings segment changes (iOS only via `process.env.EXPO_OS === "ios"`)
- `Haptics.notificationAsync(NotificationFeedbackType.Success)` — successful create/delete

---

## Data Layer

### fetchWithAuth
Every authenticated API call goes through `lib/api/fetch-with-auth.ts`. It:
1. Reads token from `authService.getToken()` (SecureStore)
2. Attaches `Authorization: Bearer <token>` header
3. On 401: calls `authService.logout()` + `router.replace("/(auth)/login")`
4. On other errors: parses JSON or text body and throws `Error`
5. Pass `handleEmptyResponse = true` for DELETE endpoints that return 204

Never use raw `fetch()` for authenticated endpoints.

### API clients
```
lib/api/board-api.ts   → boardApi.{getBoards, getBoardById, createBoard, updateBoard, deleteBoard, addBoardMember}
lib/api/project-api.ts → projectApi.{getProjects, createProject, updateProject, deleteProject}
lib/api/task-api.ts    → taskApi.{getTasks, getTaskById, createTask, updateTask, deleteTask, moveTask}
lib/api/user-api.ts    → userApi.{searchUsers}
```

### Query key factories
```ts
BOARD_KEYS   = { all, lists(), list(), details(), detail(id) }
PROJECT_KEYS = { all, lists(), list(boardId), details(), detail(id) }
TASK_KEYS    = { all, lists(), list({project?, assignee?}), details(), detail(id) }
```

Always invalidate at the correct level. Invalidating `lists()` hits all list variants; invalidating `list(boardId)` targets a specific board's projects only.

### useUpdateTask — lastModifier injection
`useUpdateTask` automatically adds `lastModifier: user._id` from `useAuthStore`. Never pass `lastModifier` from a component.

### Auth store
`stores/auth.ts` creates Zustand store via `createAuthStore(@repo/store)` with `expo-secure-store` adapter. Exposes `{ session, user, setSession, setUser, clear }`.

- Auth tokens → `expo-secure-store` (key: `"auth_token"` managed by `authService`)
- Theme preference → `AsyncStorage` (key: `"theme-preference"`)
- Language preference → `AsyncStorage` (key: `"language-preference"`)

### Single QueryClient
`lib/query-client.ts` exports the single `queryClient` instance used by `app/_layout.tsx`. Do not create another.

---

## Interaction Patterns

| Action | Implementation |
|---|---|
| Swipe right on task | Cycles status: TODO → IN_PROGRESS → DONE → TODO (haptic Medium) |
| Swipe left on task | Opens MoveTaskSheet (iOS: ActionSheetIOS, Android: Modal) |
| Long-press / context menu on task | `Link.Menu` with Edit / Move task / Delete |
| Long-press / context menu on project | `Link.Menu` with Edit / Delete |
| Board actions (ellipsis button) | `Alert.alert` with Edit / Delete / Cancel |
| Create/edit entities | `formSheet` presentation with cancel + save/create in header |
| Status select in task form | Segmented button row (3 buttons: TODO / IN_PROGRESS / DONE) |
| Assignee picker | Full-screen `Modal` (pageSheet) with `FlatList` of users |
| Date picker | iOS: inline `DateTimePicker` inside card; Android: default picker |
| Theme change | `Appearance.setColorScheme()` + persisted to AsyncStorage |
| Language change | `i18n.changeLanguage()` + persisted to AsyncStorage |

---

## Testing Strategy

**Runner**: Vitest with jsdom environment. `react-native` aliased to `react-native-web`. React deduplicated from monorepo root to avoid invalid hook call errors.

**Coverage target**: 80% statement coverage on `hooks/`, `stores/`, `lib/`.

**Test locations**: `__tests__/` — all files flat, named after the unit under test.

**Test wrapper**: Import `{ Wrapper }` from `./__tests__/test-utils` — provides `QueryClientProvider` with `retry: false`.

**Mock pattern**: API modules mocked at the module level with `vi.mock`. Hooks tested via `renderHook`.

```ts
vi.mock("@/lib/api/board-api", () => ({
  boardApi: { getBoards: vi.fn(), ... }
}));

const { result } = renderHook(() => useBoards(), { wrapper: Wrapper });
await waitFor(() => expect(result.current.isSuccess).toBe(true));
```

**Test files present**:
- `auth-service.test.ts`, `auth-store.test.ts` — auth layer
- `fetch-with-auth.test.ts` — fetch wrapper behavior (401, errors, empty response)
- `board-api.test.ts`, `project-api.test.ts`, `task-api.test.ts`, `user-api.test.ts` — API clients
- `use-auth.test.ts`, `use-boards.test.ts`, `use-projects.test.ts`, `use-tasks.test.ts`, `use-users.test.ts` — hooks
- `use-hooks-keys.test.ts`, `use-tasks-keys.test.ts` — query key factory shapes
- `i18n.test.ts`, `i18n-pref.test.ts`, `language.test.ts` — i18n and preferences
- `theme.test.ts`, `constants.test.ts`, `query-client.test.ts`, `sanity.test.ts` — utilities

---

## Common Tasks

### Add a new API endpoint
1. Add route constant to `constants/routes.ts`
2. Add typed function to the relevant `lib/api/*-api.ts` using `fetchWithAuth`
3. Add hook to the relevant `hooks/use-*.ts` following the existing key factory pattern
4. Add test in `__tests__/`

### Add a new formSheet screen
1. Create route file under `app/`
2. Use `presentation: "formSheet"` in `Stack.Screen options`
3. Add `headerLeft` (Cancel → `router.back()`) and `headerRight` (Save/Create → submit handler)
4. Wrap content in `KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}`

### Add a new query key
Follow the `all → lists → list(filters) → details → detail(id)` hierarchy. Invalidate at the narrowest level that covers the affected data.

### Modify translations
Edit `packages/i18n/src/locales/en.json` and `de.json`. The `{appName}` variable resolves to `"Expo Project Manager"` (set in `constants/app.ts`).

### Run tests
```bash
pnpm test                        # from repo root (all packages)
pnpm --filter @repo/mobile test  # mobile only
```
