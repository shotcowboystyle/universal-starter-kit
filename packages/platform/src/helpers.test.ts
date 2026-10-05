import { describe, expect, it } from 'vitest';

import { fastUnique, isText } from './helpers';

describe('fastUnique', () => {
  it('returns a string', () => {
    expect(typeof fastUnique()).toBe('string');
  });

  it('returns unique values on consecutive calls', () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(fastUnique());
    }
    expect(results.size).toBe(100);
  });

  it('returns non-empty strings', () => {
    expect(fastUnique().length).toBeGreaterThan(0);
  });
});

describe('isText', () => {
  it('returns true for a plain string', () => {
    expect(isText('hello')).toBe(true);
  });

  it('returns false for a number', () => {
    expect(isText(42)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isText(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isText(undefined)).toBe(false);
  });

  it('returns false for an empty array', () => {
    expect(isText([])).toBe(false);
  });

  it('returns false for a single-element array of string', () => {
    expect(isText(['hello'])).toBe(false);
  });

  it('returns false for an array of strings without React element shape', () => {
    expect(isText(['hello', { notReact: true }])).toBe(false);
  });

  it('returns true for an array resembling [string, ReactElement]', () => {
    const fakeReactElement = {
      _owner: null,
      _store: {},
      key: null,
      props: {},
      ref: null,
      type: 'span',
    };
    expect(isText(['prefix', fakeReactElement])).toBe(true);
  });
});
