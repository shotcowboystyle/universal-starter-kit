import { renderWithProviders } from '@repo/test-utils';
/**
 * SpinnerGlyph and useSpinnerStroke.
 *
 * Spinner.test.tsx covers the status region, the size ladder and the animation
 * knob; the glyph inside it — the two-circle arc that IS the spinner — had no
 * coverage. Two contracts live here: the arc is exactly 270 degrees of the
 * circumference on a faint full track, and `useSpinnerStroke` resolves a `$`
 * token through the theme while passing a literal colour straight through.
 */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SpinnerGlyph, useSpinnerStroke } from './SpinnerGlyph';

afterEach(cleanup);

const R = 9;
const CIRCUMFERENCE = 2 * Math.PI * R;

function svg(container: HTMLElement): SVGElement {
  const node = container.querySelector('svg');
  if (!node) {
    throw new Error('SpinnerGlyph rendered no svg');
  }
  return node as unknown as SVGElement;
}

function circles(container: HTMLElement): SVGElement[] {
  return Array.from(container.querySelectorAll('circle')) as unknown as SVGElement[];
}

function Probe({ color }: { color?: string }) {
  const stroke = useSpinnerStroke(color);
  return <span data-stroke={stroke} />;
}

function stroke(container: HTMLElement): string | null {
  return container.querySelector('[data-stroke]')?.getAttribute('data-stroke') ?? null;
}

describe('SpinnerGlyph — the arc', () => {
  it('draws a track and a head, never one circle', () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#123456" size={24} />);
    expect(circles(container)).toHaveLength(2);
  });

  it('keeps the viewBox fixed and scales through width/height, so it stays crisp', () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#123456" size={48} />);
    const node = svg(container);
    expect(node.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(node.getAttribute('width')).toBe('48');
    expect(node.getAttribute('height')).toBe('48');
  });

  it('takes the box size it is handed rather than a fixed one', () => {
    const small = renderWithProviders(<SpinnerGlyph color="#123456" size={16} />);
    expect(svg(small.container).getAttribute('width')).toBe('16');
    cleanup();
    const large = renderWithProviders(<SpinnerGlyph color="#123456" size={64} />);
    expect(svg(large.container).getAttribute('width')).toBe('64');
  });

  it('makes the track faint and the head solid, both in the requested colour', () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#abcdef" size={24} />);
    const [track, head] = circles(container);
    expect(track.getAttribute('stroke')).toBe('#abcdef');
    expect(head.getAttribute('stroke')).toBe('#abcdef');
    expect(Number(track.getAttribute('opacity'))).toBeCloseTo(0.2, 5);
    expect(head.getAttribute('opacity')).toBeNull();
  });

  it('paints 270 degrees of arc and leaves the remaining quarter open', () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#123456" size={24} />);
    const [, head] = circles(container);
    const [drawn, gap] = String(head.getAttribute('stroke-dasharray') ?? head.getAttribute('strokeDasharray'))
      .split(' ')
      .map(Number);
    expect(drawn).toBeCloseTo(CIRCUMFERENCE * 0.75, 5);
    expect(gap).toBeCloseTo(CIRCUMFERENCE * 0.25, 5);
    expect(drawn + gap).toBeCloseTo(CIRCUMFERENCE, 5);
  });

  it("starts the head at twelve o'clock, not at three", () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#123456" size={24} />);
    const [, head] = circles(container);
    expect(head.getAttribute('transform')).toBe('rotate(-90 12 12)');
  });

  it("rounds the head's cap, which is what makes it read as Linear/Polaris rather than a pie slice", () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#123456" size={24} />);
    const [track, head] = circles(container);
    expect(head.getAttribute('stroke-linecap') ?? head.getAttribute('strokeLinecap')).toBe('round');
    expect(track.getAttribute('stroke-linecap') ?? track.getAttribute('strokeLinecap')).toBeNull();
  });

  it('fills neither circle, so the spinner is a ring and not a disc', () => {
    const { container } = renderWithProviders(<SpinnerGlyph color="#123456" size={24} />);
    for (const circle of circles(container)) {
      expect(circle.getAttribute('fill')).toBe('none');
    }
  });
});

describe('useSpinnerStroke', () => {
  it('passes a literal colour through untouched', () => {
    const { container } = renderWithProviders(<Probe color="#ff0000" />);
    expect(stroke(container)).toBe('#ff0000');
    cleanup();
    const named = renderWithProviders(<Probe color="rebeccapurple" />);
    expect(stroke(named.container)).toBe('rebeccapurple');
  });

  it('resolves a $ token to a concrete colour instead of leaking the token', () => {
    const { container } = renderWithProviders(<Probe color="$color" />);
    const value = stroke(container);
    expect(value).toBeTruthy();
    expect(value?.startsWith('$')).toBe(false);
  });

  it('defaults to $color when no colour is given, and still resolves it', () => {
    const explicit = renderWithProviders(<Probe color="$color" />);
    const explicitValue = stroke(explicit.container);
    cleanup();
    const implicit = renderWithProviders(<Probe />);
    expect(stroke(implicit.container)).toBe(explicitValue);
  });

  it('hands back the token itself when the theme has no such key, rather than throwing', () => {
    const { container } = renderWithProviders(<Probe color="$definitelyNotAThemeKey" />);
    expect(stroke(container)).toBe('$definitelyNotAThemeKey');
  });
});
