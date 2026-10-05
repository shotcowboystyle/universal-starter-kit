import { renderWithProviders } from '@repo/test-utils';
import { defaultPreset, Preset, resolveChartPalette, useChartPalette, type ChartPalette } from '@repo/theme';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { Theme } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarChart } from './BarChart';
import { resolveSeriesFills } from './composeChart';
import { AreaChart, LineChart } from './LineChart';
import { PieChart } from './PieChart';
import { Sparkline } from './Sparkline';
import type { ChartDatum } from './types';

import * as ChartExports from './index';

afterEach(cleanup);

const data: ChartDatum[] = [
  { label: 'Jan', value: 400 },
  { label: 'Feb', value: 380 },
  { label: 'May', value: 1200 },
  { label: 'Jun', value: 900 },
];

function PaletteProbe({ into }: { into: { current?: ChartPalette } }) {
  into.current = useChartPalette();
  return null;
}

function markRects(): Element[] {
  // Bar marks are value-end-rounded paths with a resolved fill.
  return Array.from(document.querySelectorAll('svg [data-mpo-chart-bar]'));
}

function barBox(bar: Element) {
  const [x, y, width, height, radius] = String(bar.getAttribute('data-mpo-chart-bar')).split(',').map(Number);
  return { x, y, width, height, radius };
}

function targetRects(): Element[] {
  return Array.from(document.querySelectorAll('svg rect[fill="transparent"]'));
}

// In happy-dom onLayout never fires, so every chart passes an explicit width.
const WIDTH = 400;

it('routes stock Sparkline as a declared area or line with its complete data count', () => {
  const { rerender } = renderWithProviders(<Sparkline data={[1, 2, 3]} width={WIDTH} />);
  expect(document.querySelector('svg')?.getAttribute('data-mpo-chart')).toBe('area');
  expect(document.querySelector('svg')?.getAttribute('data-mpo-chart-datum-count')).toBe('3');
  expect(document.querySelector('svg')?.getAttribute('data-mpo-chart-datum-text')).toBe('false');
  rerender(<Sparkline data={[1, 2, 3]} width={WIDTH} showArea={false} />);
  expect(document.querySelector('svg')?.getAttribute('data-mpo-chart')).toBe('line');
});

describe('BarChart', () => {
  it('declares chart kind and marks without claiming a complete datum alternative', () => {
    renderWithProviders(<BarChart data={data} width={WIDTH} onDatumPress={vi.fn()} />);
    const root = document.querySelector('svg')!;
    expect(root.getAttribute('data-mpo-chart')).toBe('bar');
    expect(root.getAttribute('data-mpo-chart-datum-count')).toBe(String(data.length));
    expect(root.getAttribute('data-mpo-chart-datum-text')).toBe('false');
    expect(root.querySelectorAll('[data-mpo-chart-mark]').length).toBe(data.length);
    expect(targetRects().every((target) => !target.hasAttribute('data-mpo-chart-mark'))).toBe(true);
  });

  it('renders one identity-colored bar per datum (single series)', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={palette} />
        <BarChart data={data} width={WIDTH} />
      </>,
    );
    const bars = markRects();
    expect(bars.length).toBe(data.length);
    for (const bar of bars) {
      expect(bar.getAttribute('fill')).toBe(palette.current?.single);
    }
  });

  it('categorical mode takes the identity-led categorical palette', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={palette} />
        <BarChart data={data} width={WIDTH} categorical />
      </>,
    );
    const fills = markRects().map((bar) => bar.getAttribute('fill'));
    expect(fills).toEqual(palette.current?.categorical.slice(0, data.length));
  });

  it('re-anchors the identity under a tint sub-theme', () => {
    const base: { current?: ChartPalette } = {};
    const tinted: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={base} />
        <Theme name={'red' as never}>
          <PaletteProbe into={tinted} />
          <BarChart data={data} width={WIDTH} />
        </Theme>
      </>,
    );
    expect(tinted.current?.single).not.toBe(base.current?.single);
    for (const bar of markRects()) {
      expect(bar.getAttribute('fill')).toBe(tinted.current?.single);
    }
  });

  it('passes explicit data colors through untouched (VALUE IS DATA)', () => {
    renderWithProviders(
      <BarChart
        data={[
          { label: 'custom', value: 5, color: '#123456' },
          { label: 'default', value: 5 },
        ]}
        width={WIDTH}
      />,
    );
    const fills = markRects().map((bar) => bar.getAttribute('fill'));
    expect(fills[0]).toBe('#123456');
    expect(fills[1]).not.toBe('#123456');
  });

  it('exposes role=img with a generated data summary (Axiom 12)', () => {
    renderWithProviders(<BarChart data={data} width={WIDTH} title="Revenue" />);
    const img = screen.getByRole('img');
    const label = img.getAttribute('aria-label') ?? '';
    expect(label).toContain('Bar chart, Revenue');
    expect(label).toContain('highest May (1,200)');
    expect(label).toContain('lowest Feb (380)');
  });

  it('renders 44px-floor hit targets with per-datum names when interactive', () => {
    const onDatumPress = vi.fn();
    renderWithProviders(<BarChart data={data} width={WIDTH} onDatumPress={onDatumPress} />);
    const targets = targetRects();
    expect(targets.length).toBe(data.length);
    for (const target of targets) {
      expect(Number(target.getAttribute('width'))).toBeGreaterThanOrEqual(44);
    }
    expect(targets[2].getAttribute('aria-label')).toBe('May: 1,200');
    fireEvent.click(targets[2]);
    expect(onDatumPress).toHaveBeenCalledWith(data[2], 2);
  });

  it('renders y grid lines and axis labels from d3 ticks', () => {
    renderWithProviders(<BarChart data={data} width={WIDTH} />);
    expect(document.querySelectorAll('svg line').length).toBeGreaterThan(0);
    const texts = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(texts).toContain('Jan');
    expect(texts).toContain('0');
  });

  it('renders nothing but the accessible summary for empty data', () => {
    renderWithProviders(<BarChart data={[]} width={WIDTH} />);
    expect(markRects().length).toBe(0);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toContain('no data');
  });

  it('pins the value axis to an explicit domain without nicing', () => {
    const { unmount: unmountShort } = renderWithProviders(
      <BarChart data={[{ label: 'atk', value: 90 }]} width={WIDTH} domain={[0, 180]} />,
    );
    const shortHeight = barBox(markRects()[0]).height;
    unmountShort();

    const { unmount: unmountFull } = renderWithProviders(
      <BarChart data={[{ label: 'atk', value: 180 }]} width={WIDTH} domain={[0, 180]} />,
    );
    const fullHeight = barBox(markRects()[0]).height;
    expect(fullHeight).toBeGreaterThan(0);
    expect(shortHeight / fullHeight).toBeCloseTo(0.5, 1);
    unmountFull();

    // 255 on a 0–255 scale must not nice out to 260 (ticks would show 260).
    renderWithProviders(<BarChart data={[{ label: 'hp', value: 255 }]} width={WIDTH} domain={[0, 255]} />);
    const ticks = Array.from(document.querySelectorAll('svg text')).map((node) => node.textContent);
    expect(ticks).not.toContain('260');
  });
});

