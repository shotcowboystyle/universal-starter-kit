# @repo/cli

The universal-starter-kit command line: scaffold a project from the monorepo
(`mpo init` / `create-universal-starter-kit-app`), merge the monorepo's changes back
in (`mpo update`), and drive the dev environment, Frappe and E2E workflows.

## Install

```bash
pnpm add -g @repo/cli
# or run the scaffolder without installing:
npx --package=@repo/cli create-multiplatform-app my-app
```

Two binaries: **`mpo`** (full CLI) and **`create-multiplatform-app`**
(`mpo init` only).

## Scaffold a project

```bash
mpo init my-app                          # prompts for the singleton apps to keep
mpo init my-app --service frappe --yes   # non-interactive
mpo init my-app --app admin              # two product apps: my-app and admin
cd my-app
pnpm dev
```

A project is the universal-starter-kit monorepo at one commit, pruned:

- `public/` is gone; `@repo/*` come from npmjs, the default
  registry, at `^<cli version>` (`--mpo-version` overrides the range).
- The singleton apps are ethereum, frappe, keycloak, solana, storybook,
  storybook-expo, sui, uxpin and vocs; only the ones asked for stay.
  `--frappe` and `--keycloak` are shorthands for `--service`.
- Without `--service frappe` the project keeps the Frappe client
  (`createApp`'s wiring, the `# frappe client` keys in `.env.example`) and
  drops the bench: `apps/frappe`, its `.env` keys, and the `docker/compose.yaml`
  services in the `frappe` profile with the volumes only they used.
- Without `--service keycloak` the keycloak compose service, `postgres` and
  its `.env` keys, the `docker-bake.hcl` target and the `docker/Makefile`
  cert block go. With neither service, `docker/compose.yaml` is
  `services: {}` and there is no `pnpm backend`.
- `apps/one`, the One platform app, becomes `apps/my-app` (package
  `@app/my-app`, app.config slug and scheme, bundle id, tauri identifier, the
  `Makefile` `my-app/%` rules, `.vscode`, `.gitignore`), with
  `features/my-app` beside it. Every `--app` is another copy. The
  delivery targets (`tauri/`, `webext/`, the Frappe SPA)
  ride inside each product app; there is nothing to add for them.
- `packages/themes` is the app's one theme config, and the app ships its
  declared theme subset (`subset.ts`, `subset.tamagui.config.ts`): 340 of the
  1,580 house themes. A narrow surface ships only the themes it can enter,
  because every theme is CSS in the served document;
  `packages/themes/README.md` has the measurement and what to do when a
  surface needs a hue the subset drops.
- `docs/`, `deploy/`, `.changeset`, `typedoc.json` and `.gitlab-ci.yml` are
  monorepo concerns and go too. `AGENTS.md` is the consumer copy
  (`templates/AGENTS.md`), which names only paths and scripts the project has.
  `README.md` is the consumer copy too (`templates/README.md`): a block
  between `<!-- service:<app> -->` and `<!-- /service:<app> -->` stays only
  when that service was kept, a `no-service:<app>` block only when it was not.
- `.mpo.json` records the source commit and the selection; `mpo update` and
  `mpo add-app` read it.

The commit comes from the CLI itself: a published build carries the monorepo
commit it was cut from (`lib/source.json`); a CLI running inside a monorepo
checkout uses that checkout's `HEAD`; a build without a stamp falls back to
the `v<version>` tag, then `main`, and says so. `--source <path|url>` and
`--checkout <ref>` override it.

### Into an existing directory

```bash
cd my-python-service
mpo init --into                          # product app named after the directory
mpo init --into --app dashboard .        # or name it
```

Paths that already exist are kept byte for byte, listed, and pinned in
`.updateignore` so no later update rewrites them. Nothing is committed; the
directory is yours to commit. `mpo adopt` is not the way in for this: it only
registers hand-copied piece files (see below).

Options: `--app <name>` (repeatable), `--service <name>` (repeatable),
`--frappe`, `--keycloak`, `--into`, `--source`, `--checkout`, `--mpo-version`,
`--skip-install`, `--skip-git`, `--yes`, `--verbose`.

## Update a project

```bash
mpo update            # requires a clean tree
git status            # the merge sits in the index and worktree
git add -A && git commit -m "chore: mpo update <old> → <new>"
```

A three-way merge: **base** is the scaffold at the commit recorded in
`.mpo.json` with the recorded apps and services, **ours** is your `HEAD`,
**theirs** is the same scaffold at the commit this CLI was built from (or
`--source`/`--checkout`). Your commits are preserved, the monorepo's changes
land as the diff, every product app receives the One app's changes, and
nothing is committed. Conflicts land with normal markers; `pnpm install` runs
on a clean merge (`--skip-install` to skip it).

`.updateignore` entries (exact files or directory prefixes, not globs) and
`pnpm-lock.yaml` stay pinned to your version. Dependency-range drift in
`package.json` files resolves to the newer minimum.

**Idempotency:** update, commit, update again: zero changes.

## Add a product app

```bash
mpo add-app kiosk
```

Scaffolds `apps/kiosk` + `features/kiosk` from `apps/one` at the recorded
commit and merges only that in, uncommitted like `mpo update`.

## Adopt hand-copied pieces

A project that was never scaffolded and hand-copied a delivery target from
`templates/pieces` (webext, tauri, keycloak wiring, the Frappe dev bench as
`frappe-bench`) has no provenance:

```bash
mpo adopt --webext --name my-app   # clean git tree; at least one piece
```

Adoption writes `.mpo.json` (template `"none"` + pieces) and seeds
`.updateignore`; it changes no project file. The first `mpo update` reconciles
the piece files from an empty base (diffs and conflicts are expected); later
updates merge three-way against the pieces of the recorded CLI version. An
adoption recorded while the `frappe` piece still carried the bench gains
`frappe-bench` on its next update, so the bench stays.

A project from the retired template scaffolder (`.mpo.json` with `template:
"universal"` or `"app"`) has no reproducible base left: its next `mpo update`
merges the monorepo's One app in from an empty base once, then it is
clone-derived.

## The scaffold script

`scripts/scaffold.sh` is POSIX sh and needs only git, node and a shell:

```bash
sh scripts/scaffold.sh [--app <name>]... [--service <name>]... [--mpo-version <range>] [--into] \
  <path-or-url> <ref> <target>
```

## Other commands

| Command                       | Purpose                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `mpo wait`                    | Wait for a service (frappe, postgres, mariadb, keycloak) to be ready              |
| `mpo frappe bootstrap`        | Bootstrap the Frappe development environment                                      |
| `mpo frappe dev`              | Start the Frappe development server                                               |
| `mpo frappe bench -- <args>`  | Run a bench command                                                               |
| `mpo frappe clean`            | Clean Frappe bench artifacts                                                      |
| `mpo frappe types <doctype…>` | Emit doctype TypeScript types from getdoctype; `--check -o <file>` fails on drift |
| `mpo build`                   | Run the build command                                                             |
| `mpo test`                    | Run tests (E2E flags: `--up-only`, `--down`, `--filter`, …)                       |

## Development

`pnpm --filter @repo/cli test` runs the vitest specs: the
provenance and merge units, and `update-app.test.ts`, which scaffolds from
this checkout at `HEAD`, updates from a second clone that moved ahead, and
adds an app. `make -C packages/cli test/bats` runs `tests/*.bats` against
`scripts/scaffold.sh` directly (needs `bats`). `pnpm build` stamps
`lib/source.json` from `git rev-parse HEAD` (`MPO_SOURCE_SHA` /
`MPO_SOURCE_URL` override it), unless `HEAD` carries another CLI version;
the release pack stamps the version commit.

## What it must not do

- A scaffolded project never carries `public/` or `workspace:*` ranges on
  `@repo/*`; consumers upgrade via the registry
  (`pnpm update "@repo/*"`) and `mpo update`.

## License

Apache-2.0
