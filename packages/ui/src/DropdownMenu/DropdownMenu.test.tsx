import { renderWithProviders } from '@repo/test-utils';
import { __resetDevWarnSeen } from '@repo/theme';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Button } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DropdownMenu } from './index';

function renderMenu(onSelect = vi.fn(), onDelete = vi.fn()) {
  const result = renderWithProviders(
    <DropdownMenu defaultOpen>
      <DropdownMenu.Trigger asChild>
        <Button>Actions</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={onSelect}>Edit</DropdownMenu.Item>
        <DropdownMenu.Item disabled disabledReason="Nothing to duplicate yet">
          Duplicate
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item destructive onSelect={onDelete}>
          Delete
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>,
  );
  return result;
}

describe('DropdownMenu', () => {
  it('renders menu items when open', async () => {
    renderMenu();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const items = document.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Edit');
    expect(items[2].textContent).toContain('Delete');
  });

  it('marks disabled items with aria-disabled and skips them in nav', async () => {
    renderMenu();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const disabled = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Duplicate'),
    );
    expect(disabled?.getAttribute('aria-disabled')).toBe('true');
  });

  it('selects an item on click and closes the menu', async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const edit = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Edit'),
    ) as HTMLElement;
    fireEvent.click(edit);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeFalsy();
    });
  });

  it('navigates with ArrowDown and selects with Enter', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    renderMenu(onSelect, onDelete);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    items[0].focus();
    // ArrowDown skips the disabled item (not in the enabled query) to Delete
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'Enter' });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('wraps ArrowUp from the first item to the last', async () => {
    renderMenu();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    items[0].focus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('toggles checkbox items without closing the menu', async () => {
    const onCheckedChange = vi.fn();
    renderWithProviders(
      <DropdownMenu defaultOpen>
        <DropdownMenu.Trigger asChild>
          <Button>View</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.CheckboxItem checked={false} onCheckedChange={onCheckedChange}>
            Show grid
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menuitemcheckbox"]')).toBeTruthy();
    });
    const item = document.querySelector('[role="menuitemcheckbox"]') as HTMLElement;
    expect(item.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(item);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    // menu stays open (closeOnSelect defaults to false for checkbox items)
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
  });

  it('renders the convenience items=[] API with separators', async () => {
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ label: 'One' }, { separator: true }, { label: 'Two', destructive: true }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelectorAll('[role="menuitem"]').length).toBe(2);
    expect(document.querySelectorAll('[role="separator"]').length).toBe(1);
  });

  it('exposes aria-haspopup and aria-expanded on the trigger', async () => {
    renderWithProviders(
      <DropdownMenu items={[{ label: 'One' }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    const trigger = document.querySelector('[aria-haspopup="menu"]');
    expect(trigger).toBeTruthy();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('DropdownMenu items path — checked entries', () => {
  // Would have caught the original defect: the convenience items=[] path
  // routed entries carrying `checked` to CheckboxItem and silently dropped
  // their `onSelect` (only `onCheckedChange` was wired), and forwarded no
  // `closeOnSelect` — checked navigation menus stayed open and dead.
  it('fires BOTH onSelect and onCheckedChange for a checked entry', async () => {
    const onSelect = vi.fn();
    const onCheckedChange = vi.fn();
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ key: 'list', label: 'List', checked: false, onSelect, onCheckedChange }]}>
        <Button>Views</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menuitemcheckbox"]')).toBeTruthy();
    });
    const item = document.querySelector('[role="menuitemcheckbox"]') as HTMLElement;
    expect(item.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(item);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('closes the menu when a checked entry sets closeOnSelect', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DropdownMenu
        defaultOpen
        items={[{ key: 'kanban', label: 'Kanban', checked: false, closeOnSelect: true, onSelect }]}>
        <Button>Views</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menuitemcheckbox"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[role="menuitemcheckbox"]') as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeFalsy();
    });
  });

  it('menu-level closeOnSelect closes a checked pick (radio-style navigation)', async () => {
    // The exact consumer shape (ViewHeader switcher / KanbanBoardPicker /
    // SortControl): every entry is a checkbox item (single-select radio
    // semantics, shared check gutter), the pick navigates AND closes.
    const navigate = vi.fn();
    renderWithProviders(
      <DropdownMenu
        defaultOpen
        closeOnSelect
        items={['List', 'Kanban'].map((view) => ({
          key: view,
          label: view,
          checked: view === 'List',
          onSelect: () => navigate(view),
        }))}>
        <Button>List</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menuitemcheckbox"]').length).toBe(2);
    });
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'));
    // CheckboxItem semantics stay intact: aria-checked marks the current view.
    expect(rows[0].getAttribute('aria-checked')).toBe('true');
    expect(rows[1].getAttribute('aria-checked')).toBe('false');
    fireEvent.click(rows[1]);
    expect(navigate).toHaveBeenCalledWith('Kanban');
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeFalsy();
    });
  });

  it('keeps the menu open for checked entries by default (COMPOSE)', async () => {
    // Positive control for the close assertions above: without closeOnSelect
    // a checkable toggle composes, so the menu MUST stay open.
    const onCheckedChange = vi.fn();
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ key: 'grid', label: 'Show grid', checked: true, onCheckedChange }]}>
        <Button>View options</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menuitemcheckbox"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[role="menuitemcheckbox"]') as HTMLElement);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    // Unmount-on-close is async — settle past it so "still open" can fail
    // (the closing specs above are the positive control for this detector).
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
  });

  it('forwards entry-level closeOnSelect=false on plain items', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ key: 'apply', label: 'Apply', closeOnSelect: false, onSelect }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menuitem"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[role="menuitem"]') as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
  });
});