describe('LineChart / AreaChart', () => {
  it('distinguishes area composition from a plain line', () => {
    const { rerender } = renderWithProviders(<LineChart data={data} width={WIDTH} />);
    expect(document.querySelector('svg')?.getAttribute('data-mpo-chart')).toBe('line');
    rerender(<AreaChart data={data} width={WIDTH} />);
    expect(document.querySelector('svg')?.getAttribute('data-mpo-chart')).toBe('area');
  });
  it('strokes the line and dots with the palette identity', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={palette} />
        <LineChart data={data} width={WIDTH} />
      </>,
    );
    const path = document.querySelector('svg path[fill="none"]');
    expect(path?.getAttribute('stroke')).toBe(palette.current?.single);
    const dots = document.querySelectorAll("svg circle:not([fill='transparent'])");
    expect(dots.length).toBe(data.length);
  });

  it('renders 44px point targets when interactive', () => {
    const onDatumPress = vi.fn();
    renderWithProviders(<LineChart data={data} width={WIDTH} onDatumPress={onDatumPress} />);
    const targets = Array.from(document.querySelectorAll('svg circle[fill="transparent"]'));
    expect(targets.length).toBe(data.length);
    for (const target of targets) {
      expect(Number(target.getAttribute('r'))).toBeGreaterThanOrEqual(22);
    }
    fireEvent.click(targets[0]);
    expect(onDatumPress).toHaveBeenCalledWith(data[0], 0);
  });

  it('AreaChart adds the soft area fill under the identity line', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={palette} />
        <AreaChart data={data} width={WIDTH} />
      </>,
    );
    const area = Array.from(document.querySelectorAll('svg [data-mpo-chart-mark]')).find(
      (p) => p.getAttribute('fill') !== 'none' && p.getAttribute('opacity'),
    );
    expect(area).toBeDefined();
    expect(area?.getAttribute('fill')).toBe(palette.current?.single);
  });
});

