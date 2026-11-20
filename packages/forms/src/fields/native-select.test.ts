import { describe, expect, it } from 'vitest';

import { shouldUseIosNativeSelect } from './native-select';

describe(shouldUseIosNativeSelect, () => {
  it('is off unless the field opts in', () => {
    expect(shouldUseIosNativeSelect({ multiple: false, isWeb: false, os: 'ios' })).toBe(false);
  });

  it('is on for single-select iOS when native is set', () => {
    expect(shouldUseIosNativeSelect({ native: true, multiple: false, isWeb: false, os: 'ios' })).toBe(true);
  });

  it('stays catalog for multi-select, web, and Android', () => {
    expect(shouldUseIosNativeSelect({ native: true, multiple: true, isWeb: false, os: 'ios' })).toBe(false);
    expect(shouldUseIosNativeSelect({ native: true, multiple: false, isWeb: true, os: 'ios' })).toBe(false);
    expect(shouldUseIosNativeSelect({ native: true, multiple: false, isWeb: false, os: 'android' })).toBe(false);
  });
});
