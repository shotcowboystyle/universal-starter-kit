/**
 * LC-71 RING-ANATOMY for table rows and cells.
 *
 * Two channels, never shared: selected = fill; keyboard focus = one inset
 * ring on the perceived control (the row when the row is the tab stop, the
 * cell when Excel-mode keyboard nav is on the cell).
 */

import { tablePressFill, tableZebraFill } from '@repo/table-primitives';
import { ensureFocusVisibleRing, keyboardFocusRingProps } from '@repo/theme';

export const tableRowFocusVisibleStyle = ensureFocusVisibleRing({ outlineOffset: -2 });

export function tableRowStateProps(opts: {
  selected?: boolean;
  keyboardFocused?: boolean;
  zebraOn?: boolean;
  index?: number;
  pressable?: boolean;
}): Record<string, unknown> {
  const selected = Boolean(opts.selected);
  const keyboardFocused = Boolean(opts.keyboardFocused);
  const zebra = Boolean(opts.zebraOn) && (opts.index ?? 0) % 2 === 1;
  const rest = selected ? '$color4' : zebra ? tableZebraFill('$color1') : '$color1';
  const hover = selected ? tablePressFill(rest) : '$color3';
  return {
    backgroundColor: rest,
    hoverStyle: { backgroundColor: hover },
    // A pointer press is hovered too, so the press steps off the hover fill.
    ...(opts.pressable ? { pressStyle: { backgroundColor: tablePressFill(hover) } } : {}),
    ...(keyboardFocused ? keyboardFocusRingProps : {}),
    'aria-selected': selected ? true : undefined,
    'data-row-selected': selected ? 'true' : 'false',
    'data-row-keyboard-focus': keyboardFocused ? 'true' : 'false',
  };
}

export function tableCellKeyboardProps(focused: boolean): Record<string, unknown> {
  return {
    ...(focused ? keyboardFocusRingProps : {}),
    'data-cell-keyboard-focus': focused ? 'true' : 'false',
  };
}
