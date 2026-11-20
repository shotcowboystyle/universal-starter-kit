# @repo/utils

Build-time and dev-environment utilities for this monorepo:
monorepo module discovery for bundlers and wait-for-service helpers. Node-only —
nothing here ships to the browser.

## Usage in this monorepo

Private workspace package. Add `"@repo/utils": "workspace:*"` to the
consuming package's `devDependencies`.

## What it owns

Everything lives on the **`/dev`** subpath (the root `.` entry is intentionally
empty):

- **Bundler discovery** — `lookupTranspileModules()`, `lookupTamaguiModules()`
  (aggregate `transpileModules` / `tamaguiModules` fields from workspace
  `package.json` files), `lookupProjectRoot()`, `resolveConfig(keys)`
- **Wait helpers** — `waitForPostgres`,
  `waitForKeycloak` (optional integrations; poll until a service answers),
  `waitServices`, `formatServiceList`

## What it must not do

- No runtime app code, no UI — this package is for build scripts, config
  files, and dev tooling

## Usage

```ts
// vite.config.ts / metro config
import { lookupTamaguiModules } from '@repo/utils/dev';

const tamaguiModules = lookupTamaguiModules();
```

```ts
// wait for the database before running tests
import { waitForPostgres } from '@repo/utils/dev';

await waitForPostgres(1000); // poll every 1s until Postgres accepts a query
```

## License

Apache-2.0
