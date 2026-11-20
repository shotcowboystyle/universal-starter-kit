/**
 * Wrap-and-coalesce for child slots
 * that render into Views. Local copy of the reference remedy in
 * `packages/forms/src/Button/index.tsx` (table-primitives is Layer 1 — it
 * depends only on theme + tamagui, so the helper cannot be imported from
 * forms or components): runs of adjacent bare string/number children
 * coalesce into one concatenated label handed to the slot's own Text
 * wrapper; element children pass through untouched, order preserved.
 */

import type { ReactNode } from 'react';
import { Children } from 'react';

/** Bare string/number children are legal only inside Text. */
export const isBareTextChild = (child: ReactNode): child is string | number =>
  typeof child === 'string' || typeof child === 'number';

const coalesceBareTextRuns = (
  children: ReturnType<typeof Children.toArray>,
  renderLabel: (label: string, key: string) => ReactNode,
): ReactNode[] => {
  const out: ReactNode[] = [];
  let run: string | null = null;
  let runIndex = 0;
  const flushRun = () => {
    if (run !== null && run !== '') {
      out.push(renderLabel(run, `lc50-run-${runIndex}`));
      runIndex += 1;
    }
    run = null;
  };
  for (const child of children) {
    if (isBareTextChild(child)) {
      run = (run ?? '') + String(child);
    } else {
      flushRun();
      out.push(child);
    }
  }
  flushRun();
  return out;
};

/**
 * Wrap ALL bare string/number children of a View-rendering slot: singleton
 * strings/numbers and runs inside arrays go through `renderLabel` (the slot's
 * Text wrapper); pure-element children return unchanged.
 */
export const wrapBareTextChildren = (
  children: ReactNode,
  renderLabel: (label: string, key?: string) => ReactNode,
): ReactNode => {
  if (isBareTextChild(children)) {
    return renderLabel(String(children));
  }
  if (Array.isArray(children)) {
    // oxlint-disable-next-line react/no-react-children -- Children.toArray flattens nested arrays, drops empty nodes and assigns the keys the returned array needs
    const flattened = Children.toArray(children);
    if (flattened.some((child) => isBareTextChild(child))) {
      return coalesceBareTextRuns(flattened, renderLabel);
    }
  }
  return children;
};
