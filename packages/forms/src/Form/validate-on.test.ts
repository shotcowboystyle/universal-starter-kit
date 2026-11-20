import { describe, expect, it } from 'vitest';

import { remapValidatorsForTiming, resolveEffectiveValidateOn } from './validate-on';

type Validator = (args: { value: unknown }) => string | undefined;

const onSubmit: Validator = ({ value }) => (value === '' ? 'required' : undefined);
const onBlur: Validator = ({ value }) => (value === 'x' ? 'bad x' : undefined);

/** The function remapValidatorsForTiming installed under `key`. */
// SAFETY: every caller first asserts that the key holds a function, which is the only thing remapValidatorsForTiming installs there.
const validatorAt = (remapped: ReturnType<typeof remapValidatorsForTiming>, key: 'onBlur' | 'onChange'): Validator =>
  remapped?.[key] as Validator;

describe(resolveEffectiveValidateOn, () => {
  it('keeps submit before any attempt', () => {
    expect(resolveEffectiveValidateOn('submit', false)).toBe('submit');
  });

  it('upgrades submit to blur-then-change after first attempt', () => {
    expect(resolveEffectiveValidateOn('submit', true)).toBe('blur-then-change');
  });

  it('passes blur and change through unchanged', () => {
    expect(resolveEffectiveValidateOn('blur', false)).toBe('blur');
    expect(resolveEffectiveValidateOn('blur', true)).toBe('blur');
    expect(resolveEffectiveValidateOn('change', false)).toBe('change');
    expect(resolveEffectiveValidateOn('change', true)).toBe('change');
  });
});

describe(remapValidatorsForTiming, () => {
  it('leaves validators alone for submit-only timing', () => {
    const validators = { onSubmit };
    expect(remapValidatorsForTiming(validators, 'submit')).toBe(validators);
  });

  it('copies onSubmit onto onBlur for blur timing', () => {
    const remapped = remapValidatorsForTiming({ onSubmit }, 'blur');
    expect(remapped?.onBlur).toBeTypeOf('function');
    expect(validatorAt(remapped, 'onBlur')({ value: '' })).toBe('required');
    expect(remapped?.onChange).toBeUndefined();
  });

  it('copies onSubmit onto onChange for change timing', () => {
    const remapped = remapValidatorsForTiming({ onSubmit }, 'change');
    expect(remapped?.onChange).toBeTypeOf('function');
    expect(validatorAt(remapped, 'onChange')({ value: 'ok' })).toBeUndefined();
    expect(remapped?.onBlur).toBeUndefined();
  });

  it('attaches both listeners for blur-then-change', () => {
    const remapped = remapValidatorsForTiming({ onSubmit }, 'blur-then-change');
    expect(remapped?.onBlur).toBeTypeOf('function');
    expect(remapped?.onChange).toBeTypeOf('function');
  });

  it('composes with existing onBlur without dropping it', () => {
    const remapped = remapValidatorsForTiming({ onSubmit, onBlur }, 'blur');
    expect(validatorAt(remapped, 'onBlur')({ value: 'x' })).toBe('bad x');
    expect(validatorAt(remapped, 'onBlur')({ value: '' })).toBe('required');
  });
});
