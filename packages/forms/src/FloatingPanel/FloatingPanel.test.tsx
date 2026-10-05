import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Text } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';

import { FloatingPanel, panelViewportPadding } from './index';

/**
 * The trigger contract, and why every case fires a REAL press rather than
 * calling `onOpenChange` directly.
 *
 * `trigger` is a slot: the wrapper around it is what opens the panel, so the
 * press has to travel from whatever the consumer put in the slot out to that
 * wrapper. Tamagui's press wrapper calls `e.stopPropagation()` on any
 * component carrying its own `onPress`/`onClick` (`@tamagui/web`
 * `createComponent`, the `onPress` branch — and ONLY that branch), so a
 * pressable trigger swallowed the click:
 *
 *   - SHEET mode, whose only opener was the wrapper's bubble-phase `onPress`,
 *     was dead by pointer AND by keyboard.
 *   - FLOAT mode survived the pointer, because floating-ui listens on
 *     mousedown, which Tamagui does not stop — but keyboard activation
 *     arrives as the click the Button synthesizes, so it was dead.
 *
 * A test that pressed the WRAPPER instead of the Button would have passed
 * against both, which is why every case here presses the pressable.
 */

/** A real pointer press: `detail >= 1` is what a browser sends for a click. */
const pointerPress = (el: Element) => {
  fireEvent.mouseDown(el, { detail: 1 });
  fireEvent.mouseUp(el, { detail: 1 });
  fireEvent.click(el, { detail: 1 });
};

function Harness({
  trigger,
  disabled,
  sheet,
  onOpenChange,
  extra,
  openOn,
  sizing,
}: {
  trigger: ReactNode;
  disabled?: boolean;
  sheet?: boolean;
  onOpenChange?: (open: boolean) => void;
  extra?: ReactNode;
  openOn?: 'press' | 'contextmenu';
  sizing?: 'grow' | 'fill';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Sheet mode renders through a Tamagui Sheet, which has no stable
          marker attribute; the controlled state IS the component's output
          contract, so the harness paints it. Float mode is asserted on the
          real panel element instead. */}
      <Text>{open ? 'state:open' : 'state:shut'}</Text>
      <FloatingPanel
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        trigger={trigger}
        disabled={disabled}
        sheet={sheet}
        openOn={openOn}
        sizing={sizing}>
        <Text>panel body</Text>
        {extra}
      </FloatingPanel>
    </>
  );
}

const isOpen = (result: { container: HTMLElement }) =>
  !!Array.from(result.container.querySelectorAll('*')).some(
    (el) => el.children.length === 0 && el.textContent === 'state:open',
  );

const floatingViewport = () => document.querySelector('[data-testid="floating-panel-viewport"]');

