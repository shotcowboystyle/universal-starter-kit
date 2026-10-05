import { describe, expect, it } from 'vitest';

import { computeRequiredMarkMode, formatRequiredMarkSuffix, mapHouseRequiredMarking } from './requiredMarking';

describe('mapHouseRequiredMarking', () => {
  it('maps asterisk and minority to asterisk (minority helper)', () => {
    expect(mapHouseRequiredMarking('asterisk')).toBe('asterisk');
    expect(mapHouseRequiredMarking('minority')).toBe('asterisk');
  });

  it('maps optional to optional', () => {
    expect(mapHouseRequiredMarking('optional')).toBe('optional');
  });
});

describe('computeRequiredMarkMode auto', () => {
  it('marks required when required is the minority', () => {
    expect(computeRequiredMarkMode([true, false, false], 'auto')).toBe('required');
  });
});

describe('formatRequiredMarkSuffix', () => {
  it('asterisk marks required fields', () => {
    expect(formatRequiredMarkSuffix(true, 'asterisk')).toBe(' *');
    expect(formatRequiredMarkSuffix(false, 'asterisk')).toBe('');
  });
});