describe('DropdownMenu disabledReason', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('explains disabled items inline (no hover) and blocks selection', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DropdownMenu
        defaultOpen
        items={[
          {
            label: 'Archive',
            disabled: true,
            disabledReason: 'Requires the owner role',
            onSelect,
          },
        ]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const item = document.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    const reason = item.querySelector('[data-mp-disabled-reason]');
    expect(reason?.textContent).toBe('Requires the owner role');

    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('DEV-warns bare-disabled for disabled items without a reason', async () => {
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ label: 'Publish', disabled: true }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('does not render a reason node for enabled items', async () => {
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ label: 'Open', disabledReason: 'unused' }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-mp-disabled-reason]')).toBeNull();
  });
});

describe('DropdownMenu keyboard ring', () => {
  it('highlights the focused row and keeps CONTAINER-CLIP square corners', async () => {
    renderMenu();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    fireEvent.focus(items[1]);
    expect(items[1].getAttribute('data-highlighted')).toBe('true');
    // CONTAINER-CLIP: the overlay clips; rows stay square.
    expect(items[1].className).toMatch(/_btlr-0px/);
    expect(items[1].className).toMatch(/_bbrr-0px/);
    // Kb-only: Tamagui focus/focusVisible styles carry no ring; the
    // keyboard ring is painted via keyboardFocusRingProps on kb-origin focus.
    expect(items[1].className).toMatch(/_outlineWidth-0focus-visible-0px/);
  });

  it('keeps destructive rows square and highlighted (no error-intent border)', async () => {
    renderMenu();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const del = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Delete'),
    ) as HTMLElement;
    fireEvent.focus(del);
    expect(del.getAttribute('data-highlighted')).toBe('true');
    expect(del.className).toMatch(/_btlr-0px/);
    expect(del.className).toMatch(/_outlineWidth-0focus-visible-0px/);
  });

  it('ArrowUp on a closed trigger opens onto the last item', async () => {
    renderWithProviders(
      <DropdownMenu items={[{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
    const trigger = document.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    await waitFor(() => {
      const items = document.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBe(3);
      expect(document.activeElement).toBe(items[2]);
    });
  });
});

describe('DropdownMenu FloatingPanel cover contract', () => {
  function renderOpen() {
    return renderWithProviders(
      <DropdownMenu
        defaultOpen
        items={[
          { label: 'Edit' },
          { label: 'List', checked: true },
          { separator: true },
          { label: 'Delete', destructive: true },
        ]}>
        <Button>Actions</Button>
      </DropdownMenu>,
    );
  }

  it('uses FloatingPanel, not a second overlay stack', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="floating-panel-viewport"]')).toBeTruthy();
    expect(document.querySelector('[data-mp-tint]')).toBeNull();
  });

  it('declares the cover contract and COMMIT host', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.getAttribute('data-mp-width-mode')).toBe('at-least-trigger');
    expect(menu.getAttribute('data-dismiss-class')).toBe('commit');
  });

  it('renders the design-law row grammar (44 / padX 13 / weight 400 / $color3 hover)', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const edit = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Edit'),
    ) as HTMLElement;
    expect(edit.className).toMatch(/_pl-t-space-3/);
    expect(edit.className).toMatch(/_pr-t-space-3/);
    expect(edit.getAttribute('data-mp-pad-x')).toBe('13');
    expect(edit.getAttribute('data-mp-row-height')).toBe('44');
    expect(edit.getAttribute('data-mp-font-weight')).toBe('400');
    expect(edit.getAttribute('data-mp-hover-fill')).toBe('$color3');
    expect(edit.className).toMatch(/_btlr-0px/);
  });

  it('trails the check on the selected row at $color2', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menuitemcheckbox"]')).toBeTruthy();
    });
    const selected = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    expect(selected?.getAttribute('aria-checked')).toBe('true');
    expect(selected?.getAttribute('data-mp-selected-fill')).toBe('$color2');
    const check = selected?.querySelector('[data-mp-check]');
    expect(check?.getAttribute('data-mp-check')).toBe('trailing');
    expect(selected?.lastElementChild).toBe(check);
  });

  it('opens as a sheet at the overlay breakpoint (≤640)', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 });
    renderWithProviders(
      <DropdownMenu defaultOpen items={[{ label: 'Edit' }]}>
        <Button>Actions</Button>
      </DropdownMenu>,
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

  it('accepts Content maxHeight and maxWidth from table callers', async () => {
    renderWithProviders(
      <DropdownMenu defaultOpen>
        <DropdownMenu.Trigger asChild>
          <Button>View</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={240} maxWidth={320}>
          <DropdownMenu.Item>Col</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.style.maxHeight || getComputedStyle(menu).maxHeight).toBeTruthy();
  });

  it('paints the keyboard ring at 2px offset 0 on keyboard focus', async () => {
    renderOpen();
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    const edit = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Edit'),
    ) as HTMLElement;
    fireEvent.focus(edit);
    expect(edit.getAttribute('data-highlighted')).toBe('true');
    expect(edit.getAttribute('data-mp-ring-offset')).toBe('0');
  });
});

