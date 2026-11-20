import { describe, expect, it } from 'vitest';

import { createNativeSearchFocus } from './native-search-focus';

describe('native search focus ownership', () => {
  it('keeps delayed outer and header return focus closed after a selection or dismissal', () => {
    const focus = createNativeSearchFocus();
    expect(focus.canOpen(false)).toBe(true);
    focus.dismiss();
    expect(focus.canOpen(false)).toBe(false);
    expect(focus.canOpen(true)).toBe(false);
    expect(focus.canOpen(false)).toBe(false);
  });

  it.each(['press', 'text change', 'accessibility activation'])(
    'permits deliberate %s after dismissal, even when the input never blurred',
    () => {
      const focus = createNativeSearchFocus();
      focus.dismiss();
      focus.activate();
      expect(focus.canOpen(false)).toBe(true);
    },
  );

  it('preserves suppression across modal blur but permits a later hardware focus visit', () => {
    const focus = createNativeSearchFocus();
    // Not DOM focus: `blur` is the ownership tracker's own event.
    const { blur } = focus;
    focus.dismiss();
    blur(true, false);
    blur(false, true);
    expect(focus.canOpen(false)).toBe(false);
    blur(false, false);
    expect(focus.canOpen(false)).toBe(true);
    expect(focus.canOpen(true)).toBe(false);
  });
});
