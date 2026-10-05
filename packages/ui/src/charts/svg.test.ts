import { expect, it, vi } from 'vitest';

vi.mock('@repo/platform', () => ({ isWeb: false }));

import {
  chartChromeProps,
  chartDatumTextProps,
  chartMarkProps,
  chartRootA11yProps,
  chartWebProps,
  luminanceMaskProps,
} from './svg';

it('keeps browser audit attributes off native SVG props', () => {
  expect(
    chartRootA11yProps('Revenue', {
      kind: 'bar',
      separated: true,
      datumText: false,
      datumCount: 13,
    }),
  ).toEqual({ accessible: true, accessibilityRole: 'image', accessibilityLabel: 'Revenue' });
  expect(luminanceMaskProps()).toEqual({ maskType: 'luminance' });
  expect(chartMarkProps('North')).toEqual({});
  expect(chartChromeProps('grid')).toEqual({});
  expect(chartDatumTextProps(12)).toEqual({});
  expect(chartWebProps({ 'data-mpo-chart-owner': 'true' })).toEqual({});
});
