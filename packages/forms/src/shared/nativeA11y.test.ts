import { describe, expect, it } from 'vitest';

import { choiceItemA11y, composeA11yName } from './nativeA11y';

describe('composeA11yName', () => {
  it("returns the option's own name when the group has none", () => {
    expect(composeA11yName(undefined, 'warning')).toBe('warning');
    expect(composeA11yName('   ', 'warning')).toBe('warning');
  });

  it('puts the group name in front, because iOS never reads a container', () => {
    expect(composeA11yName('Severity', 'warning')).toBe('Severity, warning');
  });
});

describe('choiceItemA11y', () => {
  it('carries role, name and both state spellings', () => {
    expect(choiceItemA11y({ kind: 'radio', name: 'DEBITS', selected: true, disabled: false })).toEqual({
      accessible: true,
      role: 'button',
      accessibilityRole: 'button',
      accessibilityLabel: 'DEBITS',
      accessibilityState: { disabled: false, selected: true, checked: true },
    });
  });

  // Measured on iOS 26.2 / RN 0.83: a radio or checkbox accessibilityRole
  // takes the element OUT of the tree. `button` is what keeps it in, for both
  // kinds, and `role` must be overridden too because RN prefers it.
  it('pins the platform role to button whatever the control means', () => {
    const checkbox = choiceItemA11y({
      kind: 'checkbox',
      name: 'error',
      selected: false,
      disabled: true,
    });
    expect(checkbox.role).toBe('button');
    expect(checkbox.accessibilityRole).toBe('button');
  });

  it('omits the hint rather than emitting undefined', () => {
    const props = choiceItemA11y({
      kind: 'checkbox',
      name: 'error',
      selected: false,
      disabled: true,
    });
    expect('accessibilityHint' in props).toBe(false);
    expect(props.accessibilityState).toEqual({ disabled: true, selected: false, checked: false });
  });

  it('keeps a hint when one is given', () => {
    expect(
      choiceItemA11y({
        kind: 'radio',
        name: 'derived',
        selected: false,
        disabled: false,
        hint: 'recomputed from other emitters',
      }).accessibilityHint,
    ).toBe('recomputed from other emitters');
  });
});
