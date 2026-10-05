/**
 * An owned ScrollView inside the native sheet never scrolled on
 * the iOS simulator, while the same swipe scrolled the Combobox sheet.
 *
 * On native, tamagui turns a press or focus-visible pseudo into a JS
 * responder claim (`onStartShouldSetResponder` returning true). A surface
 * holding that claim takes every touch that starts on plain content inside
 * it, and a responder ancestor stops the ScrollView's own pan.
 *
 * The sheet's RN Modal is its own native window, but its touch events still
 * bubble through the React tree to whatever rendered it. A screen ScrollView
 * up there saw onTouchStart, marked itself touching, took the responder on
 * the first scroll event of a list in the sheet, and on release blurred the
 * focused input: the keyboard dropped on the first scroll.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent } from '@testing-library/react';
import { View } from 'react-native';
import { Text } from 'tamagui';
import { afterEach, expect, it, vi } from 'vitest';

import { SheetModal } from './index.native';

const stacks = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('react-native-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  ActionSheetIOS: undefined,
  Modal: ({ children }: { children: import('react').ReactNode }) => children,
}));
vi.mock('tamagui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tamagui')>();
  const React = await import('react');
  const YStack = React.forwardRef((props: Record<string, unknown>, ref) => {
    if (typeof props.testID === 'string') {
      stacks.set(props.testID, props);
    }
    return React.createElement(actual.YStack as never, { ...props, ref });
  });
  return { ...actual, YStack };
});

afterEach(() => {
  cleanup();
  stacks.clear();
});

const claimsResponder = [
  'pressStyle',
  'focusStyle',
  'focusVisibleStyle',
  'onPress',
  'onPressIn',
  'onPressOut',
  'onLongPress',
];

it('keeps every native sheet stack out of the touch responder', () => {
  for (const fill of [false, true]) {
    renderWithProviders(
      <SheetModal open onOpenChange={() => {}} fill={fill} scrollable>
        <Text>row</Text>
      </SheetModal>,
    );
    for (const id of ['sheet-modal-surface', 'sheet-modal-content']) {
      const stack = stacks.get(id);
      expect(stack, id).toBeDefined();
      for (const key of claimsResponder) {
        expect(stack, `${id} ${key}`).not.toHaveProperty(key);
      }
    }
    cleanup();
    stacks.clear();
  }
});

it('keeps touches inside the sheet from bubbling to React ancestors outside the modal', () => {
  const outside = { start: vi.fn(), move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
  const inside = vi.fn();
  for (const fill of [false, true]) {
    const view = renderWithProviders(
      <div
        onTouchStart={outside.start}
        onTouchMove={outside.move}
        onTouchEnd={outside.end}
        onTouchCancel={outside.cancel}>
        <SheetModal open onOpenChange={() => {}} fill={fill} scrollable>
          <View onTouchStart={inside}>
            <Text>row</Text>
          </View>
        </SheetModal>
      </div>,
    );
    const row = view.getByText('row');
    const touch = { identifier: 0, clientX: 10, clientY: 10, pageX: 10, pageY: 10, force: 1 };
    const down = { touches: [touch], changedTouches: [touch] };
    const up = { touches: [], changedTouches: [touch] };
    fireEvent.touchStart(row, down);
    fireEvent.touchMove(row, down);
    fireEvent.touchEnd(row, up);
    fireEvent.touchCancel(row, up);
    cleanup();
  }
  expect(inside).toHaveBeenCalledTimes(2);
  for (const [phase, handler] of Object.entries(outside)) {
    expect(handler, phase).not.toHaveBeenCalled();
  }
});
