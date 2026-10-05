import { renderWithProviders } from '@repo/test-utils';
/**
 * WheelEdgeFade — the two halves of the edge-fade contract.
 *
 * The contract is a platform split with a contrast reason behind it. On web the
 * wheel viewport carries a CSS mask, so this component must render NOTHING; on
 * native it paints two absolutely-positioned gradient bands as an OVERLAY. The
 * overlay is the whole point: fading the rows themselves would drop their
 * opacity below 1 and take the inactive `$color11` numerals under the AA floor,
 * which is the regression Wheel.test.tsx guards from the other side.
 *
 * Both halves are exercised. A spec that covered only the file the web build
 * resolves would be asserting `null` and calling it a test.
 *
 * `expo-linear-gradient` ships untranspiled JSX in its published build, which
 * the web transform cannot parse, so it is mocked into a probe element. The
 * mock is the gradient, not the component under test: colours, start and end
 * come straight from WheelEdgeFade.
 */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WheelEdgeFade } from './WheelEdgeFade';
import { WheelEdgeFade as NativeWheelEdgeFade } from './WheelEdgeFade.native';

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: { colors?: string[]; start?: unknown; end?: unknown }) => (
    <div
      data-gradient="true"
      data-colors={(props.colors ?? []).join('|')}
      data-start={JSON.stringify(props.start)}
      data-end={JSON.stringify(props.end)}
    />
  ),
}));

afterEach(cleanup);

function bands(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("[style*='height']")) as HTMLElement[];
}

function gradients(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-gradient]')) as HTMLElement[];
}

function colorsOf(node: HTMLElement): string[] {
  return String(node.getAttribute('data-colors') ?? '').split('|');
}

describe('WheelEdgeFade — web', () => {
  it("renders nothing, because the viewport's CSS mask already does the fade", () => {
    const { container } = renderWithProviders(<WheelEdgeFade height={24} />);
    expect(container.querySelector('[data-gradient]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing at every height, so it can never dim a row', () => {
    for (const height of [0, 1, 24, 400]) {
      const { container } = renderWithProviders(<WheelEdgeFade height={height} />);
      expect(container.querySelector('[data-gradient]'), String(height)).toBeNull();
      cleanup();
    }
  });
});

describe('WheelEdgeFade — native', () => {
  it('paints one band per edge, never a single one', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={24} />);
    expect(gradients(container)).toHaveLength(2);
  });

  it('draws nothing at all when the band height is zero or negative', () => {
    const zero = renderWithProviders(<NativeWheelEdgeFade height={0} />);
    expect(gradients(zero.container)).toHaveLength(0);
    cleanup();
    const negative = renderWithProviders(<NativeWheelEdgeFade height={-8} />);
    expect(gradients(negative.container)).toHaveLength(0);
  });

  it('pins one band to the top and one to the bottom', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={30} />);
    const edges = bands(container).map((node) => node.getAttribute('style') ?? '');
    expect(edges.some((style) => /top:\s*0px/.test(style))).toBe(true);
    expect(edges.some((style) => /bottom:\s*0px/.test(style))).toBe(true);
  });

  it('gives each band the height it was handed, so the caller sets the fade depth', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={30} />);
    const heights = bands(container).map((node) => /height:\s*(\d+)px/.exec(node.getAttribute('style') ?? '')?.[1]);
    expect(heights.filter(Boolean)).toEqual(['30', '30']);
    cleanup();
    const taller = renderWithProviders(<NativeWheelEdgeFade height={64} />);
    expect(
      bands(taller.container).map((node) => /height:\s*(\d+)px/.exec(node.getAttribute('style') ?? '')?.[1]),
    ).toEqual(['64', '64']);
  });

  it('keeps the bands out of the way of a drag, so the wheel still scrolls', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={24} />);
    for (const band of bands(container)) {
      expect(band.className).toContain('r-pointerEvents');
      expect(band.className).toContain('r-position');
    }
  });

  it('runs the top band opaque-to-clear and the bottom band clear-to-opaque', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={24} />);
    const [top, bottom] = gradients(container).map(colorsOf);
    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    // The two bands are mirror images: the top starts on the page background
    // and ends transparent, the bottom does the reverse.
    expect(top[0]).toBe(bottom[1]);
    expect(top[1]).toBe(bottom[0]);
    expect(top[1]).toMatch(/,\s*0\)$/);
    expect(top[0]).not.toMatch(/,\s*0\)$/);
  });

  it('derives the fade colour from the theme background rather than a hardcoded white', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={24} />);
    const [opaque, clear] = colorsOf(gradients(container)[0]);
    expect(opaque).toBeTruthy();
    expect(opaque).not.toBe('transparent');
    // The clear stop is the SAME colour at zero alpha, so the band never
    // shifts hue across its length.
    const channels = /rgba\(([^)]+),\s*0\)$/.exec(clear)?.[1];
    expect(channels, `clear stop ${clear} must be the opaque stop at alpha 0`).toBeTruthy();
  });

  it('runs both gradients vertically down the centre line', () => {
    const { container } = renderWithProviders(<NativeWheelEdgeFade height={24} />);
    for (const gradient of gradients(container)) {
      expect(gradient.getAttribute('data-start')).toBe(JSON.stringify({ x: 0.5, y: 0 }));
      expect(gradient.getAttribute('data-end')).toBe(JSON.stringify({ x: 0.5, y: 1 }));
    }
  });
});
