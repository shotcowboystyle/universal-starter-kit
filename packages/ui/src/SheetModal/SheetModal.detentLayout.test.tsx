/**
 * What the native sheet lays out at a settled detent.
 *
 * An iOS simulator run dragged a sheet to a lower detent: it
 * kept its full height and slid it below the screen, or under the keyboard,
 * so the tail of a list inside it was unreachable.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup } from '@testing-library/react';
import { Animated, PanResponder, type PanResponderCallbacks } from 'react-native';
import { Text } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveSheetDetents } from './detents';
import { SheetModal } from './index.native';

import type { SheetModalProps } from './index';

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

function open(props: Partial<SheetModalProps> = {}) {
  const view = renderWithProviders(
    <SheetModal open onOpenChange={() => {}} scrollable {...props}>
      <Text>row</Text>
    </SheetModal>,
  );
  const frame = view.getByTestId('sheet-modal-frame');
  const full = px(frame.style.maxHeight);
  return { view, frame, full };
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

describe('a native sheet at rest on a lower detent', () => {
  it('is laid out at the detent height, not slid down at full height', () => {
    const { frame, full } = open();
    const [, lower] = resolveSheetDetents({ travel: full, scrollable: true });
    expect(lower).toBeLessThan(full);
    drag(full - lower);
    expect(settle().toValue).toBe(full - lower);
    expect(px(frame.style.maxHeight)).toBe(lower);
    expect(frame.style.transform).toContain('translateY(0px)');
  });

  it('gives a filled body the detent as its definite height', () => {
    const { frame, full } = open({ fill: true });
    const [, lower] = resolveSheetDetents({ travel: full, scrollable: true });
    drag(full - lower);
    settle();
    expect(px(frame.style.height)).toBe(lower);
    expect(px(frame.style.maxHeight)).toBe(lower);
  });

  it('ends above the keyboard when the keyboard is up', () => {
    keyboard.inset = 300;
    const { frame, full } = open();
    expect(frame.parentElement?.style.paddingBottom).toBe('300px');
    const [, lower] = resolveSheetDetents({ travel: full, scrollable: true });
    drag(full - lower);
    settle();
    expect(px(frame.style.maxHeight)).toBe(lower);
    expect(frame.style.transform).toContain('translateY(0px)');
  });

  it('grows back to full height under a still top edge when a drag picks it up', () => {
    const { frame, full } = open();
    const [, lower] = resolveSheetDetents({ travel: full, scrollable: true });
    drag(full - lower);
    settle();
    act(() => pan.onPanResponderGrant?.({} as never, {} as never));
    expect(px(frame.style.maxHeight)).toBe(full);
    expect(frame.style.transform).toContain(`translateY(${full - lower}px)`);
    act(() => pan.onPanResponderRelease?.({} as never, { dy: -(full - lower), vy: 0 } as never));
    expect(settle().toValue).toBe(0);
    expect(px(frame.style.maxHeight)).toBe(full);
  });

  it('keeps its top edge when the keyboard moved the max height under it', () => {
    const { view, frame, full } = open();
    layout(frame, full);
    const [, lower] = resolveSheetDetents({ travel: full, scrollable: true });
    drag(full - lower);
    settle();
    keyboard.inset = 300;
    view.rerender(
      <SheetModal open onOpenChange={() => {}} scrollable>
        <Text>row</Text>
      </SheetModal>,
    );
    const lifted = 844 - 300 - 48;
    expect(px(frame.style.maxHeight)).toBe(Math.min(lifted, lower));
    act(() => pan.onPanResponderGrant?.({} as never, {} as never));
    expect(px(frame.style.maxHeight)).toBe(lifted);
    expect(frame.style.transform).toContain(`translateY(${lifted - lower}px)`);
  });

  it('keeps the drag when a scroll inside the sheet asks for the touch', () => {
    open();
    expect(pan.onPanResponderTerminationRequest?.({} as never, {} as never)).toBe(false);
  });

  it('forgets the rest height when the sheet closes and opens again', () => {
    const { view, frame, full } = open();
    const [, lower] = resolveSheetDetents({ travel: full, scrollable: true });
    drag(full - lower);
    settle();
    const sheet = (next: boolean) => (
      <SheetModal open={next} onOpenChange={() => {}} scrollable>
        <Text>row</Text>
      </SheetModal>
    );
    view.rerender(sheet(false));
    view.rerender(sheet(true));
    expect(px(frame.style.maxHeight)).toBe(full);
  });
});
