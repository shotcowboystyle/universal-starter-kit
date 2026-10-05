import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from './index';

vi.mock('@repo/theme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/theme')>()),
  useReadableTextOn: () => '#fff',
}));

describe('selected tab ink follows its painted surface', () => {
  it('uses page-surface ink for the band even when contained tint needs white ink', () => {
    const result = renderWithProviders(
      <Tabs variant="band" value="one" items={[{ value: 'one', label: 'Selected' }]} />,
    );
    expect(result.getByText('Selected').className).toContain('_col-color');
  });
  it('keeps contrasting tint ink for the contained indicator', () => {
    const result = renderWithProviders(
      <Tabs variant="contained" value="one" items={[{ value: 'one', label: 'Selected' }]} />,
    );
    expect(result.getByText('Selected').className).not.toContain('_col-color');
  });
});
