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

export const tableRowStateProps = (opts: {
  selected?: boolean;
  keyboardFocused?: boolean;
  zebraOn?: boolean;
  index?: number;
  pressable?: boolean;
}) => {
  const selected = Boolean(opts.selected);
  const keyboardFocused = Boolean(opts.keyboardFocused);
  const zebra = Boolean(opts.zebraOn) && (opts.index ?? 0) % 2 === 1;
  let rest = '$color1';
  if (selected) {
    rest = '$color4';
  } else if (zebra) {
    rest = tableZebraFill('$color1');
  }
  const hover = selected ? tablePressFill(rest) : '$color3';
  return {
    backgroundColor: rest,
    hoverStyle: { backgroundColor: hover },
    // A pointer press is hovered too, so the press steps off the hover fill.
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- an inactive state must leave the style key absent so Tamagui defaults apply
    ...(opts.pressable ? { pressStyle: { backgroundColor: tablePressFill(hover) } } : {}),
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- an inactive state must leave the ring keys absent so Tamagui defaults apply
    ...(keyboardFocused ? keyboardFocusRingProps : {}),
    'aria-selected': selected ? true : undefined,
    'data-row-selected': selected ? 'true' : 'false',
    'data-row-keyboard-focus': keyboardFocused ? 'true' : 'false',
  };
};

export const tableCellKeyboardProps = (focused: boolean) => ({
  // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- an inactive state must leave the ring keys absent so Tamagui defaults apply
  ...(focused ? keyboardFocusRingProps : {}),
  'data-cell-keyboard-focus': focused ? 'true' : 'false',
});
