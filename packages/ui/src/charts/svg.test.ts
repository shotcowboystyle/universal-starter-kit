import { describe, expect, it, vi } from 'vitest';

import {
  chartChromeProps,
  chartDatumTextProps,
  chartMarkProps,
  chartRootA11yProps,
  chartWebProps,
  luminanceMaskProps,
} from './svg';

vi.mock(import('@repo/platform'), async (importOriginal) => ({ ...(await importOriginal()), isWeb: false }));

describe('native SVG props', () => {
  it('keeps browser audit attributes off native SVG props', () => {
    expect(
      chartRootA11yProps('Revenue', {
        kind: 'bar',
        separated: true,
        datumText: false,
        datumCount: 13,
      }),
    ).toStrictEqual({ accessible: true, accessibilityRole: 'image', accessibilityLabel: 'Revenue' });
    expect(luminanceMaskProps()).toStrictEqual({ maskType: 'luminance' });
    expect(chartMarkProps('North')).toStrictEqual({});
    expect(chartChromeProps('grid')).toStrictEqual({});
    expect(chartDatumTextProps(12)).toStrictEqual({});
    expect(chartWebProps({ 'data-mpo-chart-owner': 'true' })).toStrictEqual({});
  });
});
