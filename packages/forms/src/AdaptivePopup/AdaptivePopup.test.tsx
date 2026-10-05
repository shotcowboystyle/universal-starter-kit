import { modelFirstFocusableShow, renderWithProviders } from '@repo/test-utils';
import { OVERLAY_BREAKPOINT } from '@repo/theme';
import { fireEvent, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { AdaptivePopup, pickAdaptivePopupFace } from './index';

/**
 * The trigger contract, and why every case fires a REAL press rather than
 * calling `onOpenChange` directly.
 *
 * `trigger` is a slot: the wrapper around it is what opens the popup, so the
 * press has to travel from whatever the consumer put in the slot out to that
 * wrapper. Tamagui's press wrapper calls `e.stopPropagation()` on any component
 * carrying its own `onPress`/`onClick` (`@tamagui/web` `createComponent`, the
 * `onPress` branch), so a pressable trigger — a Button, which is what every
 * story and every doc example passes — swallowed the click and the popup never
 * opened. A test that pressed the WRAPPER instead of the Button would have
 * passed against that bug.
 */

function Harness({ trigger, disabled }: { trigger: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <AdaptivePopup
      open={open}
      onOpenChange={setOpen}
      title="Edit Profile"
      description="Make changes to your profile here."
      trigger={trigger}
      disabled={disabled}>
      <Text>popup body</Text>
    </AdaptivePopup>
  );
}

/** A real press: the half that opens a panel is mousedown, so fire all three. */
const press = (el: Element) => {
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
};

const dialog = () => document.querySelector("[role='dialog']");

describe('AdaptivePopup trigger', () => {
  it('a pressable trigger (Button) opens the popup', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    const button = result.container.querySelector("[role='button']");
    expect(button).not.toBeNull();
    press(button as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
  });

  // The press a real user makes lands on the innermost painted node — the
  // label — not on the frame the test happens to query.
  it('pressing the label inside a Button trigger opens the popup', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    // The DEEPEST node carrying the whole string — several ancestors also
    // report `textContent === "Open Popup"`, and pressing one of those would
    // sidestep the very swallow this case exists to catch.
    const label = Array.from(result.container.querySelectorAll('span')).findLast(
      (el) => el.textContent === 'Open Popup',
    );
    expect(label).toBeDefined();
    expect(label?.closest("[role='button']")).not.toBeNull();
    press(label as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
  });

  // Axiom 12 LEGIBLE FLOOR: Button synthesizes a click on Enter/Space so
  // keyboard activation rides the same path as a pointer press.
  it.each(['Enter', ' '])('keyboard %s on a Button trigger opens the popup', async (key) => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    const button = result.container.querySelector("[role='button']") as Element;
    fireEvent.keyDown(button, { key });
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
  });

  // The trigger slot need not be pressable — this is the path that worked
  // before, and it must not start double-firing now that a capture-phase
  // opener runs alongside Dialog.Trigger's own bubble-phase toggle.
  it('a non-pressable trigger opens the popup and stays open', async () => {
    const result = renderWithProviders(<Harness trigger={<Text>Open Popup</Text>} />);
    const label = Array.from(result.container.querySelectorAll('*')).find(
      (el) => el.textContent === 'Open Popup' && el.children.length === 0,
    );
    press(label as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    // Both the capture-phase opener and Dialog.Trigger's own bubble-phase
    // toggle see this press; a toggle-shaped second call would shut it again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dialog()).not.toBeNull();
  });

  it('disabled: a pressable trigger opens nothing', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} disabled />);
    press(result.container.querySelector("[role='button']") as Element);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dialog()).toBeNull();
  });

  it('disabled: keyboard activation opens nothing', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} disabled />);
    fireEvent.keyDown(result.container.querySelector("[role='button']") as Element, {
      key: 'Enter',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dialog()).toBeNull();
  });
});

