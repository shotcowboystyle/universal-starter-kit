/**
 * SheetModal (native) — React Native Modal bottom sheet.
 *
 * Web twin (./index.tsx) is a tamagui `Sheet modal`. On device (Expo Go,
 * tamagui 2.0.0-rc.41) that Sheet never (re)presents from a trigger tap.
 * This twin uses a core RN `Modal` — same workaround as FloatingPanel.
 *
 * Apple / gorhom anatomy: grabber, themed surface, top-only radius, backdrop
 * tap + Android back + VoiceOver escape dismiss, keyboard avoiding, content
 * height with a large-detent cap. The frame is not a control.
 */

import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  View as RNView,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import { View, YStack } from 'tamagui';

import { useTranslation } from '../shared/i18n';
import { useKeyboardInset } from '../shared/useKeyboardInset';
import { DialogRegionContext } from '../surfaces';

import { minSheetHeight, resolveSheetDetents } from './detents';

import type { SheetModalProps } from './index';
export type { SheetModalProps } from './index';

const sheetMaxHeightRatio = 0.85;
const bottomInset = Platform.OS === 'ios' ? 24 : 16;
// Backdrop left visible above the sheet, so the scrim stays tappable.
const backdropStrip = 48;
// Released more than this far below the smallest detent, the sheet dismisses.
const dismissThreshold = 56;
const IN_DIALOG_REGION = { inDialogRegion: true } as const;
/*
 * Fill: an owned viewport bootstraps from zero unless EVERY link
 * between the capped frame and the body gives way at once — frame height,
 * surface, padded stack, body slot. Opening only the outer one keeps the
 * measured-zero failure, so these are applied together or not at all.
 */
const fillSlot = { flex: 1, minHeight: 0 } as const;
const nonShrinking = { flexShrink: 0 } as const;
/*
 * The Modal is its own native window, yet its touch events bubble
 * through the React tree to whatever rendered it. A screen ScrollView there
 * marks itself touching, takes the responder on the first scroll of a list
 * in the sheet, and blurs the focused input on release.
 */
const stopAtModal = (event: GestureResponderEvent) => {
  event.stopPropagation();
};

