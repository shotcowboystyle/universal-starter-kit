import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { PieChart } from './PieChart';

afterEach(cleanup);

it.each(['regular', 'bold'] as const)('propagates %s body weight to legend labels and values', (fontWeight) => {
  const { container } = renderWithProviders(
    <Preset overrides={{ fontWeight, bodyFont: 'mono' }}>
      <PieChart data={[{ label: 'Enterprise', value: 55 }]} />
    </Preset>,
  );
  const label = container.querySelector('[data-mpo-chart-datum-label]')!;
  const value = container.querySelector('[data-mpo-chart-datum-value]')!;
  expect(label.textContent).toBe('Enterprise');
  expect(value.textContent).toBe('55');
  for (const node of [label, value]) {
    expect(getComputedStyle(node).fontWeight).toBe(fontWeight === 'bold' ? '700' : '400');
  }
});
