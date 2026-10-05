/**
 * The Matrix stories are the only in-repo render of the view (a
 * subject-by-month grid with gaps). happy-dom runs no layout, so the
 * pinned scrollers are not exercised here; what is asserted is that every
 * story mounts and that the Main story's data really does put a zero and a
 * gap on screen as two different cell states.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import meta, { Default, Intents, WeekRule } from './Matrix.stories';

vi.mock('@repo/storybook', () => ({ action: () => () => undefined }));

afterEach(cleanup);

describe('Matrix stories', () => {
  it('declares the Components/Matrix title', () => {
    expect(meta.title).toBe('Components/Matrix');
  });

  it('every exported story mounts', () => {
    for (const story of [Default, Intents, WeekRule]) {
      const { container } = renderWithProviders(<>{story.render()}</>);
      expect(container.querySelector('[data-matrix-view]')).toBeTruthy();
      cleanup();
    }
  });

  it('the Main story renders a subject-by-month grid where a gap and a zero are different states', () => {
    const { container } = renderWithProviders(<>{Default.render()}</>);
    expect(container.querySelector('[data-matrix-view="month"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-matrix-column]')).toHaveLength(12);
    expect(container.querySelectorAll('[data-matrix-row-label]')).toHaveLength(6);

    const zero = container.querySelector('[data-matrix-cell="savings:2026-04-01"]')!;
    expect(zero.getAttribute('data-matrix-cell-state')).toBe('zero');
    expect(zero.querySelector('[data-matrix-fill]')).toBeTruthy();
    expect(zero.textContent).toBe('0');

    const gap = container.querySelector('[data-matrix-cell="credit:2026-05-01"]')!;
    expect(gap.getAttribute('data-matrix-cell-state')).toBe('empty');
    expect(gap.querySelector('[data-matrix-fill]')).toBeNull();
    expect(gap.textContent).not.toBe('0');

    const hsaRow = container.querySelector('[data-matrix-row="hsa"]')!;
    expect(hsaRow.querySelectorAll('[data-matrix-cell-state="empty"]')).toHaveLength(12);

    const filled = container.querySelector('[data-matrix-cell="checking:2026-12-01"]')!;
    expect(filled.getAttribute('data-matrix-cell-state')).toBe('value');
    expect(filled.querySelector('[data-matrix-fill]')?.getAttribute('data-matrix-fill')).toBe('1');
  });

  it('the Intents story rides the theme ramps and names them in the legend', () => {
    const { container } = renderWithProviders(<>{Intents.render()}</>);
    const down = container.querySelector('[data-matrix-cell="auth:2026-03-05"]')!;
    expect(down.getAttribute('data-matrix-cell-intent')).toBe('error');
    expect(
      container.querySelector('[data-matrix-cell="search:2026-03-01"]')!.getAttribute('data-matrix-cell-state'),
    ).toBe('empty');
    const legend = container.querySelector('[data-matrix-legend]')!;
    expect(legend.textContent).toContain('Healthy');
    expect(legend.textContent).toContain('Degraded');
    expect(legend.textContent).toContain('Down');
  });
});
