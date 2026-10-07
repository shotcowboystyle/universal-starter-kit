/**
 * The var layer as one `<style>` tag, plus the adapter that reads a live
 * Tamagui theme into `GraphThemeAccess`.
 *
 * Design 6.2 names this file `GraphVars.tsx`, next to `graphVars.ts`. Those two
 * are the SAME module specifier on a case-insensitive filesystem, and the
 * resolver's extension order (.ts before .tsx) means `import … from
 * "./GraphVars"` silently returns `graphVars.ts` — measured on macOS, where
 * `head ./GraphVars.ts` prints the pure module. The COMPONENT keeps its design
 * name; only the file gains a suffix, so `graphVars.ts` and the lint check's
 * exemption path are unchanged.
 *
 * Design: docs/design/node-graph-editor.md 6.2.
 */

import type { ResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { getVariable, useTheme as useTamaguiTheme } from 'tamagui';

import { graphCssVars } from './graphVars';
import type { GraphCssVarsOptions, GraphThemeAccess } from './graphVars';

/**
 * The class the graph root carries; every rule in `css/graph.css` is scoped to it.
 *
 * `mp-graph`, not `mp-graph-root`: design 7.1 and 7.5 write the selectors as
 * `.mp-graph .react-flow__handle` and `.mp-graph .react-flow__pane`, and the
 * port rules landed by task 1.9 use that prefix. One name, and it is the
 * design's. Nothing outside this constant may spell it.
 */
export const graphRootClassName = 'mp-graph';

export interface GraphVarsProps {
  /** The `--xy-*` / `--mpo-graph-*` layer, from `graphCssVars` or straight off the envelope. */
  readonly vars: Readonly<Record<string, string>>;
  readonly scheme: 'light' | 'dark';
  /**
   * The envelope's revision. The sheet is rebuilt on THIS and nothing else:
   * `vars` is derived from the envelope, so its revision is the authority on
   * whether anything moved, and a fresh `vars` object identity on every render
   * would otherwise re-serialize the whole sheet at 60 Hz during a drag.
   * `graphCss.spec.ts` pins that behaviour rather than leaving it as a comment.
   */
  readonly revision: number;
  /** Scope selector. Defaults to the graph root class. */
  readonly selector?: string;
}

/** A CSS custom-property block, deterministic in key order so a diff is readable. */
export function graphVarsSheet(
  vars: Readonly<Record<string, string>>,
  scheme: 'light' | 'dark',
  selector: string,
): string {
  const declarations = Object.keys(vars)
    .sort()
    .map((name) => `  ${name}: ${vars[name]};`)
    .join('\n');
  return `${selector} {\n  color-scheme: ${scheme};\n${declarations}\n}\n`;
}

export function GraphVars({ vars, scheme, revision, selector }: GraphVarsProps): ReactNode {
  const scope = selector ?? `.${graphRootClassName}`;
  // biome-ignore-start: the revision IS the dependency — see the prop's doc.
  // oxlint-disable-next-line exhaustive-deps
  const sheet = useMemo(() => graphVarsSheet(vars, scheme, scope), [revision, scope]);
  // biome-ignore-end
  return (
    <style
      data-mpo-graph-vars={String(revision)}
      suppressHydrationWarning>
      {sheet}
    </style>
  );
}

/**
 * Read a live Tamagui theme into the two forms `graphCssVars` needs.
 *
 * The CSS form comes from the Variable itself (`var(--…)` on web) rather than
 * from a reconstructed prefix, so nothing here has to know how Tamagui names
 * its custom properties. The raw form is the literal value, and is used only by
 * the two blended entries.
 */
export function useGraphThemeAccess(): GraphThemeAccess {
  const theme = useTamaguiTheme();
  return useMemo(() => {
    const read = (key: string): unknown => (theme as unknown as Record<string, unknown>)[key];
    return {
      css: (key: string) => {
        const value = read(key);
        if (value == null) {
          return;
        }
        const { variable } = value as { variable?: string };
        if (typeof variable === 'string' && variable) {
          return variable;
        }
        const resolved = getVariable(value as never);
        return typeof resolved === 'string' ? resolved : undefined;
      },
      raw: (key: string) => {
        const value = read(key);
        if (value == null) {
          return;
        }
        if (typeof value === 'string') {
          return value;
        }
        const { val } = value as { val?: unknown };
        return typeof val === 'string' ? val : undefined;
      },
    };
  }, [theme]);
}

/** `graphCssVars` against the live theme. */
export function useGraphCssVars(resolved: ResolvedKnobs, options?: GraphCssVarsOptions): Record<string, string> {
  const theme = useGraphThemeAccess();
  const pointer = options?.pointer;
  return useMemo(() => graphCssVars(resolved, theme, { pointer }), [resolved, theme, pointer]);
}
