/**
 * DataTable chrome geometry and intent helpers.
 *
 * Size numbers come from LC-65 `sizeRecipeForToken` (no handwritten 14/40).
 * Row `_intent` rides Tamagui boolean theme props on the real row host —
 * never a Theme wrapper inside <table> (invalid HTML).
 */

import { sizeRecipeForToken } from '@repo/theme';

export type DataTableIntentName = 'accent' | 'error' | 'warning' | 'success';

export const resolveDataTableIntent = (flags: {
  accent?: boolean;
  error?: boolean;
  warning?: boolean;
  success?: boolean;
}): DataTableIntentName | undefined => {
  if (flags.accent) {
    return 'accent';
  }
  if (flags.error) {
    return 'error';
  }
  if (flags.warning) {
    return 'warning';
  }
  if (flags.success) {
    return 'success';
  }
  return undefined;
};

export const rowIntentProps = (
  rowData: { _intent?: unknown } | undefined,
): Partial<Record<DataTableIntentName, true>> => {
  const intent = rowData?._intent;
  if (intent === 'accent' || intent === 'error' || intent === 'warning' || intent === 'success') {
    return { [intent]: true };
  }
  return {};
};

export const dataTableChrome = (sizeToken: string) => {
  const recipe = sizeRecipeForToken(sizeToken);
  return {
    recipe,
    iconPx: recipe.iconSize,
    rowPx: recipe.height,
    selectionCol: recipe.height,
    expandCol: recipe.iconSize * 2,
    rowNumberCol: Math.round(recipe.height * 1.25),
    deleteCol: Math.round(recipe.height * 1.5),
    indent: recipe.gap,
  };
};

export type DataTableChrome = ReturnType<typeof dataTableChrome>;
