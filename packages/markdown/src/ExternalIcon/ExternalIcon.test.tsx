import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { ExternalIcon } from './index';

describe('ExternalIcon Component', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<ExternalIcon />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeTruthy();
  });

  it('renders Svg with correct attributes', () => {
    const { container } = renderWithProviders(<ExternalIcon />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveAttribute('height', '10');
    expect(svgElement).toHaveAttribute('width', '10');
    expect(svgElement).toHaveAttribute('viewBox', '0 0 15 15');
  });

  it('applies correct opacity style to Svg', () => {
    const { container } = renderWithProviders(<ExternalIcon />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveStyle('opacity: 0.4');
  });

  it('contains Path inside Svg', () => {
    const { container } = renderWithProviders(<ExternalIcon />);
    const pathElement = container.querySelector('svg path');
    expect(pathElement).toBeTruthy();
    expect(pathElement).toHaveAttribute('fill');
    // fill is now resolved via useTheme() instead of CSS var(--color)
  });
});