describe('FloatingPanel nested actions', () => {
  it('does not require a marked DOM button to stop propagation', () => {
    const action = vi.fn();
    const onOpenChange = vi.fn();
    const result = renderWithProviders(
      <Harness
        onOpenChange={onOpenChange}
        trigger={
          <button type="button" data-floating-panel-action="true" onClick={action}>
            Clear selection
          </button>
        }
      />,
    );
    fireEvent.click(result.getByRole('button', { name: 'Clear selection' }), { detail: 0 });
    expect(action).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  for (const sheet of [true, false]) {
    for (const activation of ['pointer', 'keyboard'] as const) {
      it(`lets a marked ${activation} action run without opening ${sheet ? 'sheet' : 'float'}`, () => {
        const action = vi.fn();
        const onOpenChange = vi.fn();
        const result = renderWithProviders(
          <Harness
            sheet={sheet}
            onOpenChange={onOpenChange}
            trigger={
              <Button
                data-floating-panel-action="true"
                onPress={(event) => {
                  event.stopPropagation();
                  action();
                }}>
                Clear selection
              </Button>
            }
          />,
        );
        const button = result.getByRole('button', { name: 'Clear selection' });
        if (activation === 'pointer') {
          pointerPress(button);
        } else {
          fireEvent.keyDown(button, { key: 'Enter' });
          fireEvent.keyUp(button, { key: 'Enter' });
        }
        expect(action).toHaveBeenCalledOnce();
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(isOpen(result)).toBe(false);
      });
    }

    it(`preserves context-menu opening from a marked action in ${sheet ? 'sheet' : 'float'}`, () => {
      const onOpenChange = vi.fn();
      const result = renderWithProviders(
        <Harness
          sheet={sheet}
          openOn="contextmenu"
          onOpenChange={onOpenChange}
          trigger={<Button data-floating-panel-action="true">Context action</Button>}
        />,
      );
      fireEvent.contextMenu(result.getByRole('button', { name: 'Context action' }));
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  }
});

/** The DEEPEST node carrying the whole label — several ancestors report the
 *  same `textContent`, and pressing one of those would sidestep the very
 *  swallow these cases exist to catch. */
const labelInside = (result: { container: HTMLElement }, text: string) =>
  Array.from(result.container.querySelectorAll('span')).findLast((el) => el.textContent === text);

describe('FloatingPanel trigger — sheet mode', () => {
  it('a pressable trigger (Button) opens the panel', async () => {
    const result = renderWithProviders(<Harness sheet trigger={<Button>Open Panel</Button>} />);
    const button = result.container.querySelector("[role='button']");
    expect(button).not.toBeNull();
    pointerPress(button as Element);
    await waitFor(() => {
      expect(isOpen(result)).toBe(true);
    });
  });

  it('pressing the label inside a Button trigger opens the panel', async () => {
    const result = renderWithProviders(<Harness sheet trigger={<Button>Open Panel</Button>} />);
    const label = labelInside(result, 'Open Panel');
    expect(label).toBeDefined();
    expect(label?.closest("[role='button']")).not.toBeNull();
    pointerPress(label as Element);
    await waitFor(() => {
      expect(isOpen(result)).toBe(true);
    });
  });

  // Axiom 12 LEGIBLE FLOOR: Button synthesizes a click on Enter/Space so
  // keyboard activation rides the same path as a pointer press.
  it.each(['Enter', ' '])('keyboard %s on a Button trigger opens the panel', async (key) => {
    const result = renderWithProviders(<Harness sheet trigger={<Button>Open Panel</Button>} />);
    fireEvent.keyDown(result.container.querySelector("[role='button']") as Element, { key });
    await waitFor(() => {
      expect(isOpen(result)).toBe(true);
    });
  });

  // The path that already worked, and the one the capture-phase opener could
  // break: both openers see this press, so a toggle-shaped second call would
  // shut the sheet again.
  it('a non-pressable trigger opens the panel and stays open', async () => {
    const result = renderWithProviders(<Harness sheet trigger={<Text>Open Panel</Text>} />);
    const label = Array.from(result.container.querySelectorAll('*')).find(
      (el) => el.textContent === 'Open Panel' && el.children.length === 0,
    );
    pointerPress(label as Element);
    await waitFor(() => {
      expect(isOpen(result)).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isOpen(result)).toBe(true);
  });

  it('disabled: a pressable trigger opens nothing', async () => {
    const result = renderWithProviders(<Harness sheet disabled trigger={<Button>Open Panel</Button>} />);
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isOpen(result)).toBe(false);
  });

  it('disabled: keyboard activation opens nothing', async () => {
    const result = renderWithProviders(<Harness sheet disabled trigger={<Button>Open Panel</Button>} />);
    fireEvent.keyDown(result.container.querySelector("[role='button']") as Element, {
      key: 'Enter',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isOpen(result)).toBe(false);
  });
});

describe('FloatingPanel trigger — floating mode', () => {
  it.each(['Enter', ' '])('keyboard %s on a Button trigger opens the panel', async (key) => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} />);
    fireEvent.keyDown(result.container.querySelector("[role='button']") as Element, { key });
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
  });

  it("a pressable trigger still opens on pointer (floating-ui's mousedown path)", async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} />);
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
  });

  it('a non-pressable trigger opens the panel', async () => {
    const result = renderWithProviders(<Harness trigger={<Text>Open Panel</Text>} />);
    const label = Array.from(result.container.querySelectorAll('*')).find(
      (el) => el.textContent === 'Open Panel' && el.children.length === 0,
    );
    pointerPress(label as Element);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
  });

  // The gate that keeps the capture opener out of the pointer path. Floating
  // mode toggles closed on mousedown when the panel is already open; if the
  // capture handler ran for that click too it would immediately re-open what
  // the mousedown just closed. `detail` is what separates them — measured on
  // a real specimen: a pointer click
  // carries the click count, `element.click()` and native keyboard activation
  // carry 0.
  it('a pointer-shaped click (detail >= 1) does not drive the capture opener', async () => {
    const onOpenChange = vi.fn();
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} onOpenChange={onOpenChange} />);
    fireEvent.click(result.container.querySelector("[role='button']") as Element, { detail: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('a synthesized click (detail 0) does drive the capture opener', async () => {
    const onOpenChange = vi.fn();
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} onOpenChange={onOpenChange} />);
    fireEvent.click(result.container.querySelector("[role='button']") as Element, { detail: 0 });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  it('disabled: keyboard activation opens nothing', async () => {
    const result = renderWithProviders(<Harness disabled trigger={<Button>Open Panel</Button>} />);
    fireEvent.keyDown(result.container.querySelector("[role='button']") as Element, {
      key: 'Enter',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(floatingViewport()).toBeNull();
  });

  it('keyboard open moves focus to the first inner control, not the chrome', async () => {
    const result = renderWithProviders(
      <Harness
        trigger={<Button>Open Panel</Button>}
        extra={
          <Button data-testid="panel-close" onPress={() => undefined}>
            Close
          </Button>
        }
      />,
    );
    const trigger = result.container.querySelector("[role='button']") as HTMLElement;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector("[data-testid='panel-close']"));
    });
    const chrome = floatingViewport() as HTMLElement;
    const outline = getComputedStyle(chrome).outlineWidth;
    expect(outline === '0px' || outline === '' || outline === '0').toBe(true);
  });

  it('Escape returns focus to the trigger', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} />);
    const trigger = result.container.querySelector("[role='button']") as HTMLElement;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(floatingViewport()).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('a pointer open focuses the pressed trigger, so Escape leaves focus there', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} />);
    const trigger = result.container.querySelector("[role='button']") as HTMLElement;
    pointerPress(trigger);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(floatingViewport()).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape after a pointer open returns to that trigger, not the one focused before', async () => {
    const result = renderWithProviders(
      <>
        <Harness trigger={<Button>First</Button>} />
        <Harness trigger={<Button>Second</Button>} />
      </>,
    );
    const [first, second] = Array.from(result.container.querySelectorAll<HTMLElement>("[role='button']"));
    first.focus();
    pointerPress(second);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(floatingViewport()).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(document.activeElement).toBe(second);
  });

  it('disconnects fill content observation on close and unmount', async () => {
    const observers: { target: Element; disconnected: boolean }[] = [];
    class TrackingResizeObserver {
      private tracked?: { target: Element; disconnected: boolean };
      observe(target: Element) {
        if (target.parentElement?.getAttribute('data-testid') !== 'floating-panel-viewport') {
          return;
        }
        this.tracked = { target, disconnected: false };
        observers.push(this.tracked);
      }
      unobserve() {}
      disconnect() {
        if (this.tracked) {
          this.tracked.disconnected = true;
        }
      }
    }
    vi.stubGlobal('ResizeObserver', TrackingResizeObserver);
    const result = renderWithProviders(<Harness sizing="fill" trigger={<Button>Open Panel</Button>} />);
    try {
      const trigger = result.container.querySelector("[role='button']") as HTMLElement;
      pointerPress(trigger);
      await waitFor(() => {
        expect(observers.some((observer) => !observer.disconnected)).toBe(true);
      });
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(observers.every((observer) => observer.disconnected)).toBe(true);
      });
      pointerPress(trigger);
      await waitFor(() => {
        expect(observers.some((observer) => !observer.disconnected)).toBe(true);
      });
      result.unmount();
      expect(observers.every((observer) => observer.disconnected)).toBe(true);
    } finally {
      result.unmount();
      vi.unstubAllGlobals();
    }
  });
});

