/**
 * Native tier of the canonical mermaid renderer (LC-16).
 *
 * The web tier's `import("mermaid")` is deliberately ABSENT here. mermaid
 * needs a DOM — the web module already refuses without one — so on native
 * that import can only ever resolve and then bail. Keeping it in the native
 * source costs a whole graph: `import()` is not tree-shakable, so every
 * native bundler that reaches this module has to parse mermaid and emit its
 * chunk. mermaid's published chunks put "use strict" inside functions with
 * non-simple parameter lists, which is illegal ESM, so rolldown fails the
 * build outright (`one build --platform ios` died with ten PARSE_ERRORs and
 * produced no bundle — measured shipping the Lookout iOS app, MPO-10).
 *
 * Because this package's barrel re-exports this module, ANY native consumer
 * that reaches the barrel inherited that failure. Dropping the
 * import here takes mermaid off the native graph for all of them at once.
 *
 * The contract is unchanged: same exports, same result shape, and the same
 * "requires a DOM" error the web tier returns when `document` is missing.
 * `MermaidBlock.native.tsx` already renders diagram source as a code block,
 * so nothing on native regresses.
 *
 * Types are declared locally rather than re-exported from the web tier:
 * tamagui-build rewrites relative specifiers to their `.native` sibling, so
 * `from "./render-mermaid-diagram"` would resolve back to this file. Same
 * idiom as `MermaidBlock.native.tsx`, which redeclares its own props.
 */

export interface MermaidRenderOptions {
  /** Color scheme for mermaid's built-in theming (default "light") */
  scheme?: 'light' | 'dark';
  /** Font family passed to mermaid's theme config */
  fontFamily?: string;
}

export type MermaidRenderResult = { ok: true; svg: string } | { ok: false; error: string };

/** Same message the web tier returns when it cannot find a `document`. */
const NO_DOM = 'Mermaid diagrams require a DOM environment';

export const renderMermaidDiagram = async (
  _code: string,
  _options: MermaidRenderOptions = {},
): Promise<MermaidRenderResult> => ({ ok: false, error: NO_DOM });

/** Test seam parity with the web tier — nothing is cached here. */
export const resetMermaidForTesting = (): void => {
  // Intentionally empty: the native tier holds no engine cache or init state to reset.
};