describe('AdaptivePopup focus ring', () => {
  it('close names itself and dismisses', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    const close = document.querySelector("[data-testid='adaptive-popup-close']");
    expect(close).not.toBeNull();
    expect(close?.getAttribute('aria-label')).toBe('Close');
    press(close as Element);
    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
  });

  it('keyboard Enter on close dismisses', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    const close = document.querySelector("[data-testid='adaptive-popup-close']") as HTMLElement;
    fireEvent.keyDown(close, { key: 'Enter' });
    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
  });

  it('close paints at nested density, not the 44px page well', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    const close = document.querySelector("[data-testid='adaptive-popup-close']");
    const px = Number(close?.getAttribute('data-nested-px'));
    expect(px).toBeGreaterThanOrEqual(24);
    expect(px).toBeLessThan(44);
  });

  it('close sits after the body so fields are the first tab stop', async () => {
    function FieldHarness() {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup open={open} onOpenChange={setOpen} title="Edit Profile" trigger={<Button>Open Popup</Button>}>
          <input aria-label="Name" />
        </AdaptivePopup>
      );
    }
    const result = renderWithProviders(<FieldHarness />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    const input = dialog()?.querySelector('input');
    const close = dialog()?.querySelector("[data-testid='adaptive-popup-close']");
    expect(input).not.toBeNull();
    expect(close).not.toBeNull();
    expect(input!.compareDocumentPosition(close!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the overlay frame suppresses its own ring (panel is not a control)', async () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    const surface = document.querySelector("[data-testid='adaptive-popup-surface']") as HTMLElement;
    expect(surface).not.toBeNull();
    expect(surface.getAttribute('data-adaptive-popup-mode')).toBe('dialog');
    expect(surface.tabIndex).toBe(-1);
  });

  it('the trigger wrapper is not a tab stop — the painted Button is the ring boundary', () => {
    const result = renderWithProviders(<Harness trigger={<Button>Open Popup</Button>} />);
    const wrap = result.container.querySelector("[data-testid='adaptive-popup-trigger']");
    expect(wrap).not.toBeNull();
    expect((wrap as HTMLElement).tabIndex).toBe(-1);
    expect(wrap?.getAttribute('role')).not.toBe('button');
  });

  it('omitted title still exposes a dialog name for assistive tech', async () => {
    function Untitled() {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup open={open} onOpenChange={setOpen} trigger={<Button>Open Popup</Button>}>
          <Text>body</Text>
        </AdaptivePopup>
      );
    }
    const result = renderWithProviders(<Untitled />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    expect(dialog()?.textContent).toMatch(/Dialog/);
  });
});

const originalInnerWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  setViewportWidth(originalInnerWidth);
});

function OpenPopup({
  face,
  size,
  footer,
}: {
  face?: 'dialog' | 'drawer';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <AdaptivePopup
      open={open}
      onOpenChange={setOpen}
      title="Edit Profile"
      description="Make changes to your profile here."
      face={face}
      size={size}
      footer={footer}>
      <input aria-label="Name" />
    </AdaptivePopup>
  );
}

function surface() {
  return document.querySelector("[data-testid='adaptive-popup-surface']");
}

function shadowClasses(el: Element): string[] {
  return String(el.className || '')
    .split(/\s+/)
    .filter((c) => c.startsWith('_bxsh-'))
    .sort();
}

describe('pickAdaptivePopupFace (C22 / OVERLAY_BREAKPOINT)', () => {
  it('at the overlay breakpoint and below, any face is sheet', () => {
    expect(pickAdaptivePopupFace({ viewportWidth: OVERLAY_BREAKPOINT, face: 'drawer' })).toBe('sheet');
    expect(pickAdaptivePopupFace({ viewportWidth: OVERLAY_BREAKPOINT - 1, face: 'drawer' })).toBe('sheet');
    expect(pickAdaptivePopupFace({ viewportWidth: 390 })).toBe('sheet');
  });

  it('above the overlay breakpoint, face=drawer is drawer', () => {
    expect(pickAdaptivePopupFace({ viewportWidth: OVERLAY_BREAKPOINT + 1, face: 'drawer' })).toBe('drawer');
    expect(pickAdaptivePopupFace({ viewportWidth: 1440, face: 'drawer', size: 'md' })).toBe('drawer');
  });

  it('above the overlay breakpoint, omitted face is dialog', () => {
    expect(pickAdaptivePopupFace({ viewportWidth: 1440 })).toBe('dialog');
    expect(pickAdaptivePopupFace({ viewportWidth: 1440, face: 'dialog' })).toBe('dialog');
  });

  it('size=fullscreen stays dialog-family even with face=drawer', () => {
    expect(pickAdaptivePopupFace({ viewportWidth: 1440, face: 'drawer', size: 'fullscreen' })).toBe('dialog');
    expect(
      pickAdaptivePopupFace({
        viewportWidth: OVERLAY_BREAKPOINT,
        face: 'drawer',
        size: 'fullscreen',
      }),
    ).toBe('sheet');
  });
});

