import { renderWithProviders } from '@repo/test-utils';
import { OVERLAY_ANCHOR_GAP } from '@repo/theme';
import { act } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FloatingPanel } from './index.native';
import { panelViewportPadding } from './useFloatingPanel';

const screen = vi.hoisted(() => ({ width: 1024, height: 768 }));
vi.mock('react-native-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return {
    ...actual,
    ActionSheetIOS: undefined,
    Modal: ({ children, visible }: { children: import('react').ReactNode; visible: boolean }) =>
      visible ? children : null,
    useWindowDimensions: () => ({ ...screen, scale: 1, fontScale: 1 }),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  screen.width = 1024;
  screen.height = 768;
});

function ContextPanel() {
  const [open, setOpen] = useState(false);
  return (
    <FloatingPanel
      open={open}
      onOpenChange={setOpen}
      openOn="contextmenu"
      trigger={<Text>Row</Text>}
      triggerA11y={{ label: 'Row' }}>
      <Text>Copy</Text>
    </FloatingPanel>
  );
}

/** A finger held on the target past the 500ms long-press delay. */
function longPress(target: Element, pageX: number, pageY: number) {
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperties(down, { pageX: { value: pageX }, pageY: { value: pageY } });
  act(() => {
    target.dispatchEvent(down);
    vi.advanceTimersByTime(600);
  });
}

/** RN-web parks onLayout on the node for a ResizeObserver happy-dom never fires. */
function layout(node: Element, width: number, height: number) {
  const onLayout = (node as unknown as { __reactLayoutHandler?: (event: unknown) => void }).__reactLayoutHandler;
  expect(onLayout).toBeTypeOf('function');
  act(() => {
    onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });
}

const pointPanel = () => document.querySelector<HTMLElement>('[data-testid="floating-panel-point"]');
const sheet = () => document.querySelector('[data-testid="floating-panel-sheet"]');

describe('FloatingPanel native ContextMenu at the long-press point', () => {
  it('opens at the press point on a tablet-wide window, OVERLAY_ANCHOR_GAP below it', () => {
    const result = renderWithProviders(<ContextPanel />);
    longPress(result.getByRole('button', { name: 'Row' }), 300, 200);
    const panel = pointPanel();
    expect(panel).not.toBeNull();
    expect(sheet()).toBeNull();
    expect(panel?.style.opacity).toBe('0');
    layout(panel as HTMLElement, 180, 140);
    expect(panel?.style.left).toBe('300px');
    expect(panel?.style.top).toBe(`${200 + OVERLAY_ANCHOR_GAP}px`);
    expect(panel?.style.opacity).toBe('1');
  });

  it('flips toward the start and up near the bottom-right corner', () => {
    const result = renderWithProviders(<ContextPanel />);
    longPress(result.getByRole('button', { name: 'Row' }), 1000, 740);
    const panel = pointPanel() as HTMLElement;
    layout(panel, 180, 140);
    expect(panel.style.left).toBe(`${1000 - 180}px`);
    expect(panel.style.top).toBe(`${740 - OVERLAY_ANCHOR_GAP - 140}px`);
  });

  it('clamps a menu taller than either side inside the padded window', () => {
    screen.height = 400;
    const result = renderWithProviders(<ContextPanel />);
    longPress(result.getByRole('button', { name: 'Row' }), 300, 250);
    const panel = pointPanel() as HTMLElement;
    layout(panel, 180, 600);
    const top = parseFloat(panel.style.top);
    const maxHeight = parseFloat(panel.style.maxHeight);
    expect(top).toBeGreaterThanOrEqual(panelViewportPadding);
    expect(top + maxHeight).toBe(250 - OVERLAY_ANCHOR_GAP);
  });

  it('keeps the sheet on a phone-wide window', () => {
    screen.width = 390;
    screen.height = 844;
    const result = renderWithProviders(<ContextPanel />);
    longPress(result.getByRole('button', { name: 'Row' }), 200, 300);
    expect(pointPanel()).toBeNull();
    expect(sheet()).not.toBeNull();
  });

  it('does not open on a tap', () => {
    const result = renderWithProviders(<ContextPanel />);
    const target = result.getByRole('button', { name: 'Row' });
    act(() => {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      vi.advanceTimersByTime(100);
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });
    expect(pointPanel()).toBeNull();
    expect(sheet()).toBeNull();
  });
});
