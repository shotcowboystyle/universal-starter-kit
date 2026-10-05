import { describe, expect, it } from 'vitest';

import { remapValidatorsForTiming, resolveEffectiveValidateOn } from './validateOn';

describe('resolveEffectiveValidateOn', () => {
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

describe('remapValidatorsForTiming', () => {
  const onSubmit = ({ value }: { value: unknown }) => (value ? undefined : 'required');

  it('leaves validators alone for submit-only timing', () => {
    const validators = { onSubmit };
    expect(remapValidatorsForTiming(validators, 'submit')).toBe(validators);
  });

  it('copies onSubmit onto onBlur for blur timing', () => {
    const remapped = remapValidatorsForTiming({ onSubmit }, 'blur');
    expect(remapped?.onBlur).toBeTypeOf('function');
    expect((remapped?.onBlur as typeof onSubmit)({ value: '' })).toBe('required');
    expect(remapped?.onChange).toBeUndefined();
  });

  it('copies onSubmit onto onChange for change timing', () => {
    const remapped = remapValidatorsForTiming({ onSubmit }, 'change');
    expect(remapped?.onChange).toBeTypeOf('function');
    expect((remapped?.onChange as typeof onSubmit)({ value: 'ok' })).toBeUndefined();
    expect(remapped?.onBlur).toBeUndefined();
  });

  it('attaches both listeners for blur-then-change', () => {
    const remapped = remapValidatorsForTiming({ onSubmit }, 'blur-then-change');
    expect(remapped?.onBlur).toBeTypeOf('function');
    expect(remapped?.onChange).toBeTypeOf('function');
  });

  it('composes with existing onBlur without dropping it', () => {
    const onBlur = ({ value }: { value: unknown }) => (value === 'x' ? 'bad x' : undefined);
    const remapped = remapValidatorsForTiming({ onSubmit, onBlur }, 'blur');
    expect((remapped?.onBlur as typeof onBlur)({ value: 'x' })).toBe('bad x');
    expect((remapped?.onBlur as typeof onBlur)({ value: '' })).toBe('required');
  });
});
