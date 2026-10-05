/**
 * @vitest-environment jsdom
 */

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '../Button';

import { ControlGroup } from './index';

afterEach(cleanup);

function group(container: HTMLElement) {
  return container.querySelector('[data-mp-control-group]') as HTMLElement | null;
}

function radiusClasses(el: HTMLElement | null): string[] {
  return String(el?.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
}

describe('ControlGroup', () => {
  it('keeps inner seams square while the outer frame rides the radius knob (R-OUTER)', () => {
    const result = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <ControlGroup>
          <Button>First</Button>
          <Button>Last</Button>
        </ControlGroup>
      </Preset>,
    );
    expect(radiusClasses(group(result.container))).toEqual(['_btlr-t-radius-12']);
    const inners = result.container.querySelectorAll('[data-mp-group-position]');
    expect(inners.length).toBe(2);
    for (const node of inners) {
      expect((node as HTMLElement).getAttribute('data-mp-inner-radius')).toBe('0');
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
    expect(parseFloat(noneWidth || '0')).toBe(0);
    expect(parseFloat(largeWidth || '0')).toBeGreaterThan(parseFloat(noneWidth || '0'));
  });

  it('addon label is weight 400', () => {
    const result = renderWithProviders(
      <ControlGroup>
        <ControlGroup.Addon>@</ControlGroup.Addon>
        <Button>Go</Button>
      </ControlGroup>,
    );
    const addon = (result.container.querySelector('[data-mp-control-group-addon]') ||
      result.findTextElement('@')) as HTMLElement | null;
    expect(addon).toBeTruthy();
    const text = (
      addon?.matches('[data-mp-control-group-addon]') ? addon.querySelector('*') : addon
    ) as HTMLElement | null;
    const weight =
      text?.style.fontWeight ||
      (text ? getComputedStyle(text).fontWeight : '') ||
      (text?.className.match(/fw-400|fow-400|font-weight-400/) ? '400' : '');
    expect(['400', 'normal']).toContain(String(weight));
  });
});
