# @repo/store

[TanStack Store](https://tanstack.com/store) state management with
cross-platform persistent storage (localStorage on web, AsyncStorage-style on
native) for this monorepo.

## Usage in this monorepo

Private workspace package. Add `"@repo/store": "workspace:*"` to the
consuming package's `dependencies`.

## What it owns

- **`createStore(initialState, options?)`** — a TanStack `Store`, or a
  `PersistStore` when `persist: true` (state survives reloads, keyed by `name`)
- **`useStore(store, selector?)`** — React hook with optional selector
- **`createPersistStore`**, the platform `storage` adapter, and raw TanStack
  re-exports (`Store`, `batch`, `createTanStackStore`, `useTanStackStore`)

## What it must not do

- No server state — queries/mutations belong to TanStack Query
- No UI

## Usage

```tsx
import { createStore, useStore } from '@repo/store';

const appStore = createStore({ theme: 'light' }, { name: 'app', persist: true });

export function ThemeToggle() {
  const theme = useStore(appStore, (s) => s.theme);
  const toggle = () =>
    appStore.setState((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  return <button onClick={toggle}>{theme}</button>;
}
```

Persisted stores rehydrate from storage automatically on creation and expose
`rehydrate()` / `clearPersistedState()` for manual control.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
