import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GanttView, type GanttTask } from './Gantt';
import { addDays, computeGanttRange, dateToX, rangeDays, startOfDay } from './ganttMath';

// Match the Carousel layout harness: RNW measures through ResizeObserver and
// a deferred offsetWidth read. Keep prototype patches isolated to this file.
let viewportWidth = 178;
const resizeCallbacks = new Map<Element, () => void>();
vi.stubGlobal(
  'ResizeObserver',
  class {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const notify = () => {
        this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
      };
      resizeCallbacks.set(target, notify);
      notify();
    }
    unobserve(target: Element) {
      resizeCallbacks.delete(target);
    }
    disconnect() {}
  },
);
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => viewportWidth,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 240,
});
const scrollCalls: number[] = [];
Object.defineProperty(HTMLElement.prototype, 'scroll', {
  configurable: true,
  writable: true,
  value(options: { left?: number }) {
    if (typeof options.left === 'number') {
      scrollCalls.push(options.left);
    }
  },
});

const today = startOfDay(new Date());
const tasks: GanttTask[] = [{ id: 'track', title: 'Track', start: addDays(today, -44), end: addDays(today, 19) }];
const range = computeGanttRange([{ start: tasks[0].start!, end: tasks[0].end! }], 'week', today);
const chartWidth = rangeDays(range) * 24;
const anchorX = dateToX(today, range.start, 24);

async function flushLayout() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  viewportWidth = 178;
  scrollCalls.length = 0;
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('dir');
});

describe('Gantt measured viewport anchoring', () => {
  it('reanchors a narrow LTR mount after layout so the marker is inside the viewport', async () => {
    renderWithProviders(<GanttView tasks={tasks} initialDate={today} markerDate={today} />);
    await flushLayout();
    const left = scrollCalls.at(-1)!;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThanOrEqual(chartWidth - viewportWidth);
    expect(anchorX + 12 - left).toBeGreaterThanOrEqual(0);
    expect(anchorX + 12 - left).toBeLessThan(viewportWidth);
  });

  it('keeps the narrow RTL marker inside the mirrored viewport', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    renderWithProviders(<GanttView tasks={tasks} initialDate={today} markerDate={today} />);
    await flushLayout();
    const markerLeft = chartWidth - anchorX - 12 - scrollCalls.at(-1)!;
    expect(markerLeft).toBeGreaterThanOrEqual(0);
    expect(markerLeft).toBeLessThan(viewportWidth);
  });

  it('retains its pending anchor through a hidden zero-width first layout', async () => {
    viewportWidth = 0;
    renderWithProviders(<GanttView tasks={tasks} initialDate={today} markerDate={today} />);
    await flushLayout();
    viewportWidth = 178;
    for (const notify of resizeCallbacks.values()) {
      notify();
    }
    await flushLayout();
    const markerLeft = anchorX + 12 - scrollCalls.at(-1)!;
    expect(markerLeft).toBeGreaterThanOrEqual(0);
    expect(markerLeft).toBeLessThan(viewportWidth);
  });

  it('preserves the desktop anchor inset', async () => {
    viewportWidth = 820;
    renderWithProviders(<GanttView tasks={tasks} initialDate={today} />);
    await flushLayout();
    expect(scrollCalls.at(-1)).toBe(anchorX - 180);
  });

  it('clamps a range-end anchor to the measured scroll extent', async () => {
    viewportWidth = 820;
    renderWithProviders(<GanttView tasks={tasks} initialDate={addDays(range.end, -1)} />);
    await flushLayout();
    expect(scrollCalls.at(-1)).toBeLessThanOrEqual(chartWidth - viewportWidth);
  });

  it('uses the measured viewport for the Today action', async () => {
    const result = renderWithProviders(<GanttView tasks={tasks} initialDate={range.start} />);
    await flushLayout();
    scrollCalls.length = 0;
    fireEvent.click(result.getByRole('button', { name: 'Today' }));
    const markerLeft = anchorX + 12 - scrollCalls.at(-1)!;
    expect(markerLeft).toBeGreaterThanOrEqual(0);
    expect(markerLeft).toBeLessThan(viewportWidth);
  });
});
