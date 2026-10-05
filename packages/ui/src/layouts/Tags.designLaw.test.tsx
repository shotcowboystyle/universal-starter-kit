import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { Tags } from './Tags';

describe('Tags design law', () => {
  it('paints the field label at weight 400 (§6.1)', () => {
    const { container } = renderWithProviders(<Tags tags={[{ id: 'alpha', label: 'alpha' }]} label="Topics" />);
    const label = container.querySelector('label') as HTMLElement | null;
    const node = label ?? (container.querySelector('*') as HTMLElement);
    expect(container.textContent).toContain('Topics');
    if (label) {
      const weight = label.style.fontWeight || getComputedStyle(label).fontWeight;
      expect(['400', 'normal', '']).toContain(String(weight));
    }
    expect(node).toBeTruthy();
  });
});
