import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabs, tabsScrollIntoViewX } from './index';

const observed = vi.hoisted(() => ({ scroll: null as any, interactions: new Map<string, any>() }));

// The actual component and primitives render. Only public measurement events
// and the imperative scroll boundary are controlled; this is not browser proof.
vi.mock('tamagui', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const React = await import('react');
  return {
    ...actual,
    ScrollView: React.forwardRef((props: any, ref) => {
      observed.scroll = props;
      return React.createElement(actual.ScrollView, { ...props, ref });
    }),
    styled: (...args: any[]) => {
      const Component = actual.styled(...args);
      if (args[0] !== actual.Tabs.Tab) {
        return Component;
      }
      return React.forwardRef((props: any, ref) => {
        observed.interactions.set(props.value, props.onInteraction);
        return React.createElement(Component, { ...props, ref });
      });
    },
  };
});

const items = Array.from({ length: 6 }, (_, index) => ({
  value: `tab-${index}`,
  label: `Tab ${index + 1}`,
}));
const last = { x: 500, y: 0, width: 100, height: 40 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  observed.scroll = null;
  observed.interactions.clear();
  document.documentElement.removeAttribute('dir');
});

function fixture(mode: 'value' | 'defaultValue' = 'value') {
  const rendered = renderWithProviders(<Tabs items={items} {...{ [mode]: 'tab-5' }} />);
  expect(screen.getByRole('tab', { name: 'Tab 6' })).toHaveAttribute('aria-selected', 'true');
  const host = rendered.container.querySelector('[data-tabs-scroll="true"]') as any;
  expect(typeof host.scrollTo).toBe('function');
  const scroll = vi.spyOn(host, 'scrollTo').mockImplementation(() => {});
  const viewport = (width: number) => act(() => observed.scroll.onLayout({ nativeEvent: { layout: { width } } }));
  const content = (width: number) => act(() => observed.scroll.onContentSizeChange(width, 40));
  const active = (layout = last) => act(() => observed.interactions.get('tab-5')('select', layout));
  const manualScroll = (x: number) => act(() => observed.scroll.onScroll({ nativeEvent: { contentOffset: { x } } }));
  return { ...rendered, scroll, viewport, content, active, manualScroll };
}

describe.each(['value', 'defaultValue'] as const)('Tabs public measurement ordering (%s)', (mode) => {
  it('reveals initial last tab when metrics arrive before its layout (control)', () => {
    const tree = fixture(mode);
    tree.viewport(390);
    tree.content(600);
    tree.active();
    expect(tree.scroll).toHaveBeenCalledWith({ x: 210, animated: true });
  });

  it('reveals initial last tab when content arrives after its layout', () => {
    const tree = fixture(mode);
    tree.viewport(390);
    tree.active();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.content(600);
    expect(tree.scroll).toHaveBeenCalled();
  });

  it('corrects after a viewport shrink with unchanged active-tab bounds', () => {
    const tree = fixture(mode);
    tree.viewport(800);
    tree.content(600);
    tree.active();
    expect(tree.scroll).not.toHaveBeenCalled();
    tree.viewport(390);
    expect(tree.scroll).toHaveBeenCalled();
  });

  it('does not force a manual scroll back after the active tab was revealed', () => {
    const tree = fixture(mode);
    tree.viewport(390);
    tree.content(600);
    tree.active();
    expect(tree.scroll).toHaveBeenCalledWith({ x: 210, animated: true });
    tree.scroll.mockClear();
    tree.manualScroll(0);
    expect(tree.scroll).not.toHaveBeenCalled();
  });
});

it.each(['value', 'defaultValue'] as const)('reveals after late viewport measurement (%s)', (mode) => {
  const tree = fixture(mode);
  tree.content(600);
  tree.active();
  expect(tree.scroll).not.toHaveBeenCalled();
  tree.viewport(390);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ x: 210, animated: true });
});

it('retries after a hidden viewport becomes usable and ignores identical measurements', () => {
  const tree = fixture();
  tree.viewport(0);
  tree.content(600);
  tree.active();
  expect(tree.scroll).not.toHaveBeenCalled();
  tree.viewport(390);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ x: 210, animated: true });
  tree.manualScroll(210);
  tree.scroll.mockClear();
  tree.viewport(390);
  tree.content(600);
  tree.active();
  expect(tree.scroll).not.toHaveBeenCalled();
  tree.viewport(800);
  expect(tree.scroll).not.toHaveBeenCalled();
});

it('rechecks changed content width without fighting subsequent manual scroll', () => {
  const tree = fixture();
  tree.viewport(390);
  tree.content(390);
  tree.active();
  expect(tree.scroll).not.toHaveBeenCalled();
  tree.content(600);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ x: 210, animated: true });
  tree.manualScroll(210);
  tree.scroll.mockClear();
  tree.content(620);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ x: 230, animated: true });
  tree.manualScroll(230);
  tree.scroll.mockClear();
  tree.manualScroll(0);
  tree.active();
  tree.viewport(390);
  tree.content(620);
  expect(tree.scroll).not.toHaveBeenCalled();
  tree.content(650);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ x: 242, animated: true });
});

it("waits for the latest selected tab's layout when dimensions were pending", () => {
  const tree = fixture();
  tree.viewport(390);
  tree.active();
  tree.rerender(<Tabs items={items} value="tab-0" />);
  tree.content(600);
  expect(tree.scroll).not.toHaveBeenCalled();
  act(() => observed.interactions.get('tab-0')('select', { ...last, x: 0 }));
  expect(tree.scroll).not.toHaveBeenCalled();
  expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true');
});

it('uses the negative RTL offset range after delayed dimensions', () => {
  document.documentElement.setAttribute('dir', 'rtl');
  const tree = fixture();
  tree.viewport(390);
  tree.active({ ...last, x: 0 });
  tree.content(600);
  expect(tree.scroll).toHaveBeenCalledExactlyOnceWith({ x: -210, animated: true });
  tree.manualScroll(-210);
  tree.scroll.mockClear();
  tree.manualScroll(0);
  expect(tree.scroll).not.toHaveBeenCalled();
});

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not scroll with unusable width %s', (width) => {
  expect(tabsScrollIntoViewX(last, 0, width, 600, 'ltr')).toBeUndefined();
  expect(tabsScrollIntoViewX({ ...last, width }, 0, 390, 600, 'ltr')).toBeUndefined();
});
