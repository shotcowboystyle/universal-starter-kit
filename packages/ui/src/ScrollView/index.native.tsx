import { forwardRef } from 'react';
import { ScrollView as RNScrollView, type ScrollViewProps as RNScrollViewProps } from 'react-native';
import { styled, type ScrollView as TamaguiScrollView } from 'tamagui';

export type { ScrollViewProps } from 'tamagui';

// tamagui 2.7.6 drops every key in helpers/webPropsToSkip.native (onScroll is
// one) before a non-HOC styled component reaches its host, so its own
// styled(RN ScrollView) never delivers onScroll. The handler rides
// past getSplitStyles under another name and is restored at the RN boundary.
// Drop this file once tamagui forwards onScroll on native; the upstream
// control in ScrollView.native.spec.tsx fails when it does.

type ScrollHandler = RNScrollViewProps['onScroll'];

const ScrollHost = forwardRef<RNScrollView, RNScrollViewProps & { scrollHandler?: ScrollHandler }>(function ScrollHost(
  { scrollHandler, ...props },
  ref,
) {
  return <RNScrollView ref={ref} {...props} onScroll={scrollHandler} />;
});

const ScrollFrame = styled(
  ScrollHost,
  {
    name: 'ScrollView',
    scrollEnabled: true,
    // At RN's "never" a ScrollView claims, in the capture phase, the
    // first tap on any descendant while the keyboard is up, and a native
    // sheet's rows are React descendants of the screen that opened it.
    keyboardShouldPersistTaps: 'handled',
    variants: {
      fullscreen: {
        true: { position: 'absolute', inset: 0 },
      },
    } as const,
  },
  {
    accept: {
      contentContainerStyle: 'style',
    } as const,
  },
);

export const ScrollView = ScrollFrame.styleable(function ScrollView({ onScroll, ...props }, ref) {
  return <ScrollFrame ref={ref} {...props} scrollHandler={onScroll} />;
}) as unknown as typeof TamaguiScrollView;