describe('FloatingPanel nesting', () => {
  it("a visible panel carries no transform, so a nested panel's position: fixed stays on the viewport", async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Panel</Button>} />);
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    const viewport = floatingViewport() as HTMLElement;
    await waitFor(() => {
      expect(viewport.style.opacity).toBe('1');
    });
    expect(viewport.style.transform).toBe('none');
    expect(viewport.style.position).toBe('fixed');
  });

  it('escapes a transformed, scrolled ancestor instead of positioning against it', async () => {
    const result = renderWithProviders(
      <div data-testid="scroller" style={{ transform: 'translateZ(0)', overflowY: 'auto', height: 100 }}>
        <Harness trigger={<Button>Open Panel</Button>} />
      </div>,
    );
    const scroller = result.getByTestId('scroller');
    scroller.scrollTop = 40;
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    const viewport = floatingViewport() as HTMLElement;
    expect(scroller.contains(viewport)).toBe(false);
    // jsdom puts everything at viewport y 0, so the panel pins to the
    // viewport padding, now in viewport coordinates with no scroller offset.
    await waitFor(() => {
      expect(viewport.style.top).toBe(`${panelViewportPadding}px`);
    });
  });

  it('offsets its top by a transformed dialog it stays inside', async () => {
    const result = renderWithProviders(
      <div role="dialog" data-testid="dialog" style={{ transform: 'translateZ(0)', overflowY: 'auto', height: 100 }}>
        <Harness trigger={<Button>Open Panel</Button>} />
      </div>,
    );
    const dialog = result.getByTestId('dialog');
    dialog.scrollTop = 40;
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(floatingViewport()).not.toBeNull();
    });
    const viewport = floatingViewport() as HTMLElement;
    expect(dialog.contains(viewport)).toBe(true);
    // Laid out against the dialog, whose content is scrolled 40px, its css
    // top must be 40px lower to land at the same viewport y.
    await waitFor(() => {
      expect(viewport.style.top).toBe(`${panelViewportPadding + 40}px`);
    });
  });
});

