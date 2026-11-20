# universal-starter-kit project

Web, iOS and Android from one React + Tamagui tree, with desktop and browser
extension targets inside each product app. This repository is the
[universal-starter-kit](https://github.com/shotcowboystyle/universal-starter-kit/mpo)
monorepo at one commit, pruned to the product apps and services picked at
`mpo init`. `.mpo.json` records the commit and the selection, and `AGENTS.md`
holds the conventions.

## Layout

| Path               | What lives there                                       |
| ------------------ | ------------------------------------------------------ |
| `apps/<name>/`     | Each product app, and the services kept at init        |
| `features/<name>/` | Screens and feature code for the matching app          |
| `packages/`        | Private app packages (`@package/app`, themes, i18n, …) |

The `@repo/*` packages come from the registry.

## Getting started

Prerequisites: Node 22.13+, pnpm 11+ and git.

```sh
pnpm install
pnpm dev            # the first product app (dev:<name> picks one of several)
```

`.env` starts as a copy of `.env.example`.

## Updating

```sh
pnpm exec mpo update    # needs a clean tree; the merge lands uncommitted
git add -A && git commit -m "chore: mpo update"
```

`pnpm exec mpo add-app <name>` adds a product app the same way.
