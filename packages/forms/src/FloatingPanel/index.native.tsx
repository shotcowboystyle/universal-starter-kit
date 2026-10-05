/**
 * FloatingPanel (native) — React Native Modal bottom sheet.
 *
 * The web implementation (./index.tsx) anchors a floating-ui panel to the
 * trigger and falls back to a Tamagui `Sheet modal` on small viewports and
 * native. On device (Expo Go, tamagui 2.0.0-rc.41) the modal Sheet's
 * portal/animation machinery never presents — tapping a Select or Date
 * trigger flips `open` and nothing appears. This native variant swaps the
 * overlay for a core React Native `Modal`, which is a native view-controller
 * presentation: no portal host, no animation driver, no DOM measurement.
 *
 * Same public API as ./index.tsx. Web bundles never load this file
 * (tamagui-build emits it only into the *.native.js outputs).
 *
 * Semantics preserved from the sheet path:
 * - tap trigger → sheet slides up from the bottom (full width, themed
 *   surface, drag-handle affordance, safe-area padding)
 * - selecting a value commits (the field's own onValueChange) and the field
 *   closes the panel
 * - backdrop tap and the Android back button dismiss WITHOUT committing
 *
 * Entrance / driver notes:
 * - The slide-in is driven by an EFFECT on `open`, not by `Modal.onShow`
 *   alone. `onShow` still fires it (it is the better moment when it arrives)
 *   but it is one of two triggers, guarded to run once per present. A sheet
 *   whose only path onto the screen is a native presentation callback is a
 *   sheet that is off-screen whenever that callback does not arrive.
 * - Every animation inside the Modal uses the JS driver. On the New
 *   Architecture a native-driven Animated node inside a core RN `Modal`
 *   never advances: `setValue` still paints (the node is updated through the
 *   view's props), but `Animated.timing(...).start()` moves nothing. That
 *   left the sheet parked at `travel` — exactly one sheet-height BELOW its
 *   resting place, every row present in the a11y tree and none of them on
 *   screen. The drag path already used JS `setValue`, so this also stops the
 *   drag and the settle from fighting over two drivers.
 *
 * Hit-testing / open-race notes:
 * - Fabric + Tamagui XGroup steal the responder without firing onPress, so
 *   this Pressable owns the open gesture and forces pointerEvents="none" on
 *   the trigger tree. Interactive siblings (clear) MUST use `triggerEnd`.
 * - If both this Pressable and a child onPress toggle `open` in the same
 *   gesture, React batches setOpen(true) then setOpen(prev => !prev) → false
 *   and the sheet never appears. Fields should not also toggle open on native.
 * - Opening a Modal under the same finger can synthesize a backdrop press;
 *   backdrop dismiss is armed a short delay after the present begins.
 *
 * ContextMenu (`openOn="contextmenu"`): long-press opens it. On a window wider
 * than OVERLAY_BREAKPOINT (a tablet) it opens at the long-press point, the
 * same free overlay the web draws at the pointer; a phone keeps the sheet,
 * as web does at ≤640.
 */

