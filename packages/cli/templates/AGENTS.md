# AGENTS.md — conventions for this project

Machine-readable house rules for humans and coding agents. Prefer this file
over reconstructing conventions from history.

## What this repository is

The universal-starter-kit monorepo at one commit, pruned. `.mpo.json` records the
source commit and url, the product apps and the services kept. `mpo update`
merges later monorepo commits in as a three-way merge that keeps your commits;
`mpo add-app <name>` adds a product app. Neither is committed for you.

The published `@repo/*` packages come from the registry at the
semver range in each `package.json`. There is no copy of them here: a change to
one of them is made upstream, in the monorepo, and arrives with the next
`mpo update`.

## Workspace layout

| Path               | Role                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `apps/<name>/`     | Product apps and the services kept at init (keycloak, …)            |
| `features/<name>/` | Feature modules for the matching app (screens, stories, playground) |
| `packages/`        | Private app-integration packages (`@package/*`)                     |

**App ↔ features twin:** every product app `apps/<name>` MUST have
`features/<name>`. Services are exempt in the convention linter; product apps
are not. Prefer feature code in `features/`, thin wiring in `apps/`.

**Delivery targets live INSIDE the product app**, not as sibling shells:
`apps/<name>/routes/` (One web + native), `apps/<name>/tauri/` (webview
desktop shell) and `apps/<name>/webext/` (browser extension), each with a
sibling `vite.config.<target>.ts`. All targets mount the same `features/`
code behind ONE routing layer: One's router API, backed on non-One hosts by the
stack-navigation seam (`@repo/router/seam`).

**Internal deps:** private workspace packages use `workspace:*`;
`@repo/*` use the registry range.

## Which package for what

| Package            | Owns                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `@repo/theme`      | Knobs, presets, intents, recipes, `useResolvedKnobs`                                     |
| `@repo/ui`         | Catalog UI (layouts, surfaces, feedback, …)                                              |
| `@repo/forms`      | Fields, Form, InputParts, field contracts, form color ramps                              |
| `@repo/table`      | DataTable, cells, filters, URL table state                                               |

`table` and `forms` know nothing of Frappe.

### Import rules (enforced)

1. **No raw `tamagui`** in `apps/`, `features/` or `packages/`: import
   `@repo/ui`, `@repo/forms` or
   `@repo/theme` instead (`oxlintrc.json`, no-restricted-imports).
2. **No `*.css` files in `apps/*`** (except ignored bench/vendor trees): styling
   goes through Tamagui + knobs.
3. **No hex color literals in `apps/`, `packages/` or `features/`**: use
   theme tokens (`$color10`, semantic ramps, knob recipes). A file no token
   reaches (GTK widget CSS, a content script, Expo build config) opts out with
   a `// hex-escape: <reason>` comment that says why.

Run: `pnpm lint` (oxlint + `scripts/lint-conventions.mjs`).

## Knobs system (canonical)

Structural styling (radius, space, elevation, typography, animation) is
independent of Tamagui color themes. `useResolvedKnobs` comes from
`@repo/theme`.

```tsx
const { knobProps, control, text, elevation } = useResolvedKnobs({
  intent, // "error" | "accent" | "warning" | "success"
  component: 'Button',
  compact,
});

<View
  {...knobProps.surface}
  {...knobProps.borderRadius}
  {...knobProps.panelPadding}
  {...knobProps.gap}
  {...knobProps.body}
  hoverStyle={{ ...control.hoverKnobProps }}
  pressStyle={{ ...control.pressKnobProps }}
  focusVisibleStyle={{ ...control.focusVisibleKnobProps }}
/>;
```

Rules:

- Always spread complete `knobProps.*` fragments; never cherry-pick resolved tokens.
- `resolveKnobs()` is the only canonical mapping from abstract knobs → Tamagui props.
- Consumer `{...props}` come last (explicit eject), not internal defaults that fight recipes.
- Presets cascade (`<Preset preset="…" theme="…">`); nested `overrides` merge by key.
- One knob flip restyles the screen, or the knob is broken.

## Forms contract

- Initialize with `useFormField()` + `useResolvedValidators()`.
- Three-branch render: skeleton → standalone → form-integrated (`<Field>`).
- Canonical change prop is `onChange(value)`. Deprecated aliases may fire but
  must not be the only path.
- Field slot order: Label → Hint → Error → Control; error replaces helper in one slot.
- Use the form color ramps exported by `@repo/forms`
  (`formCommonColors`, `formDropzoneColors`); no hardcoded color tokens.
- Fields auto-detect `useIsInTableCell()` and render chromeless inside cells.
- Capability surfaces (camera, geo, …) MUST preflight before mount.

## Table contract

- `@repo/table` is framework-agnostic display/filter/sort/paginate.
- Cell editors larger than the anchor use popover (web) / sheet (native); never
  grow the row. Editor popups dismiss only on dismissal intent.
- Frappe integration does not belong in `table`.
- Child-table / TableInput follow the same field `onChange` contract as forms.

## Screen data states

Every screen-level data fetch, not only Frappe, MUST render loading, empty,
error and ready through `AsyncBoundary`, `EmptyState` and `Skeleton` from
`@repo/ui`. A bare
`error ? <Paragraph color="$color11">` branch is a defect. Empty ≠ error ≠
loading.

## Tooling

| Command                 | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `pnpm dev`              | The first product app's dev server (`dev:<name>` when several) |
| `pnpm build`            | Build every workspace package except the apps                  |
| `pnpm lint`             | oxlint (incl. convention rules) + structural convention checks |
| `pnpm lint:conventions` | Structural checks only (css twin, features twin)               |
| `pnpm format`           | oxfmt                                                          |
| `pnpm ci:local`         | format + lint + typecheck + build + test + verify + tree-clean |
| `pnpm doctor:npmrc`     | Check registry auth and the installed workspace linker         |

Use **oxlint / oxfmt**, not ESLint / Prettier. Per-app targets are
`make <name>/<target>` from the root `Makefile`.

Install layout settings live in `pnpm-workspace.yaml`, including
`nodeLinker: hoisted`. `@repo/*` resolves
from npmjs, the default registry, so an install needs no token.
`pnpm doctor:npmrc` reports missing or empty auth
as advisory and fails if the installed tree records a different linker from the
workspace; an existing isolated tree needs `pnpm install` to repair its layout.

## Coding defaults

- Named exports only; cut dead/legacy aliases unless a task explicitly needs them.
- Cross-platform: shared code first; `*.native.tsx` / `*.web.tsx` only when required.
- Stories and tests live next to the component / feature they cover.
