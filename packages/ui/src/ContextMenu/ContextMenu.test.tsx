import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { OVERLAY_ANCHOR_GAP } from '@repo/theme';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextMenu } from './index';

function renderOpen(onSelect = vi.fn()) {
  return renderWithProviders(
    <ContextMenu
      defaultOpen
      items={[
        { label: 'Copy', onSelect },
        { label: 'Rename', checked: true },
        { separator: true },
        { label: 'Delete', destructive: true },
      ]}>
      <Button>Target</Button>
    </ContextMenu>,
  );
}

describe('ContextMenu', () => {
  it('opens on contextmenu and not on a primary click', async () => {
    const { getByText } = renderWithProviders(
      <ContextMenu items={[{ label: 'Copy' }]}>
        <Button>Target</Button>
      </ContextMenu>,
    );
    const trigger = getByText('Target');
    fireEvent.click(trigger);
    expect(document.querySelector('[role="menu"]')).toBeFalsy();

    fireEvent.contextMenu(trigger);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelector('[role="menuitem"]')?.textContent).toContain('Copy');
  });

  it('renders the same row grammar as DropdownMenu when open', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const copy = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Copy'),
    ) as HTMLElement;
    const selected = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    expect(copy).toBeTruthy();
    expect(selected).toBeTruthy();
    expect(selected?.getAttribute('aria-checked')).toBe('true');

    // 44 tall ($4), padX 13 (`$3` → space-3), weight 400 — menuRowFrame.
    expect(copy.className).toMatch(/_pl-t-space-3/);
    expect(copy.className).toMatch(/_pr-t-space-3/);
    expect(copy.getAttribute('data-mp-pad-x')).toBe('13');
    expect(copy.getAttribute('data-mp-row-height')).toBe('44');
    expect(copy.getAttribute('data-mp-font-weight')).toBe('400');
    expect(copy.className).toMatch(/_btlr-0px/);

    // Selected fill is $color2; hover is $color3; check trails the label.
    expect(selected?.getAttribute('data-mp-selected-fill')).toBe('$color2');
    expect(copy.getAttribute('data-mp-hover-fill')).toBe('$color3');
    const check = selected?.querySelector('[data-mp-check]');
    expect(check?.getAttribute('data-mp-check')).toBe('trailing');
    expect(selected?.lastElementChild).toBe(check);
  });

  it('selects a plain item and closes (COMMIT)', async () => {
    const onSelect = vi.fn();
    renderOpen(onSelect);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const copy = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Copy'),
    ) as HTMLElement;
    fireEvent.click(copy);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeFalsy();
    });
  });

  it('keeps a checkable item open (COMPOSE)', async () => {
    const onCheckedChange = vi.fn();
    renderWithProviders(
      <ContextMenu defaultOpen items={[{ label: 'Pinned', checked: false, onCheckedChange }]}>
        <Button>Target</Button>
      </ContextMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menuitemcheckbox"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[role="menuitemcheckbox"]') as HTMLElement);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
  });

  it('uses FloatingPanel, not a second overlay stack', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="floating-panel-viewport"]')).toBeTruthy();
    expect(document.querySelector('[data-mp-tint]')).toBeNull();
  });

  it('opens as a sheet at the overlay breakpoint (≤640)', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 });
    renderWithProviders(
      <ContextMenu defaultOpen items={[{ label: 'Copy' }]}>
        <Button>Target</Button>
      </ContextMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="floating-panel-viewport"]')).toBeFalsy();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    });
  });

  it('paints the keyboard ring at 2px offset 0 on keyboard focus', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const copy = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Copy'),
    ) as HTMLElement;
    fireEvent.focus(copy);
    expect(copy.getAttribute('data-highlighted')).toBe('true');
    expect(copy.getAttribute('data-mp-ring-offset')).toBe('0');
  });
});

/**
 * The panel's box, stubbed: happy-dom lays nothing out, so the size the
 * placement math reads is given here. The client rect is the opening frame's,
 * scaled 0.96 as the real one is; only the layout width is the menu's width.
 */
function stubPanelBox(width: number, height: number) {
  const isPanel = (el: Element) => el.hasAttribute('data-fp-panel');
  const rect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return isPanel(this) ? new DOMRect(0, 0, width * 0.96, height * 0.96) : rect.call(this);
  });
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isPanel(this) ? width : (offsetWidth?.get?.call(this) ?? 0);
  });
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return isPanel(this) ? height : (scrollHeight?.get?.call(this) ?? 0);
  });
}

