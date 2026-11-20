# @repo/node-graph

A node graph editor. React Flow drives the canvas on web; the nodes are
Tamagui and resolve their own knobs, so a graph node looks like the rest of the
house. On native the whole canvas rides an Expo DOM component.

Design: `docs/design/node-graph-editor.md`. Build plan:
`docs/design/node-graph-editor-plan.md`. Ticket MPO-191, milestone 1 MPO-210.

## Layout

- `src/model/` — no React, no DOM, no `@xyflow`. Its own export condition, so a
  server, a CLI or the CI bench can import it alone.
- `src/react-flow/xy.ts` — **the only `@xyflow` import site**, enforced by
  `no-restricted-imports` in `oxlintrc.json`.
- `src/knobs/`, `src/theme/` — the knob envelope and the `--xy-*` token bridge.
- `src/nodes/`, `src/edges/` — the Tamagui node and the four typed edge kinds.
- `src/dom/`, `src/native/` — the Expo DOM entry and its native host.
- `metro/index.js` — `withNodeGraph(config)`, plain CJS, no build step.

Only `.native.*` twins, never `.web.*`. MPO-192's ruling stands: a `.web.ts`
twin replaces the shared file in One's Vite client build exactly as it does
under Metro.

## The token bridge

React Flow reads every paint through `var(--xy-thing, var(--xy-thing-default))`.
`src/theme/graph-vars.ts` sets the non-default layer from `ResolvedKnobs` plus
the Tamagui theme, so the library stylesheet is never edited and no specificity
war is possible. 28 of the 35 settable names are mapped; the 7 `--xy-node-*`
names are allowlisted with reasons, because they bind only to React Flow's four
built-in node classes and a Tamagui node carries none of them.

Two arms keep it honest. `graph-vars.test.ts` re-derives the vocabulary from the
INSTALLED `@xyflow/react/dist/style.css` on every run, so an upgrade that adds a
name fails here; and `checkGraphVarsCoverage()` in `public/config/lint.mjs`
fails `pnpm lint` on a `.react-flow__` selector anywhere under a package's
`src`, so hand-written React Flow CSS has exactly two homes: the map, and this
package's `css/graph.css`.

`GraphVars` (the `<style>` component) lives in `src/theme/GraphVarsStyle.tsx`,
not the design's `GraphVars.tsx`. On a case-insensitive filesystem that name and
`graph-vars.ts` are the same module specifier, and the resolver's `.ts`-before-
`.tsx` order makes `import … from "./GraphVars"` silently return the pure map.
The exported component keeps its design name.

## Upgrading @xyflow/react

`xy.ts` is the one reconciliation site, which is what makes an upgrade a
bounded job:

1. Bump the range in `package.json`.
2. `pnpm -F @repo/node-graph test` — `xy.test.ts` fails when a
   re-exported name is gone or the installed version leaves the declared range.
3. Reconcile `src/react-flow/xy.ts` and `src/react-flow/use-graph-controller.ts`.
4. `pnpm -F @repo/node-graph bench`, re-run the device recipe,
   update the committed baseline.
5. Record the numbers and the version on MPO-191.

## Not landed yet

Milestone 1 is the web editor. Three things the design declares that this
package does not carry yet, each with the reason:

- **`./layout-elk`** — decision D2 in the build plan. `elkjs` is
  `EPL-2.0 OR GPL-3.0-or-later` against mpo's Apache-2.0 and Clay has not
  ruled. Until he does the subpath is not declared, because an export whose
  target cannot land is exactly what `checkMetroSubpathFallbacks` exists to
  catch. Dagre is the only engine.
- **`@dagrejs/dagre` and `zustand` as direct dependencies** — milestones 4 and
  2 respectively. `zustand` is pinned at `4.5.7` when it lands, because the
  Metro fix in design §9.2 is version-shaped.
- **`node scripts/build-layout-worker.mjs` in the `build` script** — the
  generator is milestone 4. It goes back in front of `tamagui-build` when
  `src/layout/worker.generated.ts` lands.
- **`GraphFaces`** — the `@font-face` block the envelope's `fonts` array feeds
  is task 2.5. `KnobEnvelopeProvider` therefore rebuilds the knob stack but not
  the faces, and `envelope.fonts` is empty until then.
- **the GraphPort `::after` hit region** — task 1.9 adds it to `css/graph.css`
  beside the four touch rules that are there now.
