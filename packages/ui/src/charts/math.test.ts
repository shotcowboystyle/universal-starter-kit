import { describe, expect, it } from 'vitest';

import { describeChart, describeDatum } from './accessibility';
import {
  approximateTextWidth,
  barPath,
  arcCentroid,
  arcPath,
  areaPath,
  createBandScale,
  createLinearScale,
  createPointScale,
  createTimeScale,
  getLinearTicks,
  getTimeTicks,
  linePath,
  pieSlices,
  canMaskPieSlices,
  truncateLabel,
  valueDomain,
} from './math';

describe('pie mask preserves a positive interior', () => {
  const slices = (values: number[]) => pieSlices(values.map((value) => ({ value })));
  it('accepts ordinary pie and donut slices including a wedge larger than pi', () => {
    expect(canMaskPieSlices(slices([70, 20, 10]), 0, 100)).toBe(true);
    expect(canMaskPieSlices(slices([70, 20, 10]), 55, 100)).toBe(true);
  });
  it('keeps the whole original chart when one positive slice is too thin', () => {
    expect(canMaskPieSlices(slices([9999, 1]), 0, 100)).toBe(false);
    expect(canMaskPieSlices(slices([9999, 1]), 55, 100)).toBe(false);
    expect(canMaskPieSlices(slices([50, 50]), 99, 100)).toBe(false);
  });
  it('does not erode a single positive full circle or invalid geometry', () => {
    expect(canMaskPieSlices(slices([100]), 0, 100)).toBe(false);
    expect(canMaskPieSlices(slices([0, 100]), 55, 100)).toBe(false);
    expect(canMaskPieSlices(slices([50, 50]), 0, NaN)).toBe(false);
  });
});

describe('charts/math scales', () => {
  it('band scale maps categories into the pixel range with padding', () => {
    const scale = createBandScale({ domain: ['a', 'b', 'c'], range: [0, 300] });
    expect(scale('a')).toBeDefined();
    expect(scale.bandwidth()).toBeGreaterThan(0);
    // Bands stay inside the range.
    for (const label of ['a', 'b', 'c']) {
      const x = scale(label) as number;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + scale.bandwidth()).toBeLessThanOrEqual(300);
    }
    // Order preserved.
    expect(scale('a') as number).toBeLessThan(scale('b') as number);
    expect(scale('b') as number).toBeLessThan(scale('c') as number);
  });

  it('point scale spreads categories across the range', () => {
    const scale = createPointScale({ domain: ['a', 'b', 'c'], range: [0, 100] });
    expect(scale('a')).toBe(0);
    expect(scale('b')).toBe(50);
    expect(scale('c')).toBe(100);
    expect(scale.bandwidth()).toBe(0);
  });

  it('linear scale maps values and inverts for the y axis', () => {
    const scale = createLinearScale({ domain: [0, 100], range: [200, 0], nice: false });
    expect(scale(0)).toBe(200);
    expect(scale(100)).toBe(0);
    expect(scale(50)).toBe(100);
  });

  it('time scale maps dates monotonically', () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-12-31');
    const scale = createTimeScale({ domain: [start, end], range: [0, 365], nice: false });
    expect(scale(start)).toBe(0);
    expect(scale(new Date('2026-06-01'))).toBeGreaterThan(100);
    expect(scale(end)).toBe(365);
    expect(getTimeTicks(scale, 4).length).toBeGreaterThan(0);
  });

  it('nice ticks come from the scale domain', () => {
    const scale = createLinearScale({ domain: [0, 870], range: [0, 1] });
    const ticks = getLinearTicks(scale, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(800);
  });
});

describe('charts/math valueDomain', () => {
  it('anchors at zero by default (honest bars)', () => {
    expect(valueDomain([400, 870])).toEqual([0, 870]);
  });

  it('keeps negative minimums', () => {
    expect(valueDomain([-20, 50])[0]).toBe(-20);
  });

  it('respects zeroBased=false (sparkline trend window)', () => {
    const [min, max] = valueDomain([400, 870], { zeroBased: false });
    expect(min).toBe(400);
    expect(max).toBe(870);
  });

  it('opens a degenerate single-value domain', () => {
    const [min, max] = valueDomain([5, 5]);
    expect(max).toBeGreaterThan(min);
  });

  it('handles empty input', () => {
    expect(valueDomain([])).toEqual([0, 1]);
  });
});

