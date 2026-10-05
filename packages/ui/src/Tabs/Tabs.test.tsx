import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Text } from 'tamagui';
import { afterEach, describe, expect, it, vitest } from 'vitest';

import { Tabs, tabsOverflowFades, tabsScrollIntoViewX, type TabsItem } from './index';

const items: TabsItem[] = [
  { value: 'one', label: 'One', content: <Text>Panel one</Text> },
  { value: 'two', label: 'Two', content: <Text>Panel two</Text> },
  { value: 'three', label: 'Three', disabled: true, content: <Text>Panel three</Text> },
];

const clearDirs = () => {
  document.documentElement.removeAttribute('dir');
  document.body.removeAttribute('dir');
};

afterEach(clearDirs);

describe('Tabs', () => {
  it('renders a tablist with aria-selected on the active tab', () => {
    renderWithProviders(<Tabs items={items} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Panel one')).toBeInTheDocument();
    expect(screen.queryByText('Panel two')).not.toBeInTheDocument();
  });

  it('switches panels on click and calls onChange (uncontrolled)', () => {
    const onChange = vitest.fn();
    renderWithProviders(<Tabs items={items} onChange={onChange} />);
    fireEvent.click(screen.getByText('Two'));
    expect(onChange).toHaveBeenCalledWith('two');
    expect(screen.getByText('Panel two')).toBeInTheDocument();
    expect(screen.queryByText('Panel one')).not.toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('respects defaultValue', () => {
    renderWithProviders(<Tabs items={items} defaultValue="two" />);
    expect(screen.getByText('Panel two')).toBeInTheDocument();
  });

  it('stays controlled: value wins and does not change on its own', () => {
    const onChange = vitest.fn();
    renderWithProviders(<Tabs items={items} value="one" onChange={onChange} />);
    fireEvent.click(screen.getByText('Two'));
    expect(onChange).toHaveBeenCalledWith('two');
    // still on panel one because the parent did not update `value`
    expect(screen.getByText('Panel one')).toBeInTheDocument();
    expect(screen.queryByText('Panel two')).not.toBeInTheDocument();
  });

  it('does not activate a disabled tab', () => {
    const onChange = vitest.fn();
    renderWithProviders(<Tabs items={items} onChange={onChange} />);
    fireEvent.click(screen.getByText('Three'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Panel one')).toBeInTheDocument();
  });

  it('lazyMount keeps a visited panel mounted after switching away', () => {
    renderWithProviders(<Tabs items={items} lazyMount />);
    // panel two not mounted yet
    expect(screen.queryByText('Panel two')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Two'));
    expect(screen.getByText('Panel two')).toBeInTheDocument();
    fireEvent.click(screen.getByText('One'));
    // panel two stays in the DOM (hidden) once visited
    expect(screen.getByText('Panel two')).toBeInTheDocument();
    expect(screen.getByText('Panel one')).toBeInTheDocument();
  });

  it('underline tabs expose first/middle/last stack positions', () => {
    renderWithProviders(<Tabs items={items} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('data-tab-position', 'first');
    expect(tabs[1]).toHaveAttribute('data-tab-position', 'middle');
    expect(tabs[2]).toHaveAttribute('data-tab-position', 'last');
  });

  it('pointer activation does not paint a keyboard ring', () => {
    renderWithProviders(<Tabs items={items} />);
    const two = screen.getByRole('tab', { name: 'Two' });
    fireEvent.pointerDown(two);
    fireEvent.click(two);
    expect(two).not.toHaveAttribute('data-kb-ring');
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).not.toHaveAttribute('data-kb-ring');
    }
  });

  it('size recipes and density are independent axes', () => {
    const { rerender } = renderWithProviders(<Tabs items={items} size="$5" />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('data-size-token', '$5');
    const comfortableDensity = list.getAttribute('data-density');
    rerender(<Tabs items={items} size="$5" compact />);
    const compactList = screen.getByRole('tablist');
    expect(compactList).toHaveAttribute('data-size-token', '$5');
    expect(compactList).toHaveAttribute('data-density', 'compact');
    expect(comfortableDensity).not.toBe('compact');
  });

  it('compact density keeps the default size token (space only)', () => {
    renderWithProviders(<Tabs items={items} compact />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('data-density', 'compact');
    expect(list).toHaveAttribute('data-size-token', '$4');
  });

  it('recipe horizontal padding paints once per tab (no double pad)', () => {
    // jsdom cannot cascade Tamagui's class CSS, so measure via atomic
    // classes (tags-trigger.spec idiom): exactly ONE node in each tab's
    // subtree may carry the recipe's horizontal padding.
    renderWithProviders(<Tabs items={items} />);
    for (const tab of screen.getAllByRole('tab')) {
      const padded = [tab, ...Array.from(tab.querySelectorAll('*'))].filter((el) =>
        String((el as HTMLElement).className || '')
          .split(' ')
          .some((c) => c.startsWith('_pl-')),
      );
      expect(padded).toHaveLength(1);
    }
  });

  it('contained list clips to the track (CONTAINER-CLIP)', () => {
    renderWithProviders(<Tabs items={items.slice(0, 3)} variant="contained" />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('data-tabs-list', 'contained');
  });

  // ── fill ──────────────────────────────────────────────────
  //
  // Tabs contract: the
  // component sizes to content by default and MUST be able to fill a bounded
  // parent on request. The chain is three boxes deep — tamagui root, panel
  // host, active panel — and every one needs BOTH `flex: 1` and
  // `minHeight: 0`, so the assertions measure all three. jsdom cannot cascade
  // Tamagui's class CSS, so geometry is read off the atomic classes
  // (the idiom above): `_fg-1` grow, `_fb-0px` basis, `_mih-0px` floor.

  const growClasses = ['_fg-1', '_fb-0px', '_mih-0px'];
  const classesOf = (el: Element | null | undefined) => String(el?.getAttribute('class') ?? '').split(' ');
  const grows = (el: Element | null | undefined) => growClasses.every((c) => classesOf(el).includes(c));

  const fillChain = (container: HTMLElement) => ({
    root: container.querySelector('[data-tabs-variant]'),
    host: container.querySelector('[data-tabs-panels]'),
    panel: screen.getByText('Panel one').closest('[role="tabpanel"]'),
  });

  it('fill opens the whole flex chain: root, panel host, and active panel', () => {
    const { container } = renderWithProviders(<Tabs items={items} fill />);
    const { root, host, panel } = fillChain(container);
    expect(root).toHaveAttribute('data-tabs-fill', 'true');
    expect(grows(root)).toBe(true);
    expect(grows(host)).toBe(true);
    expect(grows(panel)).toBe(true);
  });

  it('without fill nothing grows — the default stays content-sized', () => {
    const { container } = renderWithProviders(<Tabs items={items} />);
    const { root, host, panel } = fillChain(container);
    expect(root).not.toHaveAttribute('data-tabs-fill');
    for (const el of [root, host, panel]) {
      expect(classesOf(el)).not.toContain('_fg-1');
      expect(classesOf(el)).not.toContain('_mih-0px');
    }
  });

  it('fill leaves the tab strip at its intrinsic height', () => {
    // The strip must not compete with the panel for the leftover room, or the
    // tabs stretch and the panel loses the height it was given fill to take.
    const { container } = renderWithProviders(<Tabs items={items} fill />);
    const strip = container.querySelector('[data-tabs-panels]')?.previousElementSibling;
    expect(strip).toContainElement(screen.getByRole('tablist'));
    expect(classesOf(strip)).not.toContain('_fg-1');
  });

  it('fill + lazyMount: the visited panel hides, the active one still fills', () => {
    // This is the pair a bounded surface needs together — a Shell PTY or a log
    // follow stream must survive a tab press, and the panel it lives in must
    // still be sizable. Consumers that hand-roll a panel host to get one lose
    // the other, plus tamagui's tabpanel aria.
    const { container } = renderWithProviders(<Tabs items={items} fill lazyMount />);
    fireEvent.click(screen.getByText('Two'));
    fireEvent.click(screen.getByText('One'));
    const panelTwo = screen.getByText('Panel two').closest('[role="tabpanel"]');
    expect(panelTwo).toBeInTheDocument();
    expect(classesOf(panelTwo)).toContain('_dsp-none');
    const { panel } = fillChain(container);
    expect(grows(panel)).toBe(true);
  });

  it('renders nothing when items is empty', () => {
    const { container } = renderWithProviders(<Tabs items={[]} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(container.querySelector('[data-tabs-variant]')).toBeNull();
  });

  it('is a named compound export (List / Tab / Content)', () => {
    expect(Tabs.List).toBeDefined();
    expect(Tabs.Tab).toBeDefined();
    expect(Tabs.Content).toBeDefined();
  });

  it('exactly one tab is in the page tab order', () => {
    renderWithProviders(<Tabs items={items} />);
    const tabs = screen.getAllByRole('tab');
    const stops = tabs.filter((el) => el.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Three' }).tabIndex).toBe(-1);
  });

  it('navigates the band by keyboard while skipping disabled tabs', async () => {
    renderWithProviders(<Tabs items={[...items, { value: 'four', label: 'Four' }]} variant="band" />);
    const one = screen.getByRole('tab', { name: 'One' });
    one.focus();
    fireEvent.keyDown(one, { key: 'End' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Four' })).toHaveFocus();
    });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
    });
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    await waitFor(() => {
      expect(one).toHaveFocus();
    });
  });

  it('keeps manual activation distinct from keyboard focus in a band', async () => {
    renderWithProviders(<Tabs items={items} variant="band" activationMode="manual" />);
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    one.focus();
    fireEvent.keyDown(one, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(two).toHaveFocus();
    });
    expect(two).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(two, { key: 'Enter' });
    expect(two).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the focused tab automatically when navigating with arrows', async () => {
    renderWithProviders(<Tabs items={items} variant="band" />);
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    one.focus();
    fireEvent.keyDown(one, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(two).toHaveFocus();
    });
    expect(two).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Panel two')).toBeVisible();
  });

  it('reverses horizontal arrow navigation in RTL', async () => {
    document.documentElement.dir = 'rtl';
    renderWithProviders(<Tabs items={items} defaultValue="two" />);
    const two = screen.getByRole('tab', { name: 'Two' });
    const one = screen.getByRole('tab', { name: 'One' });
    two.focus();
    fireEvent.keyDown(two, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(one).toHaveFocus();
    });
    expect(one).toHaveAttribute('aria-selected', 'true');
  });

  it('stops at the last enabled tab when looping is disabled', async () => {
    renderWithProviders(<Tabs items={items} loop={false} />);
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    one.focus();
    fireEvent.keyDown(one, { key: 'End' });
    await waitFor(() => {
      expect(two).toHaveFocus();
    });
    fireEvent.keyDown(two, { key: 'ArrowRight' });
    expect(two).toHaveFocus();
    expect(two).toHaveAttribute('aria-selected', 'true');
  });

  it('removes every tab from the page tab order when the strip is disabled', () => {
    renderWithProviders(<Tabs items={items} disabled />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.tabIndex).toBe(-1);
      expect(tab).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('keeps an enabled entry point when the selected tab is disabled', () => {
    renderWithProviders(<Tabs items={items} value="three" />);
    const stops = screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName('One');
  });

  it('renders a flat equal band with named tabs and no scrolling viewport', () => {
    const { container } = renderWithProviders(<Tabs items={items} variant="band" />);
    expect(container.querySelector('[data-tabs-distribution="equal"]')).not.toBeNull();
    expect(container.querySelector('[data-tabs-scroll="true"]')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(container.querySelector('[data-tabs-indicator]')).toBeNull();
  });

  it('lets equal-band chrome shrink inside each allocated tab', () => {
    renderWithProviders(<Tabs items={items} variant="band" />);
    const chrome = screen.getByRole('tab', { name: 'One' }).firstElementChild!;
    expect(chrome.className).toContain('_fs-1');
    expect(chrome.className).toContain('_fb-0px');
  });

  it('ariaLabel overrides the default tablist name', () => {
    renderWithProviders(<Tabs items={items} ariaLabel="Document sections" />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Document sections');
  });

  it('underline strip uses the G10 hairline (not a knob-driven border)', () => {
    const { container } = renderWithProviders(<Tabs items={items} />);
    expect(container.querySelector('.mp-hairline-b')).not.toBeNull();
  });

  it('contained variant does not paint the underline hairline', () => {
    const { container } = renderWithProviders(<Tabs items={items.slice(0, 3)} variant="contained" />);
    expect(container.querySelector('.mp-hairline-b')).toBeNull();
  });

  it('declares writing direction on the root (useDirection)', () => {
    document.documentElement.dir = 'rtl';
    const { container } = renderWithProviders(<Tabs items={items} />);
    expect(container.querySelector('[data-tabs-dir]')?.getAttribute('data-tabs-dir')).toBe('rtl');
  });
});

describe('tabsOverflowFades (rtl-audit U1)', () => {
  it('LTR: rest state fades only the inline-end (right) edge', () => {
    expect(tabsOverflowFades(0, 100, 400, 'ltr')).toEqual({ left: false, right: true });
    expect(tabsOverflowFades(50, 100, 400, 'ltr')).toEqual({ left: true, right: true });
    expect(tabsOverflowFades(300, 100, 400, 'ltr')).toEqual({ left: true, right: false });
  });

  it('RTL: CSSOM scrollLeft is 0 → −range; rest (0) fades the physical left', () => {
    expect(tabsOverflowFades(0, 100, 400, 'rtl')).toEqual({ left: true, right: false });
    expect(tabsOverflowFades(-150, 100, 400, 'rtl')).toEqual({ left: true, right: true });
    expect(tabsOverflowFades(-300, 100, 400, 'rtl')).toEqual({ left: false, right: true });
  });

  it('no overflow → no fades in either direction', () => {
    expect(tabsOverflowFades(0, 400, 400, 'ltr')).toEqual({ left: false, right: false });
    expect(tabsOverflowFades(0, 400, 400, 'rtl')).toEqual({ left: false, right: false });
  });
});

describe('tabsScrollIntoViewX', () => {
  const layout = { x: 250, y: 0, width: 80, height: 32 };

  it('LTR scrolls so a clipped tab lands inside the pad', () => {
    expect(tabsScrollIntoViewX(layout, 0, 100, 400, 'ltr')).toBe(250 + 80 - 100 + 32);
  });

  it('RTL converts the physical window back onto the negative scrollLeft range', () => {
    const x = tabsScrollIntoViewX(layout, 0, 100, 400, 'rtl');
    expect(x).toBeLessThanOrEqual(0);
    expect(x).toBeGreaterThanOrEqual(-300);
  });
});
