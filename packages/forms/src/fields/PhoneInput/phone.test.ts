import { describe, expect, it } from 'vitest';

import {
  caretIndexForDigitCount,
  countryCodeToFlag,
  detectRegion,
  digitsOnly,
  examplePlaceholder,
  flagSizeForToken,
  formatNational,
  getCountryOptions,
  parsePhone,
  toE164,
} from './phone';

describe('phone helpers', () => {
  it('strips non-digits', () => {
    expect(digitsOnly('+1 (512) 400-9021 x99')).toBe('1512400902199');
  });

  it('formats NANP as you type', () => {
    expect(formatNational('US', '5')).toBe('5');
    expect(formatNational('US', '512')).toBe('512');
    expect(formatNational('US', '5124')).toBe('(512) 4');
    expect(formatNational('US', '5124009021')).toBe('(512) 400-9021');
  });

  it('formats GB keeping a leading trunk zero', () => {
    expect(formatNational('GB', '07400123456')).toBe('07400 123 456');
  });

  it('emits E.164 and drops a trunk zero', () => {
    expect(toE164('US', '5124009021')).toBe('+15124009021');
    expect(toE164('GB', '07400123456')).toBe('+447400123456');
    expect(toE164('US', '')).toBe('');
  });

  it('detects country from an international paste; +1 keeps the hint', () => {
    expect(detectRegion('+447400123456', 'US')).toBe('GB');
    expect(detectRegion('+3312345678', 'US')).toBe('FR');
    expect(detectRegion('+15124009021', 'CA')).toBe('CA');
    expect(detectRegion('+15124009021', 'US')).toBe('US');
    expect(detectRegion('5124009021', 'GB')).toBe('GB');
  });

  it('parses stored E.164 without dropping the national number', () => {
    expect(parsePhone('+447123456789', 'US')).toEqual({
      region: 'GB',
      national: '7123456789',
    });
    expect(parsePhone('+15125551234', 'US')).toEqual({
      region: 'US',
      national: '5125551234',
    });
    expect(parsePhone('', 'DE')).toEqual({ region: 'DE', national: '' });
  });

  it('rebases the same national digits onto a new country (SB-M-214)', () => {
    const national = parsePhone('+15125551234', 'US').national;
    expect(toE164('GB', national)).toBe('+445125551234');
    expect(formatNational('GB', national)).toBe('5125 551 234');
  });

  it('scales the flag with the size token', () => {
    expect(flagSizeForToken('$2')).toBeLessThan(flagSizeForToken('$4'));
    expect(flagSizeForToken('$4')).toBeLessThan(flagSizeForToken('$6'));
  });

  it('builds searchable country options with names and dial codes', () => {
    const options = getCountryOptions();
    const us = options.find((o) => o.value === 'US');
    expect(us?.label).toContain('United States');
    expect(us?.keywords).toContain('+1');
    expect(countryCodeToFlag('US')).toBeTruthy();
    expect(options[0]?.value).toBe('US');
  });

  it('example placeholder follows the national formatter', () => {
    expect(examplePlaceholder('US')).toBe('(201) 555-0123');
  });

  it('maps a digit count back onto a formatted caret index', () => {
    expect(caretIndexForDigitCount('(512) 400-9021', 3)).toBe(4);
    expect(caretIndexForDigitCount('(512) 400-9021', 6)).toBe(9);
  });
});