describe('charts/math shape generators', () => {
  const points = [
    { x: 0, y: 100 },
    { x: 50, y: 20 },
    { x: 100, y: 60 },
  ];

  it('linePath emits an SVG path through every point', () => {
    const d = linePath(points);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('100');
  });

  it('areaPath closes down to the baseline', () => {
    const d = areaPath(points, { baseline: 120 });
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('Z');
    expect(d).toContain('120');
  });

  it('monotone curve produces cubic segments', () => {
    const d = linePath(points, { curve: 'monotone' });
    expect(d).toContain('C');
  });

  it('pieSlices preserves input order and covers the full circle', () => {
    const slices = pieSlices([{ value: 1 }, { value: 3 }, { value: 2 }]);
    expect(slices.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(slices[0].startAngle).toBe(0);
    expect(slices[2].endAngle).toBeCloseTo(Math.PI * 2, 6);
    // Angular size follows value share.
    const size = (s: { startAngle: number; endAngle: number }) => s.endAngle - s.startAngle;
    expect(size(slices[1])).toBeGreaterThan(size(slices[0]));
  });

  it('arcPath renders a slice; innerRadius produces a donut hole', () => {
    const pieD = arcPath({ startAngle: 0, endAngle: Math.PI, outerRadius: 50 });
    const donutD = arcPath({ startAngle: 0, endAngle: Math.PI, outerRadius: 50, innerRadius: 25 });
    expect(pieD.length).toBeGreaterThan(0);
    expect(donutD).not.toBe(pieD);
    // Donut path carries the inner-radius arc.
    expect(donutD).toContain('25');
  });

  it('arcCentroid sits between inner and outer radii', () => {
    const { x, y } = arcCentroid({ startAngle: 0, endAngle: Math.PI / 2, outerRadius: 100 });
    const distance = Math.hypot(x, y);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(100);
  });
});

describe('charts/math label fitting', () => {
  it('keeps short labels and truncates long ones with an ellipsis', () => {
    expect(truncateLabel('May', 12, 100)).toBe('May');
    const truncated = truncateLabel('Extremely long category label', 12, 60);
    expect(truncated.endsWith('\u2026')).toBe(true);
    expect(approximateTextWidth(truncated, 12)).toBeLessThanOrEqual(60);
  });
});

describe('charts/accessibility', () => {
  const data = [
    { label: 'Jan', value: 400 },
    { label: 'May', value: 1200 },
    { label: 'Jun', value: 900 },
  ];

  it('summarizes count, highest, and lowest', () => {
    const summary = describeChart({ typeLabel: 'Bar chart', title: 'Revenue', data });
    expect(summary).toContain('Bar chart, Revenue');
    expect(summary).toContain('3 data points');
    expect(summary).toContain('highest May (1,200)');
    expect(summary).toContain('lowest Jan (400)');
  });

  it('includes the total for share-based charts', () => {
    const summary = describeChart({ typeLabel: 'Pie chart', data, includeShare: true });
    expect(summary).toContain('total 2,500');
  });

  it('handles empty and single-point data', () => {
    expect(describeChart({ typeLabel: 'Line chart', data: [] })).toBe('Line chart: no data');
    expect(describeChart({ typeLabel: 'Line chart', data: [data[0]] })).toContain('1 data point');
  });

  it('names a datum, optionally with its share', () => {
    expect(describeDatum({ datum: data[1] })).toBe('May: 1,200');
    expect(describeDatum({ datum: data[1], total: 2400 })).toBe('May: 1,200 (50%)');
  });
});

describe('charts/math barPath rounds only the value end', () => {
  it('draws a square box at radius 0', () => {
    expect(barPath({ x: 0, y: 10, width: 20, height: 40, radius: 0, valueEnd: 'top' })).toBe('M0,10H20V50H0Z');
  });

  it('rounds the top corners of a positive bar and keeps the baseline square', () => {
    expect(barPath({ x: 0, y: 10, width: 20, height: 40, radius: 5, valueEnd: 'top' })).toBe(
      'M0,50V15A5,5 0 0 1 5,10H15A5,5 0 0 1 20,15V50Z',
    );
  });

  it('rounds the bottom corners of a negative bar', () => {
    expect(barPath({ x: 0, y: 10, width: 20, height: 40, radius: 5, valueEnd: 'bottom' })).toBe(
      'M0,10H20V45A5,5 0 0 1 15,50H5A5,5 0 0 1 0,45Z',
    );
  });

  it('clamps the radius to half the width and to the height', () => {
    expect(barPath({ x: 0, y: 0, width: 20, height: 40, radius: 50, valueEnd: 'top' })).toBe(
      'M0,40V10A10,10 0 0 1 10,0H10A10,10 0 0 1 20,10V40Z',
    );
    expect(barPath({ x: 0, y: 0, width: 20, height: 4, radius: 9, valueEnd: 'top' })).toBe(
      'M0,4V4A4,4 0 0 1 4,0H16A4,4 0 0 1 20,4V4Z',
    );
  });
});
