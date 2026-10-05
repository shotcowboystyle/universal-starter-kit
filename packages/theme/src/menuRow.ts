/**
 * ONE-IMPLEMENTATION — the shared menu-row frame geometry.
 *
 * One geometry recipe for every menu/listbox row (DropdownMenu `ItemRow`,
 * Select `SelectRow`, MentionInput `MentionSuggestionItem`): the row spans
 * the full overlay width (edge-to-edge highlight, SP-EDGE), owns its
 * horizontal padding, and keeps flat corners (the overlay container clips to
 * the radius knob). RING-ANATOMY: the highlight
 * fill and the focus ring are orthogonal; consumers paint
 * `ensureFocusVisibleRing({ outlineOffset: -2 })` on `focusVisibleStyle`
 * (inset so the overlay clip does not sever it). Do not delete the ring.
 *
 * It lives in `@repo/theme` (not `components`) because the
 * dependency direction is `components` → `forms` → `theme`; the two forms
 * consumers cannot import `components` without a cycle.
 *
 * Deliberately NOT part of the recipe — each consumer owns it, by design:
 * - color ramps: menus highlight with `componentColors.interactive.*`,
 *   form fields with `formInputColors.background.*` (package-boundary rule);
 * - cursor: `pointer` for menu items, `default` for listbox options;
 * - vertical sizing: height/minHeight from the size token, or row padding;
 * - in-row gap and the state-variant model (selected/active/disabled).
 */
export const menuRowFrame = {
  flexDirection: 'row',
  alignItems: 'center',
  width: '100%',
  paddingHorizontal: '$3',
  borderRadius: 0,
  userSelect: 'none',
  backgroundColor: 'transparent',
} as const;