import { OVERLAY_BREAKPOINT, Surface, useResolvedKnobs } from '@repo/theme';
import { type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  useWindowDimensions,
  View as RNView,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import { View, YStack } from 'tamagui';

import { t } from '../shared/t';
import { useKeyboardInset } from '../shared/useKeyboardInset';

import { placeAtPoint, type PanelBounds, type PanelPoint } from './pointAnchor';
import { panelViewportPadding } from './useFloatingPanel';

import type { FloatingPanelProps } from './index';

// Re-export the hook + constants so Select / Combobox / external consumers
// resolve identically on native (their floating cores are unused on device
// but must still import cleanly).
export {
  useFloatingPanel,
  panelAnimationDuration,
  panelGrowDuration,
  panelTransition,
  panelViewportPadding,
} from './useFloatingPanel';
export type { UseFloatingPanelOptions, UseFloatingPanelReturn } from './useFloatingPanel';
export type { FloatingPanelProps } from './index';
export { floatingPanelActionProps, isNestedPanelAction } from './nestedAction';

/** Native never has a >sm web viewport; AdaptivePopup uses this to pick Sheet mode. */
export function useViewportGtSm() {
  return false;
}

const sheetMaxHeightRatio = 0.85;
// Home-indicator / gesture-bar clearance.
const bottomInset = Platform.OS === 'ios' ? 24 : 16;
// Backdrop left visible above the sheet: the scrim has to stay tappable, and a
// sheet flush with the status bar reads as a page, not a sheet.
const backdropStrip = 48;
// Never collapse to nothing on a landscape phone with the keyboard up.
const minSheetHeight = 180;
// Half-open detent for a sheet that owns a scrollport, as a fraction of its
// full height. The web path hands Tamagui's Sheet [92, 50, 25]; on a phone one
// intermediate stop is the only one worth having.
const mediumDetent = 0.55;
// Released more than this far below the smallest detent, the sheet dismisses.
const dismissThreshold = 56;
// Slide-in, and the delay before a backdrop tap can dismiss.
const enterDuration = 280;

export function FloatingPanel({
  open,
  onOpenChange,
  onNativeShow,
  trigger,
  triggerEnd,
  triggerSizing = 'stretch',
  children,
  scrollable,
  disabled,
  contentPadding = 'default',
  header,
  scrollViewProps,
  triggerA11y,
  sheetFill,
  openOn = 'press',
}: FloatingPanelProps) {
  const { knobProps } = useResolvedKnobs();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // The sheet must end ABOVE the keyboard, not run under it.
  const keyboardInset = useKeyboardInset();
  const safeArea = useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets;
  const topInset = safeArea?.top ?? 0;
  const [pressPoint, setPressPoint] = useState<PanelPoint | null>(null);
  const [backdropArmed, setBackdropArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const handleTriggerPress = useCallback(() => {
    if (!disabled) {
      onOpenChange(!open);
    }
  }, [disabled, onOpenChange, open]);
  const handleTriggerLongPress = useCallback(
    (event?: GestureResponderEvent) => {
      if (disabled) {
        return;
      }
      const { pageX, pageY } = event?.nativeEvent ?? {};
      setPressPoint(typeof pageX === 'number' && typeof pageY === 'number' ? { x: pageX, y: pageY } : null);
      onOpenChange(true);
    },
    [disabled, onOpenChange],
  );
  const isContextMenu = openOn === 'contextmenu';
  const atPoint = isContextMenu && pressPoint !== null && windowWidth > OVERLAY_BREAKPOINT;

  const handleBackdropPress = useCallback(() => {
    if (backdropArmed) {
      close();
    }
  }, [backdropArmed, close]);

  const framePadding = contentPadding === 'none' ? '$0' : knobProps.panelPadding.padding;
  const frameGap = contentPadding === 'none' ? undefined : knobProps.gapLg.gap;
  /*
   * Two numbers, both of which have to know about the keyboard:
   *
   *   - the sheet may never be taller than the space between the status bar
   *     and the keyboard, less a strip of backdrop so it still reads as a sheet
   *     and the scrim stays tappable. Without this the frame extends under the
   *     keyboard, the last row is clipped mid-glyph, and the rounded top edge
   *     is drawn over the autocomplete suggestion strip.
   *   - the bottom padding is home-indicator clearance. The keyboard already
   *     covers the home indicator, so keeping 24pt there just wastes a row.
   */
  const available = Math.max(0, windowHeight - keyboardInset);
  const maxHeight = Math.max(
    minSheetHeight,
    Math.round(Math.min(windowHeight * sheetMaxHeightRatio, available - topInset - backdropStrip)),
  );
  const sheetBottomPadding = keyboardInset > 0 ? 8 : bottomInset;

  /*
   * Drag and detents.
   *
   * The web path hands Tamagui's Sheet `snapPoints={[92, 50, 25]}`. This
   * native path is a hand-rolled RN Modal and never had any of it, so on
   * device the sheet was open-or-closed and the grab handle was decoration.
   *
   * PanResponder, not react-native-gesture-handler: gesture-handler is not a
   * dependency of this package, and inside a core RN `Modal` its gestures
   * need their OWN GestureHandlerRootView within the modal to fire at all.
   * Core PanResponder has neither problem.
   *
   * Geometry: `translateY` measures DOWN from fully-expanded, so 0 is the
   * sheet at full height and `travel` is fully off-screen. A detent is a
   * visible height; its resting translate is `travel - height`.
   */
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const travel = measuredHeight || maxHeight;
  // A content-sized picker has exactly one useful resting height; only a sheet
  // that owns a scrollport can meaningfully sit half-open.
  const isSheet = !!scrollable || !!sheetFill;
  const detents = useMemo(() => {
    if (!isSheet) {
      return [travel];
    }
    const points = [travel, Math.round(travel * mediumDetent)].filter((h) => h >= Math.min(minSheetHeight, travel));
    return Array.from(new Set(points)).sort((a, b) => b - a);
  }, [isSheet, travel]);

  // Start OFF-SCREEN. `0` is "fully expanded", so a 0 default paints the
  // sheet at rest for one frame, then onShow jumps it to `travel` and
  // slides it up — Combobox/Select read as open → closed → open.
  const translateY = useRef(new Animated.Value(10000)).current;
  // The translate the sheet is settled at. Kept in a ref because the pan
  // callbacks are created once and must not close over a stale value.
  const restRef = useRef(10000);
  const travelRef = useRef(travel);
  const detentsRef = useRef(detents);
  travelRef.current = travel;
  detentsRef.current = detents;

  // Async callbacks belong to one committed presentation, never its successor.
  const presentationRef = useRef(0);
  const activeRef = useRef(false);

  /*
   * A sheet at rest below full height is LAID OUT at that height.
   * Translating a full-height frame down pushed its last rows off the screen,
   * or under the keyboard, while the list still measured the full height, so
   * they could never be scrolled into view.
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
        // JS driver: see the header. A native-driven node inside this Modal
        // does not advance, and the drag already writes the value from JS.
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
          // Rubber-band above fully-expanded: an upward drag past the top
          // gives feedback but the sheet cannot leave its own frame.
          translateY.setValue(next < 0 ? next / 3 : next);
        },
        onPanResponderRelease: (_evt, g) => {
          const points = detentsRef.current;
          const t = travelRef.current;
          const current = Math.max(0, restRef.current + g.dy);
          // Project where a flick would carry to, the way a scroll view does,
          // so a fast short flick still changes detent.
          const projected = current + g.vy * 120;
          const smallestRest = t - points[points.length - 1];
          if (projected > smallestRest + dismissThreshold || g.vy > 1.1) {
            dismiss(g.vy);
            return;
          }
          let best = points[0];
          let bestDelta = Number.POSITIVE_INFINITY;
          for (const height of points) {
            const delta = Math.abs(projected - (t - height));
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

  // One entrance per present, whichever trigger gets here first: the effect
  // below (React knows `open` flipped) or Modal.onShow (the platform says the
  // presentation finished). The ref makes the second one a no-op instead of a
  // second slide, and is cleared when the sheet closes.
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
    // One frame + small delay so the opening tap cannot dismiss immediately.
    armTimerRef.current = setTimeout(() => {
      if (activeRef.current && presentation === presentationRef.current) {
        armTimerRef.current = null;
        setBackdropArmed(true);
      }
    }, enterDuration);
    // The modal itself fades (so the backdrop dims IN PLACE) and only
    // the sheet slides, on this transform.
    translateY.setValue(travelRef.current);
    restRef.current = 0;
    Animated.timing(translateY, {
      toValue: 0,
      duration: enterDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      // An interrupted entrance (a drag caught it mid-slide) leaves the pan
      // responder owning the value; only a completed one asserts the rest.
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

  const content = scrollable ? (
    <RNScrollView
      // sheetFill: the list scrollport fills the fixed-height sheet; default:
      // content-sized (flexGrow 0) so small pickers hug their content.
      style={sheetFill ? { flexGrow: 1, flexShrink: 1 } : { flexGrow: 0 }}
      keyboardShouldPersistTaps="handled"
      {...(scrollViewProps as any)}>
      {children}
    </RNScrollView>
  ) : (
    children
  );

  return (
    <>
      <RNView
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: triggerSizing === 'content' ? undefined : '100%',
        }}>
        <Pressable
          {...(isContextMenu
            ? { onLongPress: handleTriggerLongPress, delayLongPress: 500 }
            : { onPress: handleTriggerPress })}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!disabled, expanded: !!open }}
          {...(triggerA11y?.label ? { accessibilityLabel: triggerA11y.label } : undefined)}
          {...(triggerA11y?.value ? { accessibilityValue: { text: triggerA11y.value } } : undefined)}
          {...(triggerA11y?.hint ? { accessibilityHint: triggerA11y.hint } : undefined)}
          // Whole-field triggers stretch; composite adornments hug their
          // content so sibling inputs retain their editable space.
          style={{
            flex: triggerSizing === 'content' ? undefined : 1,
            minWidth: 0,
            alignSelf: 'stretch',
            width: triggerSizing === 'content' ? undefined : '100%',
            opacity: disabled ? 0.5 : 1,
          }}>
          {/* Own the hit target — see file header for why pointerEvents="none". */}
          <RNView
            pointerEvents="none"
            collapsable={false}
            style={{ width: triggerSizing === 'content' ? undefined : '100%' }}>
            {trigger}
          </RNView>
        </Pressable>
        {triggerEnd}
      </RNView>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
        onShow={() => {
          if (!activeRef.current) {
            return;
          }
          enter();
          onNativeShow?.();
        }}>
        {atPoint && pressPoint ? (
          <PointPanel
            key={`${pressPoint.x},${pressPoint.y}`}
            point={pressPoint}
            bounds={{
              top: topInset + panelViewportPadding,
              left: (safeArea?.left ?? 0) + panelViewportPadding,
              right: windowWidth - (safeArea?.right ?? 0) - panelViewportPadding,
              bottom: windowHeight - Math.max(safeArea?.bottom ?? 0, keyboardInset) - panelViewportPadding,
            }}
            framePadding={framePadding}
            frameGap={frameGap}
            onBackdropPress={handleBackdropPress}
            onEscape={close}>
            {header}
            {children}
          </PointPanel>
        ) : (
          /*
          A plain padded column, not KeyboardAvoidingView: inside a Modal the
          latter pads the container while the sheet keeps its own fixed height,
          so the sheet overflows off the TOP instead of shrinking.
        */
          <RNView style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboardInset }}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleBackdropPress}
              accessibilityRole="button"
              accessibilityLabel={t('Close')}>
              <View flex={1} backgroundColor="$shadow6" />
            </Pressable>
            {/*
            Sheet sits above the absoluteFill backdrop in z-order (later sibling).
            Do NOT claim the responder on a wrapper here — that steals presses
            from option rows / calendar days and blocks commit.
          */}
            <Animated.View
              testID="floating-panel-sheet"
              onLayout={(e) => {
                // Travel distance for a dismiss, and the basis for the detents.
                // A content-sized picker is shorter than maxHeight, and sliding
                // it by maxHeight would overshoot into a visible lag.
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
              style={{
                // A flex child defaults to flexShrink 0, so without this
                // the sheet cannot give way to the keyboard at all.
                flexShrink: 1,
                minHeight: 0,
                maxHeight: frameCap,
                transform: [{ translateY }],
              }}>
              <YStack
                {...knobProps.elevatedSurface}
                borderBottomLeftRadius={0}
                borderBottomRightRadius={0}
                maxHeight={maxHeight}
                flexShrink={1}
                minHeight={0}
                // sheetFill opens at full sheet height (flexShrink keeps the
                // keyboard from pushing the top of the sheet off-screen).
                {...(sheetFill ? { height: maxHeight } : undefined)}
                paddingTop="$2"
                paddingBottom={sheetBottomPadding}
                // VoiceOver escape gesture (two-finger Z) dismisses the sheet.
                onAccessibilityEscape={close}>
                {/*
                The grab ZONE, not just the 4pt pill: a 4pt tall target is
                unhittable. The gesture lives here rather than on the whole
                sheet so it never fights the ScrollView inside it, which is the
                same division iOS uses.
              */}
                <RNView
                  {...panResponder.panHandlers}
                  accessibilityRole="adjustable"
                  accessibilityLabel={t('Drag to resize')}
                  style={{
                    alignSelf: 'stretch',
                    alignItems: 'center',
                    paddingTop: 4,
                    paddingBottom: 12,
                  }}>
                  <View width={40} height={4} borderRadius={2} backgroundColor="$color8" />
                </RNView>
                <YStack
                  padding={framePadding}
                  gap={frameGap}
                  flexShrink={1}
                  {...(sheetFill ? { flex: 1, minHeight: 0 } : undefined)}>
                  <Surface size="md">
                    {header}
                    {content}
                  </Surface>
                </YStack>
              </YStack>
            </Animated.View>
          </RNView>
        )}
      </Modal>
    </>
  );
}

