import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { ImageGrid } from './ImageGrid';

describe('ImageGrid live-media tile', () => {
  it('does not paint a status pip; tile radius stays UNCLAMPED', () => {
    const src = readFileSync(path.join(import.meta.dirname, 'ImageGrid.tsx'), 'utf-8');
    expect(src).not.toMatch(/capContainerRadius\(|knobProps\.containerRadius|knobProps\.cardSurface/u);
    expect(src).toContain('knobProps.borderRadius');
    expect(src).not.toMatch(/data-status-pip|StatusPip|statusPip/u);

    renderWithProviders(
      <ImageGrid
        items={[
          { id: '1', title: 'Photo A' },
          { id: '2', title: 'Photo B' },
        ]}
        columns={2}
        renderItem={(item) => <div>{item.title}</div>}
        height={400}
      />,
    );
    const cells = document.querySelectorAll<HTMLElement>('[role="gridcell"]');
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.querySelector('[data-status-pip]')).toBeNull();
      expect(cell.dataset.mediaTile).toBe('image-grid');
    }
  });
});
