/**
 * A module that throws when it is evaluated. That is its whole job.
 *
 * Design §9.5 asks for a story toggle that "deliberately breaks the bundle so
 * the fallback path is a story rather than a hope". A toggle that only sets a
 * flag would exercise a branch, not the failure — the real failure is a module
 * whose EVALUATION throws inside `await import(...)`, which is what the boot
 * heartbeat of §9.4 layer 3 is built to catch and what the diagnostics panel
 * has to be able to name.
 *
 * SAFE TO SHIP, and `GraphDiagnostics.stories.tsx` is the only importer:
 *
 *  - It is reached exclusively through a dynamic `import()` behind a story
 *    control, so nothing evaluates it unless a human flips the switch.
 *  - The package build EXCLUDES THIS FILE BY NAME, so no compiled copy exists.
 *    Excluding only `*.stories.*` was not enough and the first build proved
 *    it: `tamagui-build` compiles every source file it finds, reachable or
 *    not, and emitted `dist/esm/diagnostics/deliberateBreak.mjs`. The exclude
 *    pattern is the same mechanism that keeps the DOM entry out of `dist`.
 *  - `GraphDiagnostics.spec.tsx` asserts no non-story module under `src/`
 *    imports it, so it cannot quietly acquire a second caller.
 *
 * The message is written to look like the failure it stands in for: the
 * `import.meta` parse error that blanks a WebView with no reachable error
 * boundary (design §9.4).
 */

throw new Error(
  "deliberate break: Cannot use 'import.meta' outside a module (simulated, node-graph diagnostics story)",
);

// TypeScript treats a file with no import or export as a global script, and a
// global script cannot be the target of `import()`. This is what makes the file
// a module; it never runs, because the throw above is unconditional.