describe('PieChart', () => {
  it('exposes every datum alternative without a twelve-item cap', () => {
    const many = Array.from({ length: 13 }, (_, index) => ({
      label: `Region ${index}`,
      value: index + 1,
    }));
    renderWithProviders(<PieChart data={many} donut />);
    const root = document.querySelector('svg')!;
    expect(root.getAttribute('data-mpo-chart')).toBe('donut');
    expect(root.getAttribute('data-mpo-chart-datum-count')).toBe('13');
    expect(root.getAttribute('data-mpo-chart-separated')).toBe('true');
    expect(document.querySelectorAll('[data-mpo-chart-datum-label]').length).toBe(13);
    expect(document.querySelectorAll('[data-mpo-chart-datum-value]').length).toBe(13);
    expect(root.querySelectorAll('[data-mpo-chart-mark]').length).toBe(13);
  });

  const pieData: ChartDatum[] = [
    { label: 'A', value: 4 },
    { label: 'B', value: 3 },
    { label: 'C', value: 2 },
  ];

  it('keeps mask IDs unique across mounted charts and preserves the actual slice path', () => {
    renderWithProviders(
      <>
        <PieChart data={pieData} />
        <PieChart data={pieData} donut />
      </>,
    );
    const masks = Array.from(document.querySelectorAll('mask'));
    expect(masks).toHaveLength(6);
    expect(new Set(masks.map((mask) => mask.id)).size).toBe(6);
    for (const mark of document.querySelectorAll('[data-mpo-chart-mark]')) {
      const id = mark.getAttribute('mask')!.slice(5, -1);
      const mask = document.getElementById(id)!;
      expect(mask.getAttribute('mask-type')).toBe('luminance');
      expect(mask.children[0].getAttribute('d')).toBe(mark.getAttribute('d'));
    }
  });

  it.each([
    { data: pieData, padAngle: 0 },
    {
      data: [
        { label: 'Large', value: 9999 },
        { label: 'Small', value: 1 },
      ],
    },
    { data: [{ label: 'Only', value: 1 }] },
  ])('preserves explicit zero, thin positives and single-datum geometry: %j', (props) => {
    renderWithProviders(<PieChart {...props} />);
    expect(document.querySelectorAll('mask')).toHaveLength(0);
    expect(document.querySelectorAll('[data-mpo-chart-mark]')).toHaveLength(props.data.length);
    expect(document.querySelector('svg')?.getAttribute('data-mpo-chart-separated')).toBe('false');
  });

  it('slices take the categorical palette in data order', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={palette} />
        <PieChart data={pieData} showLegend={false} />
      </>,
    );
    const fills = Array.from(document.querySelectorAll('svg [data-mpo-chart-mark]')).map((p) => p.getAttribute('fill'));
    expect(fills).toEqual(palette.current?.categorical.slice(0, pieData.length));
  });

  it('legend rows carry label and formatted value', () => {
    renderWithProviders(<PieChart data={pieData} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('per-slice press targets carry share-aware names', () => {
    const onDatumPress = vi.fn();
    renderWithProviders(<PieChart data={pieData} showLegend={false} onDatumPress={onDatumPress} />);
    const slices = Array.from(document.querySelectorAll('svg [data-mpo-chart-mark]'));
    expect(slices[0].getAttribute('aria-label')).toBe('A: 4 (44%)');
    fireEvent.click(slices[1]);
    expect(onDatumPress).toHaveBeenCalledWith(pieData[1], 1);
  });

  it('donut hole is genuine geometry — no background cover circle', () => {
    renderWithProviders(<PieChart data={pieData} donut showLegend={false} />);
    expect(document.querySelectorAll('svg circle').length).toBe(0);
  });

  describe('legend containment', () => {
    it('root shrinks with its frame and wraps — never holds intrinsic width', () => {
      const { container } = renderWithProviders(<PieChart data={pieData} />);
      const legend = container.querySelector('[data-pie-legend="true"]') as HTMLElement;
      expect(legend).toBeTruthy();
      const root = legend.parentElement as HTMLElement;
      const rootStyle = getComputedStyle(root);
      // A row parent (e.g. Card.Footer) may constrain the chart below its
      // intrinsic width; the wrap then stacks the legend under the pie.
      expect(rootStyle.flexWrap).toBe('wrap');
      expect(rootStyle.flexShrink).toBe('1');
      expect(rootStyle.minWidth).toBe('0px');
      // The legend keeps its wrap floor so it breaks to a full-width line
      // instead of squeezing beside the pie.
      expect(getComputedStyle(legend).minWidth).toBe('140px');
    });

    it('legend rows truncate the label, never the value (Axiom 11)', () => {
      const { container } = renderWithProviders(
        <PieChart data={[{ label: 'A very long category label that truncates', value: 1234567 }]} />,
      );
      const legend = container.querySelector('[data-pie-legend="true"]') as HTMLElement;
      const label = screen.getByText('A very long category label that truncates');
      const value = screen.getByText((1234567).toLocaleString());
      expect(legend.contains(label)).toBe(true);
      expect(legend.contains(value)).toBe(true);
      // Label yields: single-line ellipsis + shrinkable flex basis.
      const labelStyle = getComputedStyle(label);
      expect(labelStyle.textOverflow).toBe('ellipsis');
      // Value is data: it never shrinks below its content.
      expect(getComputedStyle(value).flexShrink).toBe('0');
    });

    it('no legend frame renders when showLegend is false', () => {
      const { container } = renderWithProviders(<PieChart data={pieData} showLegend={false} />);
      expect(container.querySelector('[data-pie-legend="true"]')).toBeNull();
    });
  });
});

describe('Sparkline', () => {
  it('accepts bare numbers and renders an identity line', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <>
        <PaletteProbe into={palette} />
        <Sparkline data={[1, 3, 2, 5]} width={120} />
      </>,
    );
    const line = document.querySelector('svg path[fill="none"]');
    expect(line?.getAttribute('stroke')).toBe(palette.current?.single);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Sparkline');
  });
});

