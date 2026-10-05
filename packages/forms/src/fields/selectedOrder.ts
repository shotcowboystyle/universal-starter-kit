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
export function orderOptionsBySelected<T extends OptionLike>(
  options: readonly T[],
  selected: readonly string[],
  selectedOrder: SelectedOrder = 'selected-first',
): T[] {
  if (selectedOrder === 'stable' || selected.length === 0) {
    return options as T[];
  }
  const selectedSet = new Set(selected);
  const first = options.filter((o) => selectedSet.has(o.value)).sort((a, b) => a.label.localeCompare(b.label));
  const rest = options.filter((o) => !selectedSet.has(o.value));
  return [...first, ...rest];
}
