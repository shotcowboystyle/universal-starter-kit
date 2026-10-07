// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '../Button';

import { ControlGroup } from './index';

const group = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-mp-control-group]');

// oxlint-disable-next-line unicorn/prefer-number-coercion -- computed widths carry a "px" suffix, which Number() would turn into NaN
const widthPx = (value: string): number => Number.parseFloat(value === '' ? '0' : value);

const fontWeightOf = (el: Element | null | undefined): string => {
  if (!(el instanceof HTMLElement)) {
    return '';
  }
  if (el.style.fontWeight !== '') {
    return el.style.fontWeight;
  }
  const computed = getComputedStyle(el).fontWeight;
  if (computed !== '') {
    return computed;
  }
  return /fw-400|fow-400|font-weight-400/u.test(el.className) ? '400' : '';
};

const radiusClasses = (el: HTMLElement | null): string[] =>
  (el?.className ?? '').split(' ').filter((c) => c.startsWith('_btlr-'));

describe(ControlGroup, () => {
  afterEach(cleanup);

  it('keeps inner seams square while the outer frame rides the radius knob (R-OUTER)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <ControlGroup>
          <Button>First</Button>
          <Button>Last</Button>
        </ControlGroup>
      </Preset>,
    );
    expect(radiusClasses(group(result.container))).toStrictEqual(['_btlr-t-radius-12']);
    const inners = result.container.querySelectorAll<HTMLElement>('[data-mp-group-position]');
    expect(inners).toHaveLength(2);
    for (const node of inners) {
      expect(node.dataset.mpInnerRadius).toBe('0');
    }
  });

  it('border width follows the knob, not a baked 1px edge', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderWidth: 'none' }}>
        <ControlGroup>
          <Button>A</Button>
          <Button>B</Button>
        </ControlGroup>
      </Preset>,
    );
    const noneWidth = getComputedStyle(group(none.container)!).borderTopWidth;
    cleanup();

    const large = renderWithProviders(
      <Preset overrides={{ borderWidth: 'large' }}>
        <ControlGroup>
          <Button>A</Button>
          <Button>B</Button>
        </ControlGroup>
      </Preset>,
    );
    const largeWidth = getComputedStyle(group(large.container)!).borderTopWidth;
    expect(widthPx(noneWidth)).toBe(0);
    expect(widthPx(largeWidth)).toBeGreaterThan(widthPx(noneWidth));
  });

  it('addon label is weight 400', () => {
    const result = renderWithProviders(
      <ControlGroup>
        <ControlGroup.Addon>@</ControlGroup.Addon>
        <Button>Go</Button>
      </ControlGroup>,
    );
    const addon =
      result.container.querySelector<HTMLElement>('[data-mp-control-group-addon]') ?? result.findTextElement('@');
    expect(addon).toBeTruthy();
    const text = addon?.matches('[data-mp-control-group-addon]') ? addon.querySelector<HTMLElement>('*') : addon;
    const weight = fontWeightOf(text);
    expect(['400', 'normal']).toContain(weight);
  });
});
