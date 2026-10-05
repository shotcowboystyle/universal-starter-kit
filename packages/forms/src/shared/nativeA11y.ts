/**
 * The accessibility props a choice control needs on React Native.
 *
 * Two things make this necessary rather than decorative. A styled View is not
 * an accessibility element on iOS, so a control that never sets `accessible`
 * is absent from the tree however correctly it draws. And tamagui does not map
 * `aria-*` onto React Native's accessibility props, so every web attribute a
 * component already carries — `aria-label`, `aria-checked`, `role` — is inert
 * on a device.
 *
 * Measured on a Release iphonesimulator build against 7.7.6: RadioGroup's
 * options came back as bare `StaticText`, ToggleGroup contributed nothing at
 * all.
 */

/**
 * What the control MEANS: one-of-N, or one of several independent choices.
 * It is not what gets sent to the platform — see `nativeChoiceRole`.
 */
export type ChoiceKind = 'radio' | 'checkbox';

/**
 * MEASURED, not chosen. `accessibilityRole: "radio"` (and `"checkbox"`) takes
 * the element OUT of the iOS accessibility tree entirely on RN 0.83 / iOS 26.2
 * — worse than the defect, because at least the sibling label used to be
 * there. `"button"` puts it in, and the selected/checked state rides on
 * `accessibilityState` where a reader actually finds it.
 *
 * tamagui's own RadioGroup.Item already sets `role: "radio"` on native, and RN
 * gives `role` precedence over `accessibilityRole`, so overriding BOTH is what
 * makes the difference. Setting only `accessibilityRole` leaves the element
 * hidden.
 */
const nativeChoiceRole = 'button' as const;

export interface ChoiceA11yProps {
  accessible: true;
  role: typeof nativeChoiceRole;
  accessibilityRole: typeof nativeChoiceRole;
  accessibilityLabel: string;
  accessibilityState: { disabled: boolean; selected: boolean; checked: boolean };
  accessibilityHint?: string;
}

/**
 * iOS speaks elements and never non-element containers, so a group's accessible
 * name cannot sit on the frame — it rides in front of each option's own name.
 * Making the frame `accessible` instead would collapse the options into one
 * element and lose which one is chosen, which is the only thing worth saying.
 */
export function composeA11yName(groupName: string | undefined, ownName: string): string {
  const group = groupName?.trim();
  return group ? `${group}, ${ownName}` : ownName;
}

export function choiceItemA11y({
  name,
  selected,
  disabled,
  hint,
}: {
  /** Kept for the caller's clarity; the platform role is pinned above. */
  kind?: ChoiceKind;
  name: string;
  selected: boolean;
  disabled: boolean;
  hint?: string;
}): ChoiceA11yProps {
  return {
    accessible: true,
    role: nativeChoiceRole,
    accessibilityRole: nativeChoiceRole,
    accessibilityLabel: name,
    // `selected` is what a reader announces for a segment, `checked` what it
    // announces for a radio; the iOS tree surfaces them as `selected: true`
    // and `value: "checked"`. Both are set so one shape serves both controls.
    accessibilityState: { disabled, selected, checked: selected },
    ...(hint ? { accessibilityHint: hint } : undefined),
  };
}
