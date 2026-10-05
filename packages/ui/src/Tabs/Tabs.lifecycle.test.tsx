import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Tabs } from './index';

const observed = vi.hoisted(() => ({ scroll: null as any }));
vi.mock('tamagui', async (original) => {
  const actual = await original<any>();
  const React = await import('react');
  return {
    ...actual,
    ScrollView: React.forwardRef((props: any, ref) => {
      observed.scroll = props;
      return React.createElement(actual.ScrollView, { ...props, ref });
    }),
  };
});
const observers: ControlledResizeObserver[] = [];
class ControlledResizeObserver {
  elements = new Set<Element>();
  readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(element: Element) {
    this.elements.add(element);
  }
  unobserve(element: Element) {
    this.elements.delete(element);
  }
  disconnect() {
    this.elements.clear();
  }
}
let precedingGrowth = 0;
const items = Array.from({ length: 6 }, (_, index) => ({
  value: `tab-${index}`,
  label: `Tab ${index + 1}`,
}));
function indexFor(element: HTMLElement) {
  if (element.getAttribute('role') !== 'tab') {
    return -1;
  }
  return Number(element.textContent?.match(/Tab (\d)/)?.[1] ?? 0) - 1;
}
beforeEach(() => {
  precedingGrowth = 0;
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    const index = indexFor(this);
    return index < 0 ? 0 : 100 + (index === 0 ? precedingGrowth : 0);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return indexFor(this) < 0 ? 0 : 40;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    const index = indexFor(this);
    return index < 0 ? 0 : index * 100 + (index > 0 ? precedingGrowth : 0);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function measured() {
  const tree = renderWithProviders(<Tabs items={items} value="tab-5" />);
  const host = tree.container.querySelector('[data-tabs-scroll="true"]') as any;
  const scroll = vi.spyOn(host, 'scrollTo').mockImplementation(() => {});
  act(() => observed.scroll.onLayout({ nativeEvent: { layout: { width: 390 } } }));
  act(() => observed.scroll.onContentSizeChange(600, 40));
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ x: 210, animated: true });
  act(() => observed.scroll.onScroll({ nativeEvent: { contentOffset: { x: 210 } } }));
  scroll.mockClear();
  return { ...tree, scroll };
}
it("uses the primitive's real initial measurement and selection effect", () => {
  measured();
});
it('refreshes selected position after a preceding label grows without resizing the selected trigger', () => {
  const tree = measured();
  precedingGrowth = 100;
  tree.rerender(
    <Tabs
      value="tab-5"
      items={items.map((item, index) => (index === 0 ? { ...item, label: 'Tab 1 with loaded details' } : item))}
    />,
  );
  const first = screen.getByRole('tab', { name: 'Tab 1 with loaded details' });
  act(() => {
    for (const observer of observers) {
      if (observer.elements.has(first)) {
        observer.callback(
          [
            {
              target: first,
              contentRect: first.getBoundingClientRect(),
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          observer as unknown as ResizeObserver,
        );
      }
    }
    observed.scroll.onContentSizeChange(700, 40);
  });
  const selected = screen.getByRole('tab', { name: 'Tab 6' });
  expect(selected.offsetLeft).toBe(600);
  const lastRequest = tree.scroll.mock.calls.at(-1)?.[0] as { x: number } | undefined;
  expect(lastRequest?.x).toBeGreaterThanOrEqual(selected.offsetLeft + selected.offsetWidth - 390);
  expect(lastRequest!.x).toBeLessThanOrEqual(selected.offsetLeft);
  tree.scroll.mockClear();
  act(() => observed.scroll.onScroll({ nativeEvent: { contentOffset: { x: 0 } } }));
  act(() => observed.scroll.onContentSizeChange(700, 40));
  expect(tree.scroll).not.toHaveBeenCalled();
});
