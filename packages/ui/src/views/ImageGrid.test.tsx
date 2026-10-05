import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { ImageGrid } from './ImageGrid';

const here = dirname(fileURLToPath(import.meta.url));

describe('ImageGrid live-media tile', () => {
  it('does not paint a status pip; tile radius stays UNCLAMPED', () => {
    const src = readFileSync(join(here, 'ImageGrid.tsx'), 'utf8');
    expect(src).not.toMatch(/capContainerRadius\(|knobProps\.containerRadius|knobProps\.cardSurface/);
    expect(src).toContain('knobProps.borderRadius');
    expect(src).not.toMatch(/data-status-pip|StatusPip|statusPip/);

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
    const cells = document.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBe(2);
    for (const cell of cells) {
      expect(cell.querySelector('[data-status-pip]')).toBeNull();
      expect(cell.getAttribute('data-media-tile')).toBe('image-grid');
    }
  });
});
