# @repo/config

Shared build and test configuration presets for universal-starter-kit.

## Usage in this monorepo

Private workspace package. Add `"@repo/config": "workspace:*"` to the
consuming package's `devDependencies`.

## Presets

### Vite

```ts
import { createViteConfig } from '@repo/config/vite';

export default createViteConfig({
  /* options */
});
```

### Vitest

```ts
import { createVitestConfig } from '@repo/config/vitest';

export default createVitestConfig({
  /* options */
});
```

### Storybook

```ts
import { createStorybookViteConfig } from '@repo/config/storybook';

export default createStorybookViteConfig({
  /* options */
});
```

### Playwright

```ts
import { createPlaywrightConfig } from '@repo/config/playwright';

export default createPlaywrightConfig({
  /* options */
});
```

### TypeScript

Extend from the tsconfig presets:

```json
{
  "extends": "@repo/config/tsconfig/base.json"
}
```

Available presets: `base.json`, `build.json`, `app.json`.

### Oxlint

Convention rules travel with the package. A consuming app extends the preset
and needs no rules block of its own:

```json
{
  "extends": ["./node_modules/@repo/config/oxlint.json"]
}
```

oxlint resolves `extends` as a file path, not a package name, hence the
`node_modules` prefix. The preset loads the plugin, turns
`no-hex-literals`, `no-raw-typography` and `no-parameter-properties` on as
errors, turns `no-chrome-props`, `no-raw-geometry` and `no-child-margin` on
as warnings while their burndowns run, and exempts specs and `tests/` trees,
which assert computed colours, from all but `no-raw-typography` and
`no-parameter-properties`. A project that wants its
own levels keeps the older one-line form,
`{ "jsPlugins": ["@repo/config/oxlint"] }`, and writes its own
rules block. Palette modules (`themes/base.ts`, `themes/accent.ts`,
`*palette*`) are exempt. Comments are not visited, so a JSDoc `#025` is not
a hit. A file no theme token reaches opts out with a `// hex-escape: <reason>`
line comment; `lint` fails that comment unless the spec table
`## Colour-literal escapes` has its file and exact reason, and fails a row
whose comment is gone.

`no-chrome-props` and `no-raw-geometry` ship in the same plugin.
Enable them the same way when you start that burndown. Drawing-file
exceptions come from the spec table `## Drawing files`, not from the code.
`no-raw-geometry` leaves `0` alone.

`no-child-margin` fails a non-zero `margin*` prop, long
or shorthand, on any element nested inside another element's JSX: the parent
owns the gap. `0` is always legal, the outermost element a file renders is
left alone, and slots come from the spec table `## Slot margins`. Run it as
an error over `apps/` and `packages/`, off only for specs and `tests/` trees.

`no-parameter-properties` fails a TypeScript constructor
parameter property, `constructor(readonly hash: Hash)` and its `private`,
`protected`, `public` and `override` spellings. vxrn's native dev bundle
lowers a class to a function and can leave the modifier on that function's
parameter, and rolldown then refuses the whole bundle with `'readonly'
modifier cannot appear on a parameter`. Declare the field and assign it in
the constructor. Run it as an error over the whole tree.

### Lint (node-script checks)

CSS-in-apps, features-twin, silent token no-ops, the size-recipe
pilot, and the size-recipe escape registry run through
`runConventionChecks({ roots })`. Every `sizeRecipeEscape` site, and every
`size-recipe-escape:` comment, must be a row in the spec table
`## Size-recipe escapes` by file and exact reason, and a row whose site is
gone fails too:

```ts
import { runConventionChecks } from '@repo/config/lint';

runConventionChecks({
  roots: { root: process.cwd() },
});
```

Derived from [multiplatform.one](https://multiplatform.one) (Apache-2.0). See the package LICENSE and the repository NOTICE.
