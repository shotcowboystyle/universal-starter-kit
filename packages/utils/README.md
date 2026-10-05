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
- **Wait helpers** — `waitForFrappe`, `waitForPostgres`, `waitForMariaDB`,
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
// wait for the backend before running tests
import { waitForFrappe } from '@repo/utils/dev';

await waitForFrappe(1000); // poll every 1s until BASE_URL/api/method/ping answers
```

## License

Apache-2.0

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