const panelBox = () => document.querySelector<HTMLElement>('[data-fp-panel]');

async function rightClickAt(x: number, y: number) {
  const result = renderWithProviders(
    <ContextMenu items={[{ label: 'Copy' }, { label: 'Rename' }, { label: 'Delete' }]}>
      <Button>Target</Button>
    </ContextMenu>,
  );
  fireEvent.contextMenu(result.getByText('Target'), { clientX: x, clientY: y, button: 2 });
  await waitFor(() => {
    expect(panelBox()?.style.top).toMatch(/px$/);
  });
  return panelBox() as HTMLElement;
}

describe('ContextMenu opens at the pointer (layoutTokens.ts free overlay)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the menu's start edge on the click x, OVERLAY_ANCHOR_GAP below the click y", async () => {
    stubPanelBox(180, 140);
    const panel = await rightClickAt(300, 200);
    expect(panel.style.left).toBe('300px');
    expect(panel.style.top).toBe(`${200 + OVERLAY_ANCHOR_GAP}px`);
  });

  it('flips left and up in the bottom-right corner so it stays inside the viewport', async () => {
    stubPanelBox(180, 140);
    const x = window.innerWidth - 20;
    const y = window.innerHeight - 20;
    const panel = await rightClickAt(x, y);
    expect(parseFloat(panel.style.left) + 180).toBe(x);
    expect(parseFloat(panel.style.top) + parseFloat(panel.style.maxHeight)).toBe(y - OVERLAY_ANCHOR_GAP);
    expect(panel.style.transformOrigin).toBe('bottom right');
  });

  it('keeps clear of a vertical scrollbar at the right edge', async () => {
    stubPanelBox(180, 140);
    const clientWidth = window.innerWidth - 15;
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(clientWidth);
    const x = window.innerWidth - 195;
    const panel = await rightClickAt(x, 200);
    expect(parseFloat(panel.style.left) + 180).toBe(x);
  });

  it('clamps to the viewport padding when neither side fits', async () => {
    stubPanelBox(window.innerWidth, 140);
    const panel = await rightClickAt(400, 200);
    expect(panel.style.left).toBe('10px');
  });

  it('sizes to content: no trigger-width floor', async () => {
    stubPanelBox(180, 140);
    const panel = await rightClickAt(300, 200);
    expect(panel.style.minWidth).toBe('');
  });

  it('moves to a second right-click while it is open', async () => {
    stubPanelBox(180, 140);
    const result = renderWithProviders(
      <ContextMenu items={[{ label: 'Copy' }]}>
        <Button>Target</Button>
      </ContextMenu>,
    );
    const target = result.getByText('Target');
    fireEvent.contextMenu(target, { clientX: 300, clientY: 200, button: 2 });
    await waitFor(() => {
      expect(panelBox()?.style.left).toBe('300px');
    });
    fireEvent.contextMenu(target, { clientX: 120, clientY: 90, button: 2 });
    await waitFor(() => {
      expect(panelBox()?.style.left).toBe('120px');
    });
    expect(panelBox()?.style.top).toBe(`${90 + OVERLAY_ANCHOR_GAP}px`);
    expect(document.querySelectorAll('[data-fp-panel]')).toHaveLength(1);
  });

  it("opens a keyboard contextmenu (no pointer) from the target's bottom start corner", async () => {
    const result = renderWithProviders(
      <ContextMenu items={[{ label: 'Copy' }]}>
        <Button>Target</Button>
      </ContextMenu>,
    );
    const reference = document.querySelector<HTMLElement>('[data-fp-reference]') as HTMLElement;
    const rect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === reference) {
        return new DOMRect(40, 100, 200, 44);
      }
      if (this.hasAttribute('data-fp-panel')) {
        return new DOMRect(0, 0, 180, 140);
      }
      return rect.call(this);
    });
    fireEvent.contextMenu(result.getByText('Target'), { clientX: 0, clientY: 0, button: 0 });
    await waitFor(() => {
      expect(panelBox()?.style.left).toBe('40px');
    });
    expect(panelBox()?.style.top).toBe(`${144 + OVERLAY_ANCHOR_GAP}px`);
  });
});