describe('AdaptivePopup face pick (same props, three faces)', () => {
  it('above 640, omitted face renders dialog', async () => {
    setViewportWidth(1440);
    renderWithProviders(<OpenPopup />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('dialog');
  });

  it('above 640, face=drawer renders the edge drawer', async () => {
    setViewportWidth(1440);
    renderWithProviders(<OpenPopup face="drawer" />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('drawer');
  });

  it('at 640, face=drawer renders the existing sheet', async () => {
    setViewportWidth(OVERLAY_BREAKPOINT);
    renderWithProviders(<OpenPopup face="drawer" />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('sheet');
  });

  it('at 390, face=drawer renders the existing sheet', async () => {
    setViewportWidth(390);
    renderWithProviders(<OpenPopup face="drawer" />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('sheet');
  });

  it('size=fullscreen above 640 stays dialog even with face=drawer', async () => {
    setViewportWidth(1440);
    renderWithProviders(<OpenPopup face="drawer" size="fullscreen" />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('dialog');
  });
});

describe('AdaptivePopup drawer contract (overlay ground)', () => {
  beforeEach(() => {
    setViewportWidth(1440);
  });

  it('traps focus in the drawer and restores it to the opener on close', async () => {
    function RestoreHarness() {
      const [open, setOpen] = useState(false);
      return (
        <AdaptivePopup
          open={open}
          onOpenChange={setOpen}
          face="drawer"
          title="Edit Profile"
          trigger={<Button>Open Popup</Button>}>
          <input aria-label="Name" />
        </AdaptivePopup>
      );
    }
    const result = renderWithProviders(<RestoreHarness />);
    const trigger = result.container.querySelector("[role='button']") as HTMLElement;
    trigger.focus();
    press(trigger);
    await waitFor(() => {
      expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('drawer');
    });
    const frame = dialog() as HTMLElement;
    expect(frame.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('Escape dismisses the drawer (AdaptivePopup is not a destructive alertdialog)', async () => {
    renderWithProviders(<OpenPopup face="drawer" />);
    await waitFor(() => {
      expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe('drawer');
    });
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
  });

  it('grounds on $background and paints overlay elevation while the Button stays flat', async () => {
    renderWithProviders(
      <>
        <Button testID="mpo-button-control">Save</Button>
        <OpenPopup face="drawer" />
      </>,
    );
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    const button = document.querySelector('[data-testid="mpo-button-control"]');
    expect(button).toBeTruthy();
    expect(surface()?.getAttribute('data-popup-ground')).toBe('$background');
    const drawerShadow = shadowClasses(surface() as Element);
    const buttonShadow = shadowClasses(button as Element);
    expect(drawerShadow.length, 'drawer paints an overlay shadow').toBeGreaterThan(0);
    expect(buttonShadow, 'a control paints no resting shadow at the default stop').toEqual([]);
  });

  it('pins to the inline-end viewport edge at zero gap', async () => {
    renderWithProviders(<OpenPopup face="drawer" />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-drawer-gap')).toBe('0');
    expect(surface()?.getAttribute('data-drawer-edge')).toBe('inline-end');
  });

  it('width follows sizeToWidth (sm 400 / md 600 / lg 800 / xl 1000)', async () => {
    const widths = { sm: '400', md: '600', lg: '800', xl: '1000' } as const;
    for (const [size, width] of Object.entries(widths)) {
      const { unmount } = renderWithProviders(<OpenPopup face="drawer" size={size as keyof typeof widths} />);
      await waitFor(() => {
        expect(surface()).not.toBeNull();
      });
      expect(surface()?.getAttribute('data-popup-width')).toBe(width);
      unmount();
    }
  });

  it('attached-edge corners stay 0 (CONTAINER-CAP on the free edge only)', async () => {
    renderWithProviders(<OpenPopup face="drawer" />);
    await waitFor(() => {
      expect(surface()).not.toBeNull();
    });
    expect(surface()?.getAttribute('data-drawer-attached-radius')).toBe('0');
  });
});

// In Chromium and WebKit, <dialog>.show() focuses the first focusable
// descendant, which here is the tabindex=-1 surface itself (Firefox and the HTML
// spec take the first tab stop). FocusScope then saw focus inside and never ran
// the popup's field focus, so typing right after open went nowhere. jsdom has
// no show(), so modelFirstFocusableShow stands in for Chromium's.

describe('AdaptivePopup open focus behind <dialog>.show()', () => {
  let restoreShow = () => {};
  beforeEach(() => {
    setViewportWidth(1440);
    restoreShow = modelFirstFocusableShow();
  });
  afterEach(() => {
    restoreShow();
  });

  function FieldPopup({ face }: { face: 'dialog' | 'drawer' }) {
    const [open, setOpen] = useState(false);
    return (
      <AdaptivePopup
        open={open}
        onOpenChange={setOpen}
        face={face}
        title="Edit Profile"
        trigger={<Button>Open Popup</Button>}>
        <Input inputProps={{ 'aria-label': 'Name' }} />
      </AdaptivePopup>
    );
  }

  it.each(['dialog', 'drawer'] as const)('%s: moves focus off the surface onto the first field', async (face) => {
    const result = renderWithProviders(<FieldPopup face={face} />);
    press(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(surface()?.getAttribute('data-adaptive-popup-mode')).toBe(face);
    });
    const field = document.querySelector("input[aria-label='Name']");
    expect(field).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
  });
});
