import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { CheckRegular } from './CheckRegular';
import { MinusRegular } from './MinusRegular';

function strokeOf(container: HTMLElement, selector: string) {
  return container.querySelector(selector)?.getAttribute('stroke') ?? '';
}

describe('MinusRegular', () => {
  it('should render correctly', () => {
    const { container } = renderWithProviders(<MinusRegular />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should have the correct default size', () => {
    const { container } = renderWithProviders(<MinusRegular />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('width', '24');
  });

  it('should accept custom color and size', () => {
    const { container } = renderWithProviders(<MinusRegular color="red" size={48} />);
    const line = container.querySelector('line');
    const svg = container.querySelector('svg');
    expect(line).toHaveAttribute('stroke', 'red');
    expect(svg).toHaveAttribute('height', '48');
    expect(svg).toHaveAttribute('width', '48');
  });

  it('does not default stroke to black or #000', () => {
    const { container } = renderWithProviders(<MinusRegular />);
    const stroke = strokeOf(container, 'line');
    expect(stroke).not.toBe('black');
    expect(stroke.toLowerCase()).not.toBe('#000');
    expect(stroke.toLowerCase()).not.toBe('#000000');
    expect(stroke.length).toBeGreaterThan(0);
  });

  it('keeps the stroke centred at supported sizes', () => {
    for (const size of [12, 16, 24, 48]) {
      const { container } = renderWithProviders(<MinusRegular size={size} />);
      const line = container.querySelector('line');
      expect(line).toHaveAttribute('y1', '128');
      expect(line).toHaveAttribute('y2', '128');
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('height', String(size));
      expect(svg).toHaveAttribute('width', String(size));
    }
  });
});

describe('CheckRegular', () => {
  it('should render correctly', () => {
    const { container } = renderWithProviders(<CheckRegular />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('does not default stroke to black or #000', () => {
    const { container } = renderWithProviders(<CheckRegular />);
    const stroke = strokeOf(container, 'polyline');
    expect(stroke).not.toBe('black');
    expect(stroke.toLowerCase()).not.toBe('#000');
    expect(stroke.toLowerCase()).not.toBe('#000000');
    expect(stroke.length).toBeGreaterThan(0);
  });

  it('should accept a theme token size', () => {
    const { container } = renderWithProviders(<CheckRegular size={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '16');
    expect(svg).toHaveAttribute('width', '16');
  });
});