describe('DropdownMenu.Content onCloseAutoFocus', () => {
  for (const preventRestore of [false, true]) {
    it(`${preventRestore ? 'suppresses' : 'performs'} actual delayed trigger restoration on Escape`, async () => {
      const onCloseAutoFocus = vi.fn((event) => {
        if (preventRestore) {
          event.preventDefault();
        }
      });
      const result = renderWithProviders(
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button>Heading</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content onCloseAutoFocus={onCloseAutoFocus}>
            <DropdownMenu.Item>H1</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>,
      );
      const trigger = result.getByText('Heading').closest('button')!;
      trigger.focus();
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(document.querySelector('[role="menuitem"]')).toBeTruthy();
      });
      const item = document.querySelector('[role="menuitem"]') as HTMLElement;
      item.focus();
      fireEvent.keyDown(item, { key: 'Escape' });
      await waitFor(() => {
        expect(document.querySelector('[role="menu"]')).toBeFalsy();
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
      expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
      if (preventRestore) {
        expect(document.activeElement).not.toBe(trigger);
      } else {
        expect(document.activeElement).toBe(trigger);
      }
    });
  }

  it('fires once when an item select closes the menu', async () => {
    const onCloseAutoFocus = vi.fn();
    renderWithProviders(
      <DropdownMenu defaultOpen>
        <DropdownMenu.Trigger asChild>
          <Button>Actions</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content onCloseAutoFocus={onCloseAutoFocus}>
          <DropdownMenu.Item>Edit</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[role="menuitem"]') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeFalsy();
    });
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
    const event = onCloseAutoFocus.mock.calls[0][0] as {
      preventDefault: () => void;
      defaultPrevented: boolean;
    };
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
  });

  it('fires once when a closeOnSelect=false item closes via the parent open state', async () => {
    // HeadingPicker / ListPicker / MoreDropdown: they keep closeOnSelect
    // false so the item does not ctx.close(), then they setOpen(false)
    // themselves after executeCommand. That is a controlled close, not
    // ctx.close() and not FloatingPanel dismissing on its own.
    const onCloseAutoFocus = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenu.Trigger asChild>
            <Button>Heading</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content onCloseAutoFocus={onCloseAutoFocus}>
            <DropdownMenu.Item
              closeOnSelect={false}
              onSelect={() => {
                setOpen(false);
              }}>
              H1
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      );
    }
    renderWithProviders(<Harness />);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    fireEvent.click(document.querySelector('[role="menuitem"]') as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeFalsy();
    });
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
  });

  it('puts Content aria-label on the role=menu node', async () => {
    renderWithProviders(
      <DropdownMenu defaultOpen>
        <DropdownMenu.Trigger asChild>
          <Button>Status</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content aria-label="Status">
          <DropdownMenu.Item>Open</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>,
    );
    await waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeTruthy();
    });
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Status');
  });
});
