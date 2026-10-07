export type SelectedOrder = 'selected-first' | 'stable';

interface OptionLike {
  value: string;
  label: string;
}

/**
 * Order a multi-select option list.
 *
 * `selected-first` (default) pins chosen rows to the top, sorted alphabetically
 * among themselves; unselected rows keep their original relative order.
 * `stable` never rearranges.
 */
export const orderOptionsBySelected = <T extends OptionLike>(
  options: readonly T[],
  selected: readonly string[],
  selectedOrder: SelectedOrder = 'selected-first',
): T[] => {
  if (selectedOrder === 'stable' || selected.length === 0) {
    // SAFETY: a readonly input is handed back as-is and only ever read by callers; T[] is the declared return shape.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the unchanged input is returned without copying
    return options as T[];
  }
  const selectedSet = new Set(selected);
  const first = options.filter((o) => selectedSet.has(o.value)).toSorted((a, b) => a.label.localeCompare(b.label));
  const rest = options.filter((o) => !selectedSet.has(o.value));
  return [...first, ...rest];
};
