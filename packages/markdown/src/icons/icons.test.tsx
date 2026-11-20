/**
 * Markdown icons spec (MPO-195). The four SVGs are exported from the package
 * barrel and had no colocated spec. What matters here is the thing that has
 * already broken once: a `$colorN` string cannot reach a raw SVG stroke
 * attribute, so useIconColor must resolve it to a concrete value first
 * (SB-M-1206). An unresolved token paints nothing and no test caught it.
 */

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { CheckCircleIcon, CheckIcon, ClipboardIcon, LinkIcon } from './index';

const icons = [
  { name: 'ClipboardIcon', Icon: ClipboardIcon, defaultSize: '16' },
  { name: 'CheckIcon', Icon: CheckIcon, defaultSize: '16' },
  { name: 'CheckCircleIcon', Icon: CheckCircleIcon, defaultSize: '16' },
  { name: 'LinkIcon', Icon: LinkIcon, defaultSize: '12' },
] as const;

const TOKEN_PREFIX_REGEX = /^\$/u;

const strokes = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[stroke]')].map((el) => el.getAttribute('stroke') ?? '');

describe('markdown icons', () => {
  it.each(icons)('$name renders an svg at its documented default size', ({ name, Icon, defaultSize }) => {
    const { container } = renderWithProviders(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg, name).toBeTruthy();
    expect(svg!.getAttribute('width')).toBe(defaultSize);
    expect(svg!.getAttribute('height')).toBe(defaultSize);
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it.each(icons)('$name honors an explicit size', ({ Icon }) => {
    const { container } = renderWithProviders(<Icon size={40} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('40');
    expect(svg.getAttribute('height')).toBe('40');
  });

  it.each(icons)('$name resolves a $-token color before it reaches the stroke (SB-M-1206)', ({ name, Icon }) => {
    const { container } = renderWithProviders(<Icon color="$color10" />);
    const painted = strokes(container);
    expect(painted.length, name).toBeGreaterThan(0);
    for (const stroke of painted) {
      expect(stroke, name).not.toMatch(TOKEN_PREFIX_REGEX);
      expect(stroke, name).not.toBe('');
    }
  });

  it.each(icons)('$name passes a concrete color straight through', ({ Icon }) => {
    const { container } = renderWithProviders(<Icon color="#ff8800" />);
    for (const stroke of strokes(container)) {
      expect(stroke).toBe('#ff8800');
    }
  });

  it.each(icons)('$name paints a concrete stroke with no color prop at all', ({ name, Icon }) => {
    const { container } = renderWithProviders(<Icon />);
    const painted = strokes(container);
    expect(painted.length, name).toBeGreaterThan(0);
    for (const stroke of painted) {
      expect(stroke).not.toMatch(TOKEN_PREFIX_REGEX);
    }
  });

  it('an unknown $token degrades to a concrete color rather than an empty stroke', () => {
    const { container } = renderWithProviders(<CheckIcon color="$notARealToken" />);
    for (const stroke of strokes(container)) {
      expect(stroke).not.toMatch(TOKEN_PREFIX_REGEX);
      expect(stroke).not.toBe('');
    }
  });

  it('CheckIcon takes a custom strokeWidth', () => {
    const { container } = renderWithProviders(<CheckIcon strokeWidth={4} />);
    expect(container.querySelector('path')!.getAttribute('stroke-width')).toBe('4');
  });

  it('CheckIcon defaults strokeWidth to 2.5, the other icons to 2', () => {
    const check = renderWithProviders(<CheckIcon />);
    expect(check.container.querySelector('path')!.getAttribute('stroke-width')).toBe('2.5');
    const clipboard = renderWithProviders(<ClipboardIcon />);
    expect(clipboard.container.querySelector('rect')!.getAttribute('stroke-width')).toBe('2');
  });

  it('ClipboardIcon and CheckCircleIcon draw their distinguishing shapes', () => {
    const clipboard = renderWithProviders(<ClipboardIcon />);
    expect(clipboard.container.querySelector('rect')).toBeTruthy();
    const checkCircle = renderWithProviders(<CheckCircleIcon />);
    expect(checkCircle.container.querySelector('circle')).toBeTruthy();
  });

  it('LinkIcon draws both halves of the broken chain', () => {
    const { container } = renderWithProviders(<LinkIcon />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
