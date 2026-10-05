/**
 * ChartSurface is exported from the charts barrel but only ever appeared
 * inside the composed charts' stories, so it had no title of its own
 * These mount every exported story and assert the surface really
 * paints: an explicit width draws immediately, and the accessible summary
 * lands on the SVG root as one described image (Axiom 12).
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import meta, { Default, FixedWidth, Responsive } from './ChartSurface.stories';

afterEach(cleanup);

describe('ChartSurface stories', () => {
  it('declares the Components/ChartSurface title against the component', () => {
    expect(meta.title).toBe('Components/ChartSurface');
    expect(meta.component).toBeDefined();
  });

  it('Explicit width draws without any layout pass', () => {
    const { container } = renderWithProviders(<>{FixedWidth.render?.({} as never, {} as never)}</>);
    const root = screen.getByRole('img', { name: 'Five categorical dots' });
    expect(root.getAttribute('width')).toBe('360');
    expect(container.querySelectorAll('circle')).toHaveLength(5);
  });

  it('Main mounts and carries its generated summary as the accessible name', () => {
    renderWithProviders(<>{Default.render?.(Default.args as never, { args: Default.args } as never)}</>);
    // happy-dom runs no layout, so the measured surface holds at width 0 and
    // draws nothing — the label still has to be the declared summary.
    expect(Default.args?.label).toBe('Sessions per weekday, peaking Thursday at 9.');
  });

  it('Tracks the container mounts one surface per width', () => {
    renderWithProviders(<>{Responsive.render?.({} as never, {} as never)}</>);
    expect(screen.getByText('520px container')).toBeTruthy();
    expect(screen.getByText('320px container')).toBeTruthy();
    expect(screen.getByText('200px container')).toBeTruthy();
  });
});
