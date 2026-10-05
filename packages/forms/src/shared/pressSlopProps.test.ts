import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickerTriggerContract } from './pickerTriggerContract';
import { pressSlopOutsetProps, pressSlopProps } from './pressSlopProps';

const platform = vi.hoisted(() => ({ web: true }));
vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  get isWeb() {
    return platform.web;
  },
}));

afterEach(() => {
  platform.web = true;
});

describe('press-target deficient dimensions', () => {
  it('expands a wide picker only vertically and reserves its own width floor', () => {
    expect(pickerTriggerContract(37)).toMatchObject({
      minWidth: 44,
      'data-mp-press-slop': '4',
      'data-mp-press-axis': 'vertical',
    });
    expect(document.getElementById('mp-button-press-slop')?.textContent).toContain(
      '[data-mp-press-slop="4"][data-mp-press-axis="vertical"]::after{inset:-4px 0}',
    );
  });
  it('retains expansion in both dimensions for small icon controls', () => {
    expect(pressSlopProps(28, true)).toEqual({ 'data-mp-press-slop': '8' });
  });
  it('does not expand native picker width but retains icon hitSlop', () => {
    platform.web = false;
    expect(pickerTriggerContract(37)).toMatchObject({
      minWidth: 44,
      hitSlop: { top: 4, bottom: 4, left: 0, right: 0 },
    });
    expect(pressSlopProps(28, true)).toEqual({ hitSlop: { top: 8, bottom: 8, left: 8, right: 8 } });
  });
});

describe('pitch-limited outset', () => {
  it('writes the given outset on the vertical axis on web, whatever the painted size', () => {
    expect(pressSlopOutsetProps(4, 'vertical')).toEqual({
      'data-mp-press-slop': '4',
      'data-mp-press-axis': 'vertical',
    });
  });
  it('floors a fractional outset so the target stays inside its pitch', () => {
    expect(pressSlopOutsetProps(3.5, 'vertical')).toEqual({
      'data-mp-press-slop': '3',
      'data-mp-press-axis': 'vertical',
    });
  });
  it('writes nothing for an outset under one pixel', () => {
    expect(pressSlopOutsetProps(0, 'vertical')).toBeUndefined();
    expect(pressSlopOutsetProps(0.5)).toBeUndefined();
  });
  it('gives native a vertical-only hitSlop', () => {
    platform.web = false;
    expect(pressSlopOutsetProps(3, 'vertical')).toEqual({
      hitSlop: { top: 3, bottom: 3, left: 0, right: 0 },
    });
    expect(pressSlopOutsetProps(3)).toEqual({ hitSlop: { top: 3, bottom: 3, left: 3, right: 3 } });
  });
});