/**
 * The menu at the long-press point: measured once per open at its natural
 * size, then placed by the same rule as the web pointer menu. Later layouts
 * are its own capped height and must not re-decide the side it opened on.
 */
function PointPanel({
  point,
  bounds,
  framePadding,
  frameGap,
  onBackdropPress,
  onEscape,
  children,
}: {
  point: PanelPoint;
  bounds: PanelBounds;
  framePadding: string;
  frameGap: string | undefined;
  onBackdropPress: () => void;
  onEscape: () => void;
  children: ReactNode;
}) {
  const { knobProps } = useResolvedKnobs();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const placement = size
    ? placeAtPoint({
        point,
        width: size.width,
        height: size.height,
        bounds,
        rtl: I18nManager.isRTL,
      })
    : null;
  return (
    <RNView style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onBackdropPress}
        accessibilityRole="button"
        accessibilityLabel={t('Close')}
      />
      <RNView
        testID="floating-panel-point"
        onLayout={(e) => {
          if (size) {
            return;
          }
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setSize({ width, height });
          }
        }}
        style={{
          position: 'absolute',
          left: placement?.left ?? bounds.left,
          top: placement?.top ?? bounds.top,
          maxWidth: bounds.right - bounds.left,
          maxHeight: placement?.maxHeight ?? bounds.bottom - bounds.top,
          opacity: placement ? 1 : 0,
        }}>
        <YStack
          {...knobProps.elevatedSurface}
          padding={framePadding}
          gap={frameGap}
          flexShrink={1}
          minHeight={0}
          onAccessibilityEscape={onEscape}>
          <RNScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            {children}
          </RNScrollView>
        </YStack>
      </RNView>
    </RNView>
  );
}
