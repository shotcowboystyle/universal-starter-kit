/**
 * XAxis and YAxis are exported from the charts barrel but had no title of
 * their own — only the composed charts had stories. happy-dom runs
 * no layout, so a measured ChartSurface stays at width 0 and draws nothing;
 * these specs render the same axis frame at an explicit pixel size so the
 * marks the stories show are actually asserted.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { XAxis, YAxis } from './Axis';
import meta, { AxisLineAndTicks, Default, LabelTruncation, WideValueRange } from './Axis.stories';
import { ChartSurface } from './ChartSurface';
import { computeCartesianPlot } from './composeChart';
import { createBandScale, createLinearScale } from './math';

afterEach(cleanup);

const categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function Frame({ showGrid = true }: { showGrid?: boolean }) {
  return (
    <ChartSurface label="Axis frame" width={400} height={200}>
      {(size) => {
        const plot = computeCartesianPlot(size, {
          showXAxis: true,
          showYAxis: true,
          yTickLabels: ['0', '25', '50', '75', '100'],
          fontSize: 12,
        });
        const xScale = createBandScale({
          domain: categories,
          range: [plot.x, plot.x + plot.width],
        });
        const yScale = createLinearScale({
          domain: [0, 100],
          range: [plot.y + plot.height, plot.y],
        });
        return (
          <>
            <YAxis plot={plot} scale={yScale} ticks={4} showGrid={showGrid} />
            <XAxis plot={plot} scale={xScale} />
          </>
        );
      }}
    </ChartSurface>
  );
}

describe('Axis stories', () => {
  it('declares the Components/Axis title against the component', () => {
    expect(meta.title).toBe('Components/Axis');
    expect(meta.component).toBeDefined();
  });

  it('every exported story mounts', () => {
    for (const story of [Default, AxisLineAndTicks, LabelTruncation, WideValueRange]) {
      renderWithProviders(<>{story.render?.({} as never, {} as never)}</>);
      cleanup();
    }
    expect(true).toBe(true);
  });

  it('Long labels truncate renders both container widths', () => {
    renderWithProviders(<>{LabelTruncation.render?.({} as never, {} as never)}</>);
    expect(screen.getByText('520px container')).toBeTruthy();
    expect(screen.getByText('280px container')).toBeTruthy();
  });

  it('draws one x label per category and the y grid lines at a fixed size', () => {
    const { container } = renderWithProviders(<Frame />);
    const labels = Array.from(container.querySelectorAll('text')).map((node) => node.textContent);
    for (const category of categories) {
      expect(labels).toContain(category);
    }
    // 4-tick hint, plus the x baseline and one tick mark per category.
    expect(container.querySelectorAll('line').length).toBeGreaterThan(categories.length);
  });

  it('showGrid=false drops the horizontal rules', () => {
    const withGrid = renderWithProviders(<Frame />).container.querySelectorAll('line').length;
    cleanup();
    const withoutGrid = renderWithProviders(<Frame showGrid={false} />).container.querySelectorAll('line').length;
    expect(withoutGrid).toBeLessThan(withGrid);
  });
});
