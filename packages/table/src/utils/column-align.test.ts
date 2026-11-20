import { describe, expect, it } from 'vitest';

import { alignToFlex, getDefaultColumnAlign } from './column-align';

describe('getDefaultColumnAlign (DG-TBL-01)', () => {
  it('defaults text / input columns to left', () => {
    expect(getDefaultColumnAlign({ field: 'input' })).toBe('left');
    expect(getDefaultColumnAlign({ field: 'textarea' })).toBe('left');
    expect(getDefaultColumnAlign({})).toBe('left');
  });

  it('right-aligns numeric field types', () => {
    for (const field of ['stepper', 'slider', 'progress', 'duration'] as const) {
      expect(getDefaultColumnAlign({ field })).toBe('right');
    }
  });

  it('right-aligns currency via fieldProps.currency', () => {
    expect(getDefaultColumnAlign({ field: 'input', fieldProps: { currency: 'USD' } })).toBe('right');
    expect(getDefaultColumnAlign({ field: 'stepper', fieldProps: { currency: '$' } })).toBe('right');
  });

  it('right-aligns actions columns by id / meta.role', () => {
    expect(getDefaultColumnAlign({ id: 'actions' })).toBe('right');
    expect(getDefaultColumnAlign({ id: 'row_actions' })).toBe('right');
    expect(getDefaultColumnAlign({ id: 'foo:actions' })).toBe('right');
    expect(getDefaultColumnAlign({ meta: { role: 'actions' } })).toBe('right');
  });

  it('centers boolean and icon-like fields', () => {
    expect(getDefaultColumnAlign({ field: 'checkbox' })).toBe('center');
    expect(getDefaultColumnAlign({ field: 'switch' })).toBe('center');
    expect(getDefaultColumnAlign({ field: 'rating' })).toBe('center');
  });

  it('lets explicit align override smart defaults', () => {
    expect(getDefaultColumnAlign({ field: 'stepper', align: 'left' })).toBe('left');
    expect(getDefaultColumnAlign({ id: 'actions', align: 'center' })).toBe('center');
    expect(getDefaultColumnAlign({ field: 'input', meta: { align: 'right' } })).toBe('right');
  });
});

describe(alignToFlex, () => {
  it('maps align tokens to flex justify values', () => {
    expect(alignToFlex('left')).toBe('flex-start');
    expect(alignToFlex('center')).toBe('center');
    expect(alignToFlex('right')).toBe('flex-end');
    expect(alignToFlex()).toBe('flex-start');
  });
});
