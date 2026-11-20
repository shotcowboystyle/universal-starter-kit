# universal-starter-kit project

Web, iOS and Android from one React + Tamagui tree, with desktop, browser
extension and VS Code targets inside each product app. This repository is the
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

<!-- service:frappe -->

## Frappe

`apps/frappe` is the dev bench. `make frappe/bootstrap` creates it once, and
`make frappe/dev` starts the services it needs from `docker/compose.yaml` and
serves it on `FRAPPE_PORT` (`http://localhost:8000`), which also proxies the
web dev server same-origin. The apps reach it through `createApp` in
`packages/app/app.tsx` while `FRAPPE_ENABLED=1`.

<!-- /service:frappe -->
<!-- no-service:frappe -->

<!-- markdownlint-disable-next-line MD024 -- alternative to the service:frappe section; only one renders -->
## Frappe

This project runs no Frappe server of its own. The apps keep the Frappe
client: `createApp` in `packages/app/app.tsx` mounts the `FrappeProvider`
while `FRAPPE_ENABLED=1` and talks to `BASE_URL`, or to the `baseURL` passed
in `frappe: { baseURL }`. Point it at a Frappe server.

<!-- /no-service:frappe -->

## Updating

```sh
pnpm exec mpo update    # needs a clean tree; the merge lands uncommitted
git add -A && git commit -m "chore: mpo update"
```

`pnpm exec mpo add-app <name>` adds a product app the same way.
