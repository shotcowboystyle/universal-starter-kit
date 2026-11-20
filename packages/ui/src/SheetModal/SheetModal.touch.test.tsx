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
import type { ComponentProps, ForwardedRef, ReactElement, TouchEvent } from 'react';
import { View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Text } from 'tamagui';
import type { TamaguiElement, YStack as TamaguiYStack } from 'tamagui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SheetModal } from './index.native';

type StackProps = ComponentProps<typeof TamaguiYStack>;

const stacks = vi.hoisted(() => new Map<string, StackProps>());

vi.mock(import('react-native-web'), async (importOriginal) => ({
  ...(await importOriginal()),
  // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the module must report no ActionSheetIOS; null would still be a present export
  ActionSheetIOS: undefined,
  Modal: ({ children }: { children: ReactElement }) => children,
}));
vi.mock(import('tamagui'), async (importOriginal) => {
  const actual = await importOriginal();
  const React = await import('react');
  const YStack = React.forwardRef(function SpyYStack(props: StackProps, ref: ForwardedRef<TamaguiElement>) {
    if (props.testID !== undefined) {
      stacks.set(props.testID, props);
    }
    return React.createElement(actual.YStack as never, { ...props, ref });
  });
  return { ...actual, YStack: YStack as never };
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

describe('SheetModal touch isolation', () => {
  afterEach(() => {
    cleanup();
    stacks.clear();
  });

  it('keeps every native sheet stack out of the touch responder', () => {
    for (const fill of [false, true]) {
      renderWithProviders(
        <SheetModal
          open
          onOpenChange={() => {}}
          fill={fill}
          scrollable>
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
    const handleStart = vi.fn<(event: TouchEvent<HTMLDivElement>) => void>();
    const handleMove = vi.fn<(event: TouchEvent<HTMLDivElement>) => void>();
    const handleEnd = vi.fn<(event: TouchEvent<HTMLDivElement>) => void>();
    const handleCancel = vi.fn<(event: TouchEvent<HTMLDivElement>) => void>();
    const outside = { start: handleStart, move: handleMove, end: handleEnd, cancel: handleCancel };
    const inside = vi.fn<(event: GestureResponderEvent) => void>();
    for (const fill of [false, true]) {
      const view = renderWithProviders(
        <div
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleCancel}>
          <SheetModal
            open
            onOpenChange={() => {}}
            fill={fill}
            scrollable>
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
});