describe('animation knob (A-CONTINUOUS)', () => {
  it('renders identically at animation=none — no driver, no enter styles', () => {
    renderWithProviders(
      <Preset overrides={{ animation: 'none' }}>
        <BarChart data={data} width={WIDTH} />
      </Preset>,
    );
    expect(markRects().length).toBe(data.length);
  });
});

describe('categorical cycle is a third list', () => {
  it('resolveSeriesFills reads palette.categorical, never preset.tints', () => {
    const palette = resolveChartPalette({ scheme: 'light' });
    const fills = resolveSeriesFills(
      [
        { label: 'a', value: 1 },
        { label: 'b', value: 2 },
        { label: 'c', value: 3 },
      ],
      palette,
      { categorical: true },
    );
    expect(fills).toEqual(palette.categorical.slice(0, 3));
    // Tint family is theme names (orange/blue/…); categorical is solids.
    for (const fill of fills) {
      expect(defaultPreset.tints).not.toContain(fill);
    }
    expect(palette.categorical).not.toEqual(defaultPreset.tints);
  });

  it('bar categorical marks stay on the palette cycle under a tint theme', () => {
    const palette: { current?: ChartPalette } = {};
    renderWithProviders(
      <Theme name={'orange' as never}>
        <PaletteProbe into={palette} />
        <BarChart data={data} width={WIDTH} categorical />
      </Theme>,
    );
    const fills = markRects().map((bar) => bar.getAttribute('fill'));
    expect(fills).toEqual(palette.current?.categorical.slice(0, data.length));
    for (const fill of fills) {
      expect(defaultPreset.tints).not.toContain(fill);
    }
  });
});

describe('charts barrel', () => {
  it('exports the headless core, primitives, and composed charts', () => {
    for (const name of [
      'createBandScale',
      'createLinearScale',
      'createPointScale',
      'createTimeScale',
      'linePath',
      'areaPath',
      'pieSlices',
      'arcPath',
      'describeChart',
      'describeDatum',
      'useChartTheme',
      'ChartSurface',
      'XAxis',
      'YAxis',
      'BarSeries',
      'LineSeries',
      'AreaSeries',
      'PieSeries',
      'BarChart',
      'LineChart',
      'AreaChart',
      'PieChart',
      'Sparkline',
      'computeCartesianPlot',
      'resolveSeriesFills',
    ]) {
      expect(ChartExports).toHaveProperty(name);
    }
  });
});

describe('BarChart corners: DEFAULT class on the value end only', () => {
  const radii = (borderRadius: 'none' | 'small' | 'medium' | 'large' | 'full') => {
    renderWithProviders(
      <Preset overrides={{ borderRadius }}>
        <BarChart data={data} width={WIDTH} />
      </Preset>,
    );
    const boxes = markRects().map(barBox);
    cleanup();
    return boxes;
  };

  it('takes 0 / 5 / 9 / 16 px below full', () => {
    expect(radii('none').map((b) => b.radius)).toEqual(data.map(() => 0));
    expect(radii('small').map((b) => b.radius)).toEqual(data.map(() => 5));
    expect(radii('medium').map((b) => b.radius)).toEqual(data.map(() => 9));
    for (const box of radii('large')) {
      expect(box.radius).toBe(Math.min(16, box.width / 2));
    }
  });

  it('caps full at half the band, a round value end on a square foot', () => {
    for (const box of radii('full')) {
      expect(box.radius).toBe(Math.min(box.width / 2, box.height));
    }
  });

  it('draws the baseline corners square', () => {
    renderWithProviders(
      <Preset overrides={{ borderRadius: 'large' }}>
        <BarChart data={data} width={WIDTH} />
      </Preset>,
    );
    for (const bar of markRects()) {
      const { x, y, height } = barBox(bar);
      expect(bar.getAttribute('d')).toMatch(new RegExp(`^M${x},${y + height}V`));
    }
  });
});
