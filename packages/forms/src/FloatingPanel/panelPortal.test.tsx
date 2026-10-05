import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ScrollView, Text, Theme } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Button } from '../Button';
import { Select } from '../fields/Select';
import { containsAcrossPanels, panelPortalAnchor } from '../shared/panelPortal';

import { panelPortalHost } from './PanelPortal';

import { FloatingPanel } from './index';

/**
 * react-native-web's ScrollView sets `transform: translateZ(0)` on
 * its scroll node, which makes it the containing block of any
 * `position: fixed` descendant, so a web panel left in the scroller's DOM is
 * clipped by it. Every web panel now portals out of the scroller.
 */

const options = ['Apple', 'Banana', 'Cherry'].map((label) => ({
  label,
  value: label.toLowerCase(),
}));

const pointerPress = (el: Element) => {
  fireEvent.pointerDown(el);
  fireEvent.mouseDown(el, { detail: 1 });
  fireEvent.mouseUp(el, { detail: 1 });
  fireEvent.click(el, { detail: 1 });
};

function PanelHarness() {
  const [open, setOpen] = useState(false);
  return (
    <FloatingPanel open={open} onOpenChange={setOpen} trigger={<Button>Open</Button>}>
      <Text>panel body</Text>
    </FloatingPanel>
  );
}

let innerWidth = 0;
beforeEach(() => {
  innerWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
});
afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: innerWidth,
  });
});

describe('web panels escape a react-native-web ScrollView', () => {
  it("a Select's listbox is not a descendant of the scroll node", async () => {
    const result = renderWithProviders(
      <ScrollView testID="scroller" height={120}>
        <Select options={options} placeholder="Pick" />
      </ScrollView>,
    );
    const scroller = result.getByTestId('scroller');
    const trigger = result.getByTestId('select-trigger');
    expect(scroller.contains(trigger)).toBe(true);
    pointerPress(trigger);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="select-dropdown"]')).not.toBeNull();
    });
    const dropdown = document.querySelector('[data-testid="select-dropdown"]') as HTMLElement;
    expect(scroller.contains(dropdown)).toBe(false);
    expect(dropdown.closest('[data-fp-portal]')).not.toBeNull();
    const anchor = panelPortalAnchor(dropdown);
    expect(anchor && scroller.contains(anchor)).toBe(true);
    expect(containsAcrossPanels(scroller, dropdown)).toBe(true);
  });

  it("a FloatingPanel's viewport is not a descendant of the scroll node", async () => {
    const result = renderWithProviders(
      <ScrollView testID="scroller" height={120}>
        <PanelHarness />
      </ScrollView>,
    );
    const scroller = result.getByTestId('scroller');
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="floating-panel-viewport"]')).not.toBeNull();
    });
    const viewport = document.querySelector('[data-testid="floating-panel-viewport"]') as HTMLElement;
    expect(scroller.contains(viewport)).toBe(false);
    expect(viewport.style.position).toBe('fixed');
    expect(containsAcrossPanels(scroller, viewport)).toBe(true);
  });

  it("carries the trigger's theme across the portal", async () => {
    const result = renderWithProviders(
      <Theme name="dark">
        <ScrollView testID="scroller" height={120}>
          <PanelHarness />
        </ScrollView>
      </Theme>,
    );
    pointerPress(result.container.querySelector("[role='button']") as Element);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="floating-panel-viewport"]')).not.toBeNull();
    });
    const viewport = document.querySelector('[data-testid="floating-panel-viewport"]') as HTMLElement;
    const portal = viewport.closest('[data-fp-portal]') as HTMLElement;
    const themed = Array.from(portal.querySelectorAll<HTMLElement>('.is_Theme')).filter((el) => el.contains(viewport));
    expect(themed.some((el) => /\bt_dark\b/.test(el.className))).toBe(true);
  });
});

describe('panelPortalHost', () => {
  it('mounts inside the nearest modal layer so its focus trap keeps the panel', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const scroller = document.createElement('div');
    const trigger = document.createElement('button');
    scroller.append(trigger);
    dialog.append(scroller);
    document.body.append(dialog);
    try {
      expect(panelPortalHost(trigger)).toBe(dialog);
    } finally {
      dialog.remove();
    }
  });

  it('falls back to the body', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    try {
      expect(panelPortalHost(trigger)).toBe(document.body);
    } finally {
      trigger.remove();
    }
  });
});
