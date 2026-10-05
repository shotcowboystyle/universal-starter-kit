import { Text } from 'tamagui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isTinted, listeners, setTinted, toggleTinted } from './setTinted';
import { unwrapText } from './unwrapText';

describe('setTinted', () => {
  beforeEach(() => {
    listeners.clear();
    setTinted(true);
  });

  it('should set isTinted to the provided value', () => {
    setTinted(false);
    expect(isTinted).toBe(false);
    setTinted(true);
    expect(isTinted).toBe(true);
  });

  it('should call listeners when isTinted is set', () => {
    const listener = vi.fn();
    listeners.add(listener);
    setTinted(false);
    expect(listener).toHaveBeenCalledWith(false);
    setTinted(true);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('should toggle isTinted value', () => {
    expect(isTinted).toBe(true);
    toggleTinted();
    expect(isTinted).toBe(false);
    toggleTinted();
    expect(isTinted).toBe(true);
  });

  it('should notify listeners when toggled', () => {
    const listener = vi.fn();
    listeners.add(listener);
    toggleTinted();
    expect(listener).toHaveBeenCalledWith(false);
    toggleTinted();
    expect(listener).toHaveBeenCalledWith(true);
  });
});

describe('unwrapText', () => {
  it('should unwrap children from a Text component', () => {
    const result = unwrapText(
      <>
        <Text>Sample Text</Text>
      </>,
    );
    expect(result).toHaveLength(1);
  });

  it('should handle empty children', () => {
    const result = unwrapText(null);
    expect(result).toEqual([]);
  });

  it('should handle undefined children', () => {
    const result = unwrapText(undefined);
    expect(result).toEqual([]);
  });
});