describe('FloatingPanel sheet — closed frame leaves the accessibility tree', () => {
  function SheetWithOutsideClose() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}>
          Open sheet
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}>
          Shut sheet
        </button>
        <FloatingPanel open={open} onOpenChange={setOpen} sheet trigger={<Text>anchor</Text>}>
          <Button>Apply</Button>
          <input aria-label="Draft" defaultValue="" />
        </FloatingPanel>
      </>
    );
  }

  const frameOf = (el: Element) => el.closest("[tabindex='-1']") as HTMLElement;

  it('marks a parked frame inert and aria-hidden, and lifts both when it reopens', async () => {
    const result = renderWithProviders(<SheetWithOutsideClose />);
    fireEvent.click(result.getByRole('button', { name: 'Open sheet' }));
    const apply = await result.findByRole('button', { name: 'Apply' });
    const frame = frameOf(apply);
    expect(frame).not.toBeNull();
    fireEvent.change(result.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'acme' },
    });

    fireEvent.click(result.getByRole('button', { name: 'Shut sheet' }));
    await waitFor(() => {
      expect(result.queryByRole('button', { name: 'Apply' })).toBeNull();
    });
    expect(frame.isConnected).toBe(true);
    expect(frame.hasAttribute('inert')).toBe(true);
    expect(frame.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(result.getByRole('button', { name: 'Open sheet' }));
    await result.findByRole('button', { name: 'Apply' });
    expect(frame.hasAttribute('inert')).toBe(false);
    expect(frame.hasAttribute('aria-hidden')).toBe(false);
    expect((result.getByRole('textbox', { name: 'Draft' }) as HTMLInputElement).value).toBe('acme');
  });
});
