# @repo/router

Cross-platform routing facade for this monorepo: one import that resolves
to the right router per surface ([One](https://onestack.dev) apps, React
Router, Storybook, web extensions) plus URL state hooks.

## Usage in this monorepo

Private workspace package. Add `"@repo/router": "workspace:*"` to the
consuming package's `dependencies`.

Peers: `react`, plus `one` or `react-router-dom` depending on the host app.

## What it owns

- **Navigation primitives** — `Link`, `useRouter`, `useParams`, `usePathname`
  (resolved per platform/build via file suffixes: One by default, React Router,
  Storybook, webext)
- **URL state hooks** — `useSearchParams`, `useUrlState`, `useTypedSearchParams`,
  `useShareableUrl`

## What it must not do

- No screens, no data fetching — it is a thin facade so packages like
  `@repo/forms` can sync state with the URL without binding to one router

## Usage

```tsx
import { Link, useUrlState } from '@repo/router';

export function SearchScreen() {
  const [state, setState] = useUrlState({ q: '' }, { debounceMs: 300 });
  return (
    <>
      <input value={state.q} onChange={(e) => setState({ q: e.target.value })} />
      <Link href={`/results?q=${encodeURIComponent(state.q)}`}>Search</Link>
    </>
  );
}
```

`useUrlState(defaultValues, options?)` returns `[state, setState]` and keeps
the state in the URL on web (shareable/bookmarkable) and in memory on native —
same API everywhere.

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