export function SheetModal({
  open,
  onOpenChange,
  children,
  header,
  snapPoint,
  scrollable,
  fill = false,
}: SheetModalProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const topInset = useContext(SafeAreaInsetsContext)?.top ?? initialWindowMetrics?.insets.top ?? 0;
  const [backdropArmed, setBackdropArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleBackdropPress = useCallback(() => {
    if (backdropArmed) {
      close();
    }
  }, [backdropArmed, close]);

  // The sheet ends above the keyboard rather than running under it,
  // and below the status bar with a strip of backdrop still showing.
  const available = Math.max(0, windowHeight - keyboardInset);
  const maxHeight = Math.max(
    minSheetHeight,
    Math.round(Math.min(windowHeight * sheetMaxHeightRatio, available - topInset - backdropStrip)),
  );

  /*
   * Drag and detents, the same machinery as FloatingPanel so the two
   * native sheets behave identically under a finger.
   *
   * PanResponder rather than react-native-gesture-handler: gesture-handler
   * gestures inside a core RN Modal need their own GestureHandlerRootView
   * within the modal before they fire at all.
   *
   * translateY measures DOWN from fully-expanded: 0 is the sheet at full
   * height, `travel` is fully off-screen.
   *
   * The detent heights themselves live in ./detents.ts, pure, so the geometry
   * is specced without a native renderer. An earlier rewrite rebuilt this
   * block from a stale copy and silently dropped the `snapPoint` push,
   * leaving the prop declared, documented and passed by four callers while
   * doing nothing on device. Keep the math in one place so a rewrite of the
   * animation cannot take the geometry with it again.
   */
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const travel = measuredHeight || maxHeight;
  const detents = useMemo(
    () => resolveSheetDetents({ travel, scrollable, snapPoint }),
    [travel, scrollable, snapPoint],
  );

  /*
   * Park the sheet OFF-SCREEN before the modal ever presents.
   *
   * `animationType="fade"` is a cross-dissolve on iOS and `onShow` fires in the
   * COMPLETION block of presentViewController, so it runs AFTER the ~300ms
   * dissolve. With translateY resting at 0 the sheet dissolved in AT REST
   * (entrance one), onShow then snapped it off-screen in a single frame (the
   * close), and the slide brought it back (entrance two).
   *
   * `travel` is fully off-screen and is known on the first render (maxHeight is
   * window-derived), so the very first present is already primed; the effect
   * below re-parks after every close for the ones after that.
   */
  const translateY = useRef(new Animated.Value(travel)).current;
  const restRef = useRef(travel);
  const travelRef = useRef(travel);
  const detentsRef = useRef(detents);
  travelRef.current = travel;
  detentsRef.current = detents;

  // Async callbacks belong to one committed presentation, never its successor.
  const presentationRef = useRef(0);
  const activeRef = useRef(false);

  /*
   * A sheet at rest below full height is LAID OUT at that
   * height. Translating a full-height frame down pushed its bottom off the
   * screen, or under the keyboard, and the scroll owner inside still measured
   * the full height, so the tail could never be scrolled into view.
   *
   * `frameCap` rides the same Animated.View as `translateY`, so the swap
   * between "full height, translated" and "detent height, at 0" lands in one
   * commit and the top edge does not move. `restHeightRef` is null at full
   * height; a gesture always runs uncapped, in `travel` coordinates.
   */
  const frameCap = useRef(new Animated.Value(maxHeight)).current;
  const maxHeightRef = useRef(maxHeight);
  const restHeightRef = useRef<number | null>(null);
  // The last uncapped layout, and whether it filled the max height. A capped
  // frame measures only its cap, so when the keyboard moves the max height
  // under a resting sheet, its full height is re-derived from these.
  const naturalRef = useRef(0);
  const filledRef = useRef(false);

  useLayoutEffect(() => {
    maxHeightRef.current = maxHeight;
    const rest = restHeightRef.current;
    frameCap.setValue(rest === null ? maxHeight : Math.min(maxHeight, rest));
    if (rest !== null && naturalRef.current > 0) {
      setMeasuredHeight(filledRef.current ? maxHeight : Math.min(naturalRef.current, maxHeight));
    }
  }, [frameCap, maxHeight]);

  const restAt = useCallback(
    (height: number) => {
      restHeightRef.current = height;
      frameCap.setValue(Math.min(maxHeightRef.current, height));
      restRef.current = 0;
      translateY.setValue(0);
    },
    [frameCap, translateY],
  );

  const releaseRest = useCallback(() => {
    const rest = restHeightRef.current;
    if (rest === null) {
      return;
    }
    restHeightRef.current = null;
    const offset = Math.max(0, travelRef.current - Math.min(maxHeightRef.current, rest));
    frameCap.setValue(maxHeightRef.current);
    restRef.current = offset;
    translateY.setValue(offset);
  }, [frameCap, translateY]);

  const settleTo = useCallback(
    (height: number, velocity = 0) => {
      const presentation = presentationRef.current;
      const toValue = Math.max(0, travelRef.current - height);
      restRef.current = toValue;
      Animated.spring(translateY, {
        toValue,
        velocity,
        damping: 32,
        stiffness: 320,
        mass: 0.9,
        overshootClamping: true,
        // JS driver. A native-driven Animated node inside a core RN
        // Modal does not advance on the New Architecture, and the drag path
        // already writes this value from JS.
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished || toValue === 0) {
          return;
        }
        if (activeRef.current && presentation === presentationRef.current) {
          restAt(height);
        }
      });
    },
    [restAt, translateY],
  );

  const dismiss = useCallback(
    (velocity = 0) => {
      if (!activeRef.current) {
        return;
      }
      const presentation = presentationRef.current;
      restRef.current = travelRef.current;
      Animated.spring(translateY, {
        toValue: travelRef.current,
        velocity,
        damping: 40,
        stiffness: 400,
        mass: 0.9,
        overshootClamping: true,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && activeRef.current && presentation === presentationRef.current) {
          close();
        }
      });
    },
    [close, translateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > 2,
        // Lifting a rest cap can scroll the list inside, and a scroll lets
        // any ancestor ScrollView the finger started under claim the touch,
        // ending the drag and blurring a focused input on release.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
              restRef.current = value;
            }
          });
          releaseRest();
        },
        onPanResponderMove: (_evt, g) => {
          const next = restRef.current + g.dy;
          translateY.setValue(next < 0 ? next / 3 : next);
        },
        onPanResponderRelease: (_evt, g) => {
          const points = detentsRef.current;
          const tvl = travelRef.current;
          const current = Math.max(0, restRef.current + g.dy);
          const projected = current + g.vy * 120;
          const smallestRest = tvl - points[points.length - 1];
          if (projected > smallestRest + dismissThreshold || g.vy > 1.1) {
            dismiss(g.vy);
            return;
          }
          let best = points[0];
          let bestDelta = Number.POSITIVE_INFINITY;
          for (const height of points) {
            const delta = Math.abs(projected - (tvl - height));
            if (delta < bestDelta) {
              bestDelta = delta;
              best = height;
            }
          }
          settleTo(best, g.vy);
        },
        onPanResponderTerminate: () => {
          settleTo(travelRef.current - restRef.current);
        },
      }),
    [dismiss, releaseRest, settleTo, translateY],
  );

  /*
   * The entrance runs from an effect on `open` as well as from
   * `onShow`, whichever gets here first, guarded so the second is a no-op.
   * Wired to `onShow` ALONE, the sheet stays parked at `travel` for good
   * whenever that callback does not arrive: one sheet-height below the
   * screen, every row in the accessibility tree and none of them reachable.
   */
  const enteredRef = useRef(false);
  const enter = useCallback(() => {
    if (!activeRef.current || enteredRef.current) {
      return;
    }
    const presentation = presentationRef.current;
    enteredRef.current = true;
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
    }
    armTimerRef.current = setTimeout(() => {
      if (activeRef.current && presentation === presentationRef.current) {
        armTimerRef.current = null;
        setBackdropArmed(true);
      }
    }, 280);
    // The modal fades (backdrop dims IN PLACE); only the panel slides.
    // The sheet is already parked off-screen before the present, so
    // this setValue only normalises the start to exactly `travel` once the
    // sheet has measured. Priming it here ALONE is the open-close-open bug:
    // by the time onShow runs the dissolve has already shown the sheet.
    translateY.setValue(travelRef.current);
    restRef.current = 0;
    Animated.timing(translateY, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && activeRef.current && presentation === presentationRef.current) {
        translateY.setValue(0);
      }
    });
  }, [translateY]);

  useEffect(() => {
    presentationRef.current += 1;
    activeRef.current = open;
    restHeightRef.current = null;
    frameCap.setValue(maxHeightRef.current);
    if (open) {
      enter();
    } else {
      setBackdropArmed(false);
      const parked = travelRef.current || 10000;
      translateY.setValue(parked);
      restRef.current = parked;
    }
    return () => {
      // Invalidate first: stopping an animation can synchronously finish it.
      activeRef.current = false;
      presentationRef.current += 1;
      enteredRef.current = false;
      if (armTimerRef.current) {
        clearTimeout(armTimerRef.current);
        armTimerRef.current = null;
      }
      translateY.stopAnimation();
    };
  }, [open, enter, frameCap, translateY]);

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close} onShow={enter}>
      <RNView
        style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboardInset }}
        onTouchStart={stopAtModal}
        onTouchMove={stopAtModal}
        onTouchEnd={stopAtModal}
        onTouchCancel={stopAtModal}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackdropPress}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}>
          <View flex={1} backgroundColor="$shadow6" />
        </Pressable>
        <Animated.View
          onLayout={(e) => {
            if (restHeightRef.current !== null) {
              return;
            }
            const h = Math.round(e.nativeEvent.layout.height);
            if (h <= 0) {
              return;
            }
            naturalRef.current = h;
            filledRef.current = h >= maxHeightRef.current - 1;
            if (h !== measuredHeight) {
              setMeasuredHeight(h);
            }
          }}
          testID="sheet-modal-frame"
          style={{
            // Flex children default to flexShrink 0, so without this
            // the sheet cannot give way to the keyboard.
            flexShrink: 1,
            minHeight: 0,
            maxHeight: frameCap,
            // The cap is already keyboard- and window-aware; fill only asks
            // for it as a definite height rather than an upper bound.
            ...(fill ? { height: frameCap } : null),
            transform: [{ translateY }],
          }}>
          <YStack
            testID="sheet-modal-surface"
            {...knobProps.surface}
            {...knobProps.borderRadius}
            borderBottomLeftRadius={0}
            borderBottomRightRadius={0}
            elevation={knobProps.elevation}
            maxHeight={maxHeight}
            flexShrink={1}
            minHeight={0}
            {...(fill ? fillSlot : null)}
            paddingTop="$2"
            paddingBottom={keyboardInset > 0 ? 8 : bottomInset}
            overflow="hidden"
            // No focus or press pseudo on this surface: on native tamagui
            // turns one into a touch-responder claim, and a responder here
            // takes every drag from the ScrollView inside.
            accessibilityViewIsModal
            onAccessibilityEscape={close}>
            {/*
              The grabber is the grab ZONE, not the 5pt pill inside it. The
              frame is not a control; the grabber is the one part of
              it that is, so it is the only thing that takes the gesture, and
              it never fights the ScrollView below.
            */}
            <RNView
              {...panResponder.panHandlers}
              accessibilityRole="adjustable"
              accessibilityLabel={t('Drag to resize')}
              testID="sheet-modal-grabber"
              style={{
                alignSelf: 'stretch',
                alignItems: 'center',
                paddingTop: 3,
                paddingBottom: 11,
                ...(fill ? nonShrinking : null),
              }}>
              <View
                width={36}
                height={5}
                borderRadius={100}
                backgroundColor="$color8"
                opacity={0.45}
                accessible={false}
              />
            </RNView>
            <DialogRegionContext.Provider value={IN_DIALOG_REGION}>
              <YStack
                testID="sheet-modal-content"
                padding={knobProps.panelPadding.padding}
                gap={knobProps.gap.gap}
                flexShrink={1}
                {...(fill ? fillSlot : null)}>
                {fill ? (
                  <>
                    {header ? <RNView style={nonShrinking}>{header}</RNView> : null}
                    <RNView testID="sheet-modal-body" style={fillSlot}>
                      {scrollable ? (
                        <RNScrollView testID="sheet-modal-scroll" style={fillSlot} keyboardShouldPersistTaps="handled">
                          {children}
                        </RNScrollView>
                      ) : (
                        children
                      )}
                    </RNView>
                  </>
                ) : (
                  <>
                    {header}
                    {scrollable ? (
                      <RNScrollView
                        testID="sheet-modal-scroll"
                        style={{ flexGrow: 0 }}
                        keyboardShouldPersistTaps="handled">
                        {children}
                      </RNScrollView>
                    ) : (
                      children
                    )}
                  </>
                )}
              </YStack>
            </DialogRegionContext.Provider>
          </YStack>
        </Animated.View>
      </RNView>
    </Modal>
  );
}
