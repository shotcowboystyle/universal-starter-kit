/**
 * The var layer as one `<style>` tag, plus the adapter that reads a live
 * Tamagui theme into `GraphThemeAccess`.
 *
 * Design 6.2 names this file `GraphVars.tsx`, next to `graph-vars.ts`. Those two
 * are the SAME module specifier on a case-insensitive filesystem, and the
 * resolver's extension order (.ts before .tsx) means `import … from
 * "./GraphVars"` silently returns `graph-vars.ts` — measured on macOS, where
 * `head ./GraphVars.ts` prints the pure module. The COMPONENT keeps its design
 * name; only the file gains a suffix, so `graph-vars.ts` and the lint check's
 * exemption path are unchanged.
 *
 * Design: docs/design/node-graph-editor.md 6.2.
 */

import type { ResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { getVariable, useTheme as useTamaguiTheme } from 'tamagui';

import { graphCssVars } from './graph-vars';
import type { GraphCssVarsOptions, GraphThemeAccess } from './graph-vars';

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
   * `graph-css.test.ts` pins that behaviour rather than leaving it as a comment.
   */
  readonly revision: number;
  /** Scope selector. Defaults to the graph root class. */
  readonly selector?: string;
}

/** A CSS custom-property block, deterministic in key order so a diff is readable. */
export const graphVarsSheet = (
  vars: Readonly<Record<string, string>>,
  scheme: 'light' | 'dark',
  selector: string,
): string => {
  const declarations = Object.keys(vars)
    .toSorted()
    .map((name) => `  ${name}: ${vars[name]};`)
    .join('\n');
  return `${selector} {\n  color-scheme: ${scheme};\n${declarations}\n}\n`;
};

export const GraphVars = ({ vars, scheme, revision, selector }: GraphVarsProps): ReactNode => {
  const scope = selector ?? `.${graphRootClassName}`;
  // biome-ignore-start: the revision IS the dependency — see the prop's doc.
  // oxlint-disable-next-line react/exhaustive-deps -- the revision IS the dependency; see the prop's doc
  const sheet = useMemo(() => graphVarsSheet(vars, scheme, scope), [revision, scope]);
  // biome-ignore-end
  return (
    <style
      data-mpo-graph-vars={String(revision)}
      suppressHydrationWarning>
      {sheet}
    </style>
  );
};

/**
 * Read a live Tamagui theme into the two forms `graphCssVars` needs.
 *
 * The CSS form comes from the Variable itself (`var(--…)` on web) rather than
 * from a reconstructed prefix, so nothing here has to know how Tamagui names
 * its custom properties. The raw form is the literal value, and is used only by
 * the two blended entries.
 */
/** One theme slot as Tamagui hands it back: a Variable, a raw literal, or nothing. */
type ThemeSlot = string | { readonly variable?: string; readonly val?: unknown } | null | undefined;

/* oxlint-disable anti-slop/no-runtime-typeof -- dispatch over the runtime shapes a Tamagui theme slot can take (Variable object vs raw literal) */
const slotCss = (value: NonNullable<ThemeSlot>): string | undefined => {
  const variable = typeof value === 'string' ? undefined : value.variable;
  if (typeof variable === 'string' && variable !== '') {
    return variable;
  }
  // SAFETY: getVariable accepts a Variable or a raw value and returns its CSS form; `value` is one of those by ThemeSlot.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- getVariable's parameter type is Tamagui-internal
  const resolved: unknown = getVariable(value as never);
  return typeof resolved === 'string' ? resolved : undefined;
};

const slotRaw = (value: NonNullable<ThemeSlot>): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value.val === 'string' ? value.val : undefined;
};
/* oxlint-enable anti-slop/no-runtime-typeof */

export const useGraphThemeAccess = (): GraphThemeAccess => {
  const theme = useTamaguiTheme();
  return useMemo(() => {
    // SAFETY: a Tamagui theme is a string-keyed table of ThemeSlot entries; an absent key reads as undefined, handled below.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- Tamagui types the theme by its generated key names, not arbitrary strings
    const table = theme as unknown as Readonly<Record<string, ThemeSlot>>;
    return {
      css: (key: string) => {
        const value = table[key];
        return value == null ? undefined : slotCss(value);
      },
      raw: (key: string) => {
        const value = table[key];
        return value == null ? undefined : slotRaw(value);
      },
    };
  }, [theme]);
};

/** `graphCssVars` against the live theme. */
export const useGraphCssVars = (resolved: ResolvedKnobs, options?: GraphCssVarsOptions): Record<string, string> => {
  const theme = useGraphThemeAccess();
  const pointer = options?.pointer;
  return useMemo(() => graphCssVars(resolved, theme, { pointer }), [resolved, theme, pointer]);
};
