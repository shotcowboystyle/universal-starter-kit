/**
 * LC-82 TEXT-RIDES-TEXT (catalog arm) — wrap-and-coalesce for child slots
 * that render into Views. Local copy of the reference remedy in
 * `public/forms/src/Button/index.tsx` (also mirrored in
 * `public/components/src/shared/textRidesText.ts` — markdown consumes
 * components through its published barrel, so the helper cannot be imported
 * cross-package): runs of adjacent bare string/number children coalesce into
 * one concatenated label handed to the slot's own Text wrapper; element
 * children pass through untouched, order preserved.
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
  let run = '';
  let runIndex = 0;
  const flushRun = () => {
    if (run !== '') {
      out.push(renderLabel(run, `lc50-run-${runIndex}`));
      runIndex += 1;
    }
    run = '';
  };
  for (const child of children) {
    if (isBareTextChild(child)) {
      run += String(child);
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
    // oxlint-disable-next-line react/no-react-children -- toArray flattens nested arrays and drops null/boolean holes, which the run coalescing relies on
    const flattened = Children.toArray(children);
    if (flattened.some(isBareTextChild)) {
      return coalesceBareTextRuns(flattened, renderLabel);
    }
  }
  return children;
};
