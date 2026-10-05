import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { Circle } from '@tamagui/react-native-svg';

import { Svg } from './index';
describe('Svg Component', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(
      <Svg width={100} height={100}>
        <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
      </Svg>,
    );
    expect(container).toBeTruthy();
  });
  it('accepts and applies custom dimensions', () => {
    const { getByTestId } = renderWithProviders(
      <Svg width={200} height={150} data-testid="custom-svg">
        <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
      </Svg>,
    );
    const svgElement = getByTestId('custom-svg');
    expect(svgElement.style.width).toBe('200px');
    expect(svgElement.style.height).toBe('150px');
  });
  it('accepts and applies custom styles', () => {
    const { container } = renderWithProviders(
      <Svg data-testid="styled-svg" width={100} height={100} style={{ opacity: 0.5 }}>
        <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
      </Svg>,
    );
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeTruthy();
    expect(svgElement?.style.opacity).toBe('0.5');
  });
  it('renders children correctly', () => {
    const { getByTestId } = renderWithProviders(
      <Svg width={100} height={100}>
        <Circle data-testid="circle-element" cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
      </Svg>,
    );
    expect(getByTestId('circle-element')).toBeTruthy();
  });

  describe('dynamic behavior', () => {
    it('updates dimensions when props change', () => {
      const { getByTestId, rerender } = renderWithProviders(
        <Svg width={100} height={100} data-testid="dynamic-svg">
          <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
        </Svg>,
      );
      const svgElement = getByTestId('dynamic-svg');
      expect(svgElement.style.width).toBe('100px');
      expect(svgElement.style.height).toBe('100px');
      rerender(
        <Svg width={200} height={150} data-testid="dynamic-svg">
          <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
        </Svg>,
      );
      expect(svgElement.style.width).toBe('200px');
      expect(svgElement.style.height).toBe('150px');
    });
    it('updates styles dynamically', () => {
      const { getByTestId, rerender } = renderWithProviders(
        <Svg data-testid="dynamic-style-svg" width={100} height={100} style={{ opacity: 0.5 }}>
          <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
        </Svg>,
      );
      const svgElement = getByTestId('dynamic-style-svg');
      expect(svgElement.style.opacity).toBe('0.5');
      rerender(
        <Svg data-testid="dynamic-style-svg" width={100} height={100} style={{ opacity: 0.8 }}>
          <Circle cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
        </Svg>,
      );
      expect(svgElement.style.opacity).toBe('0.8');
    });
    it('updates children dynamically', () => {
      const { getByTestId, rerender } = renderWithProviders(
        <Svg width={100} height={100}>
          <Circle data-testid="dynamic-circle" cx="50" cy="50" r="40" stroke="currentColor" fill="none" />
        </Svg>,
      );
      const circleElement = getByTestId('dynamic-circle');
      expect(circleElement.getAttribute('r')).toBe('40');
      rerender(
        <Svg width={100} height={100}>
          <Circle data-testid="dynamic-circle" cx="50" cy="50" r="60" stroke="currentColor" fill="none" />
        </Svg>,
      );
      expect(circleElement.getAttribute('r')).toBe('60');
    });
  });

  it('defaults color to the scheme token, not a hardcoded fill', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');
    const stories = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Svg.stories.tsx'), 'utf8');
    expect(src).toMatch(/color: ['"]\$color['"]/);
    expect(src).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(stories).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(stories).toContain('currentColor');
  });
});
