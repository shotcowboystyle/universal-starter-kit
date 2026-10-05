/**
 * What the native FloatingPanel sheet lays out at a settled detent.
 *
 * The iOS simulator run on 965825866 dragged the Combobox sheet to its lower
 * detent and scrolled the list to its end: the last six rows sat below the
 * screen edge, because the sheet kept its full height and slid it down. With
 * the keyboard up the same drag left the body under the keyboard.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup } from '@testing-library/react';
import { Animated, PanResponder, type PanResponderCallbacks } from 'react-native';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FloatingPanel } from './index.native';

import type { FloatingPanelProps } from './index';

const keyboard = vi.hoisted(() => ({ inset: 0 }));

vi.mock('react-native-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  ActionSheetIOS: undefined,
  Modal: ({ children }: { children: import('react').ReactNode }) => children,
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
vi.mock('../shared/useKeyboardInset', () => ({ useKeyboardInset: () => keyboard.inset }));

let pan: PanResponderCallbacks;
let springs: Array<{ toValue: number; done?: (result: { finished: boolean }) => void }>;

beforeEach(() => {
  keyboard.inset = 0;
  springs = [];
  vi.spyOn(PanResponder, 'create').mockImplementation((config) => {
    pan = config;
    return { panHandlers: {} } as never;
  });
  vi.spyOn(Animated, 'spring').mockImplementation((_value, config) => ({
    start: (done) => {
      springs.push({ toValue: config.toValue as number, done });
    },
    stop: vi.fn(),
    reset: vi.fn(),
  }));
  vi.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (done) => done?.({ finished: true }),
    stop: vi.fn(),
    reset: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function px(value: string) {
  return Number.parseFloat(value);
}

function open(props: Partial<FloatingPanelProps> = {}) {
  const view = renderWithProviders(
    <FloatingPanel open onOpenChange={() => {}} trigger={<Text>Author</Text>} scrollable {...props}>
      <Text>row</Text>
    </FloatingPanel>,
  );
  const sheet = view.getByTestId('floating-panel-sheet');
  const full = px(sheet.style.maxHeight);
  return { view, sheet, full, lower: Math.round(full * 0.55) };
}

/** react-native-web keeps the onLayout handler on the node; call it the way a device layout would. */
function layout(element: HTMLElement, height: number) {
  const handler = (element as unknown as Record<string, (event: unknown) => void>).__reactLayoutHandler;
  act(() => {
    handler({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  });
}

function drag(dy: number) {
  act(() => {
    pan.onPanResponderGrant?.({} as never, {} as never);
    pan.onPanResponderMove?.({} as never, { dy } as never);
    pan.onPanResponderRelease?.({} as never, { dy, vy: 0 } as never);
  });
}

function settle() {
  const last = springs[springs.length - 1];
  act(() => last.done?.({ finished: true }));
  return last;
}

describe('a native FloatingPanel sheet at rest on a lower detent', () => {
  it('is laid out at the detent height, so the end of its list is on screen', () => {
    const { sheet, full, lower } = open();
    drag(full - lower);
    expect(settle().toValue).toBe(full - lower);
    expect(px(sheet.style.maxHeight)).toBe(lower);
    expect(sheet.style.transform).toContain('translateY(0px)');
  });

  it('ends above the keyboard when the keyboard is up', () => {
    keyboard.inset = 300;
    const { sheet, full, lower } = open({ sheetFill: true });
    expect(sheet.parentElement?.style.paddingBottom).toBe('300px');
    drag(full - lower);
    settle();
    expect(px(sheet.style.maxHeight)).toBe(lower);
    expect(sheet.style.transform).toContain('translateY(0px)');
  });

  it('grows back to full height under a still top edge when a drag picks it up', () => {
    const { sheet, full, lower } = open();
    drag(full - lower);
    settle();
    act(() => pan.onPanResponderGrant?.({} as never, {} as never));
    expect(px(sheet.style.maxHeight)).toBe(full);
    expect(sheet.style.transform).toContain(`translateY(${full - lower}px)`);
  });

  it('keeps its top edge when the keyboard moved the max height under it', () => {
    const { view, sheet, full, lower } = open();
    layout(sheet, full);
    drag(full - lower);
    settle();
    keyboard.inset = 300;
    view.rerender(
      <FloatingPanel open onOpenChange={() => {}} trigger={<Text>Author</Text>} scrollable>
        <Text>row</Text>
      </FloatingPanel>,
    );
    const lifted = 844 - 300 - 48;
    expect(px(sheet.style.maxHeight)).toBe(Math.min(lifted, lower));
    act(() => pan.onPanResponderGrant?.({} as never, {} as never));
    expect(px(sheet.style.maxHeight)).toBe(lifted);
    expect(sheet.style.transform).toContain(`translateY(${lifted - lower}px)`);
  });

  it('keeps the drag when a scroll inside the sheet asks for the touch', () => {
    open();
    expect(pan.onPanResponderTerminationRequest?.({} as never, {} as never)).toBe(false);
  });

  it('keeps a content-sized picker at its one height', () => {
    const { sheet, full } = open({ scrollable: false });
    drag(40);
    expect(settle().toValue).toBe(0);
    expect(px(sheet.style.maxHeight)).toBe(full);
  });
});
