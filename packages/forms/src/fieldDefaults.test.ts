import { describe, expect, it } from 'vitest';

import {
  FIELD_WIDTH_BY_PURPOSE,
  LABEL_COLUMN_MAX_CH,
  LABEL_COLUMN_WIDTH,
  fieldWidthStyle,
  isFieldPurpose,
  resolveFieldInputProps,
  resolveFieldPurpose,
  resolveFieldWidth,
} from './fieldDefaults';

describe('FIELD_WIDTH_BY_PURPOSE', () => {
  it('maps blueprint purposes to ch widths / full', () => {
    expect(FIELD_WIDTH_BY_PURPOSE).toEqual({
      postalCode: 12,
      year: 4,
      phone: 16,
      email: 24,
      description: 'full',
    });
  });

  it('exposes the shared label column cap as the widest purpose width', () => {
    expect(LABEL_COLUMN_MAX_CH).toBe(24);
    expect(LABEL_COLUMN_WIDTH).toBe('min(max-content, 24ch)');
  });
});

describe('resolveFieldPurpose', () => {
  it('prefers explicit purpose over autocomplete', () => {
    expect(resolveFieldPurpose('year', 'email')).toBe('year');
  });

  it('maps HTML autocomplete tokens', () => {
    expect(resolveFieldPurpose(undefined, 'postal-code')).toBe('postalCode');
    expect(resolveFieldPurpose(undefined, 'tel')).toBe('phone');
    expect(resolveFieldPurpose(undefined, 'tel-national')).toBe('phone');
    expect(resolveFieldPurpose(undefined, 'email')).toBe('email');
    expect(resolveFieldPurpose(undefined, 'bday-year')).toBe('year');
  });

  it('accepts purpose keys case-sensitively via purpose prop', () => {
    expect(resolveFieldPurpose('postalCode')).toBe('postalCode');
    expect(resolveFieldPurpose('PostalCode')).toBeUndefined();
  });

  it('returns undefined for unknown tokens', () => {
    expect(resolveFieldPurpose(undefined, 'given-name')).toBeUndefined();
    expect(resolveFieldPurpose(undefined, '')).toBeUndefined();
    expect(resolveFieldPurpose(undefined, null)).toBeUndefined();
  });
});

describe('resolveFieldWidth / fieldWidthStyle', () => {
  it('returns numeric ch widths', () => {
    expect(resolveFieldWidth('postalCode')).toBe(12);
    expect(fieldWidthStyle('postalCode')).toEqual({ maxWidth: '12ch' });
    expect(fieldWidthStyle(undefined, 'email')).toEqual({ maxWidth: '24ch' });
    expect(fieldWidthStyle(undefined, 'tel')).toEqual({ maxWidth: '16ch' });
    expect(fieldWidthStyle('year')).toEqual({ maxWidth: '4ch' });
  });

  it('returns full-width style for description', () => {
    expect(resolveFieldWidth('description')).toBe('full');
    expect(fieldWidthStyle('description')).toEqual({
      width: '100%',
      maxWidth: '100%',
    });
  });

  it('returns undefined when purpose cannot be resolved', () => {
    expect(resolveFieldWidth()).toBeUndefined();
    expect(fieldWidthStyle(undefined, 'on')).toBeUndefined();
  });
});

describe('isFieldPurpose', () => {
  it('narrows known keys', () => {
    expect(isFieldPurpose('phone')).toBe(true);
    expect(isFieldPurpose('nope')).toBe(false);
    expect(isFieldPurpose(undefined)).toBe(false);
  });
});

describe('resolveFieldInputProps (DG §32 keyboard/autofill)', () => {
  it('email → email autocomplete + email keyboard', () => {
    expect(resolveFieldInputProps('email')).toEqual({
      autoComplete: 'email',
      inputMode: 'email',
      keyboardType: 'email-address',
    });
  });

  it('phone → tel autocomplete + tel keyboard', () => {
    expect(resolveFieldInputProps('phone')).toEqual({
      autoComplete: 'tel',
      inputMode: 'tel',
      keyboardType: 'phone-pad',
    });
  });

  it('postalCode → postal-code autocomplete, keyboard stays text (alphanumeric)', () => {
    const props = resolveFieldInputProps('postalCode');
    expect(props.autoComplete).toBe('postal-code');
    expect(props.inputMode).toBeUndefined();
    expect(props.keyboardType).toBeUndefined();
  });

  it('year → numeric via text + inputmode (no autocomplete guess)', () => {
    expect(resolveFieldInputProps('year')).toEqual({
      inputMode: 'numeric',
      keyboardType: 'number-pad',
    });
  });

  it('derives purpose from an autocomplete token and passes the token through', () => {
    expect(resolveFieldInputProps(undefined, 'tel-national')).toEqual({
      autoComplete: 'tel-national',
      inputMode: 'tel',
      keyboardType: 'phone-pad',
    });
  });

  it('explicit autoComplete wins over the purpose-derived token', () => {
    expect(resolveFieldInputProps('email', 'work email')).toMatchObject({
      autoComplete: 'work email',
      inputMode: 'email',
    });
  });

  it('unknown purposes yield no keyboard/autofill props', () => {
    expect(resolveFieldInputProps('description')).toEqual({});
    expect(resolveFieldInputProps()).toEqual({});
    expect(resolveFieldInputProps(undefined, 'given-name')).toEqual({
      autoComplete: 'given-name',
    });
  });
});
