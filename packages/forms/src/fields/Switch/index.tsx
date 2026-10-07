import {
  useTouchSurface,
  TOUCH_HEIGHT_FLOOR,
  borderRadiusMap,
  contrastRatio,
  ensureFocusVisibleRing,
  normalizeToHex,
  radiusResolutionProps,
  relativeLuminance,
  resolveRadiusClass,
  sizeRecipeForToken,
  useResolvedKnobs,
  wasKeyboardFocus,
  ensureKeyboardModalityTracking,
} from '@repo/theme';
import type { BorderRadius, KnobProps, RadiusResolutionDeclaration } from '@repo/theme';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  SwitchStyledContext,
  Label,
  View,
  XStack,
  createSwitch,
  getFontSize,
  getTokens,
  getVariable,
  getVariableValue,
  isWeb,
  styled,
  useGetThemedIcon,
  useTheme,
  withStaticProperties,
} from 'tamagui';
import type { FontSizeTokens, LabelProps, SizeTokens, SwitchProps as TamaguiSwitchProps } from 'tamagui';

import { commitImmediateField } from '../../ContextualSaveBar/commit-immediate-field';
import { Field, FieldLayout } from '../../FieldLayout';
import { useFormSaveMode } from '../../Form';
import { formCommonColors, formControlColors, formSwitchColors } from '../../shared/color-ramps';
import { pressSlopProps } from '../../shared/press-slop-props';
import { useIsInTableCell } from '../../shared/table-cell-context';
import {
  clampRadiusInStateProps,
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  stripRadiusFromStateProps,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';
import { hasElevationProp, isNumber, isString, themeTokenValue } from '../field-helpers';

import { switchFootprint } from './footprint';
import type { SwitchFootprint } from './footprint';

/** Pointer travel (px) before a gesture counts as thumb-drag instead of click. */
const SWITCH_DRAG_INTENT_PX = 10;

/** Minimum pressable height for the switch inside table cells (SP-FIXED). */
const SWITCH_CELL_TARGET_HEIGHT = 44;

type AnyHandler = NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;

/** A hover/press/focus style bag, as the switch frame accepts it. */
type SwitchStateStyle = NonNullable<TamaguiSwitchProps['hoverStyle']>;

/** The `borderRadius` a consumer may set through `switchProps`: a px number or a radius token. */
type SwitchRadiusProp = TamaguiSwitchProps['borderRadius'];

/** `animation=none` resolves to undefined — do not fall back to `quick`. */
const resolveSwitchMotion = (token: string | undefined) =>
  token !== undefined && token !== '' && token !== 'none' ? token : 'none';

const SWITCH_KB_RING_CSS_ID = 'mp-switch-kb-ring-css';
const SWITCH_KB_RING_CLASS = 'mp-switch-kb-ring';

/** Tamagui compiles focusStyle outlineWidth:0 to `:focus { outline-width:0 !important }`. */
const ensureSwitchKbRingCss = () => {
  if (typeof document === 'undefined') {
    return;
  }
  const css = `:root:root:root:root:root:root:root:root .${SWITCH_KB_RING_CLASS}.${SWITCH_KB_RING_CLASS},:root:root:root:root:root:root:root:root .${SWITCH_KB_RING_CLASS}.${SWITCH_KB_RING_CLASS}:focus,:root:root:root:root:root:root:root:root .${SWITCH_KB_RING_CLASS}.${SWITCH_KB_RING_CLASS}:focus-visible{outline-width:2px!important;outline-style:solid!important;outline-color:var(--outlineColor,var(--c-outlineColor,CanvasText))!important;outline-offset:2px!important}`;
  let tag = document.querySelector<HTMLStyleElement>(`#${SWITCH_KB_RING_CSS_ID}`);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = SWITCH_KB_RING_CSS_ID;
    document.head.append(tag);
  }
  if (tag.textContent !== css) {
    tag.textContent = css;
  }
};

/** Hover/press/focus knobs must not smuggle a second outline channel. */
const stripOutlineFromState = (props?: SwitchStateStyle): SwitchStateStyle | undefined => {
  if (!props) {
    return undefined;
  }
  const rest = { ...props };
  delete rest.outlineWidth;
  delete rest.outlineStyle;
  delete rest.outlineColor;
  delete rest.outlineOffset;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

// ─── Switch internals ─────────────────────────────────────────────────────────

/**
 * The painted track is `switchFootprint` of the recipe height, never
 * the recipe height itself. The styled fallbacks assume the 1px hairline
 * track border; the component passes exact frameProps with the live knob
 * borderWidth. The 44 press floor lands on the PRESSABLE frame (grown-target
 * mode on touch and in cells, press slop on a fine pointer), never on paint.
 */
const SWITCH_TRACK_BORDER_FALLBACK = 1;

const resolveRadiusValue = (radius: SwitchRadiusProp): number | undefined => {
  if (isNumber(radius)) {
    return radius;
  }
  if (!isString(radius)) {
    return undefined;
  }

  const radiusToken: unknown = Object.entries(getTokens().radius).find(([name]) => name === radius)?.[1];
  const resolved: unknown = getVariableValue(radiusToken ?? radius);
  if (isNumber(resolved) && Number.isFinite(resolved)) {
    return resolved;
  }

  // oxlint-disable-next-line unicorn/prefer-number-coercion -- token values may carry a unit suffix (e.g. "8px"), which Number() would turn into NaN
  const parsed = Number.parseFloat(String(resolved));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const radiusStopFromToken = (token: string): BorderRadius | undefined => {
  // SAFETY: borderRadiusMap is keyed exactly by the BorderRadius stops.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys widens the stop keys to string
  for (const stop of Object.keys(borderRadiusMap) as BorderRadius[]) {
    if (borderRadiusMap[stop] === token) {
      return stop;
    }
  }
  return undefined;
};

/** `pointy` forces the none stop; otherwise invert the resolved radius token. */
const resolveSwitchRadiusStop = (radiusToken: string, pointy = false): BorderRadius => {
  if (pointy) {
    return 'none';
  }
  const stop = radiusStopFromToken(radiusToken);
  if (!stop) {
    throw new Error(`Switch: "${radiusToken}" is not a borderRadiusMap token; cannot resolve BINARY`);
  }
  return stop;
};

/**
 * Rewrite a state bag's radius to the BINARY row (0 or h/2).
 *
 * Delegates to the shared `clampRadiusInStateProps`, which reads the
 * doctrine-GENERATED table through `resolveRadiusClass`. Switch used to carry its own copy of this walk; a
 * second copy is how a radius edit reaches the base radius and silently
 * misses every hover/press/focus bag. The only thing left here is the
 * empty-bag convention the JSX below needs: `hoverStyle={undefined}` rather
 * than `hoverStyle={{}}`.
 */
const withBinaryStateRadius = (
  stateProps: SwitchStateStyle | undefined,
  heightPx: number,
): SwitchStateStyle | undefined => {
  if (!stateProps) {
    return undefined;
  }
  const next = clampRadiusInStateProps(stateProps, { radiusClass: 'BINARY', heightPx });
  return next && Object.keys(next).length > 0 ? next : undefined;
};

const SwitchThumbStyled = styled(View, {
  name: 'SwitchThumb',
  transition: 'quick',

  variants: {
    unstyled: {
      false: {
        size: '$true',
        backgroundColor: formSwitchColors.thumb,
        // The thumb is a solid physical handle — it gets its definition from a
        // subtle drop shadow (iOS/Material convention), NOT a flat gray ring.
        // A visible border reads as an outline/defect; the shadow lifts the
        // thumb off the track on every side and survives light-thumb-on-light-
        // track without a hard edge.
        borderWidth: 0,
        borderRadius: 1000,
        justifyContent: 'center',
        alignItems: 'center',
        ...(isWeb
          ? { boxShadow: '0 1px 2px rgba(0,0,0,0.18), 0 0 1px rgba(0,0,0,0.12)' }
          : {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.15,
              shadowRadius: 2,
              elevation: 2,
            }),
      },
    },

    checked: {
      true: {},
    },

    size: {
      '...size': (val) => {
        const { thumbSize } = switchFootprint(String(val), SWITCH_TRACK_BORDER_FALLBACK);
        return { height: thumbSize, width: thumbSize };
      },
    },
  } as const,

  defaultVariants: {
    unstyled: process.env.TAMAGUI_HEADLESS === '1',
  },
});

const SwitchFrameStyled = styled(View, {
  name: 'Switch',
  render: 'button',

  variants: {
    unstyled: {
      false: {
        position: 'relative',
        borderRadius: 1000,
        backgroundColor: formSwitchColors.track.off,
        borderWidth: 1,
        // Off track: muted fill + ≥3:1 boundary (M3 unselected outline).
        // On track is fill — see `checked` / `activeStyle`.
        borderColor: formControlColors.boundary,
        outlineWidth: 0,
        focusStyle: { outlineWidth: 0 },
        // Ring is painted from keyboard modality on the track, never
        // via :focus-visible (mouse click on a <button> can still ring).
        focusVisibleStyle: { outlineWidth: 0 },
      },
    },

    checked: {
      true: {
        backgroundColor: formSwitchColors.track.on,
        borderColor: formSwitchColors.track.on,
      },
      false: {
        backgroundColor: formSwitchColors.track.off,
        borderColor: formControlColors.boundary,
      },
    },

    size: {
      '...size': (val) => {
        const { trackHeight, trackWidth } = switchFootprint(String(val), SWITCH_TRACK_BORDER_FALLBACK);
        return { height: trackHeight, minHeight: trackHeight, width: trackWidth };
      },
    },
  } as const,

  defaultVariants: {
    unstyled: process.env.TAMAGUI_HEADLESS === '1',
  },
});

const isSizeToken = (value: unknown): value is string | number => isString(value) || isNumber(value);

/** Icon inset from the track edge: 35% of the size token's space step, or 4 when the token has none. */
const iconInset = (space: Record<string, { val: unknown }>, size: string | number | undefined): number => {
  const step = space[String(size)]?.val;
  return isNumber(step) ? step * 0.35 || 4 : 4;
};

const SwitchIconFrame = styled(View, {
  position: 'absolute',
  context: SwitchStyledContext,
  height: '100%',
  justifyContent: 'center',
  alignItems: 'center',
  variants: {
    placement: {
      right: (_, { props, tokens }) => ({
        right: iconInset(tokens.space, 'size' in props && isSizeToken(props.size) ? props.size : undefined),
      }),
      left: (_, { props, tokens }) => ({
        left: iconInset(tokens.space, 'size' in props && isSizeToken(props.size) ? props.size : undefined),
      }),
    },
    size: { '...size': () => ({}) },
  } as const,
  defaultVariants: { placement: 'right' },
});

const getIconSize = (size: FontSizeTokens, scale: number) => (isNumber(size) ? size * 0.5 : getFontSize(size)) * scale;

const SwitchIcon = SwitchIconFrame.styleable<{
  scaleIcon?: number;
  color?: string;
  placement?: 'left' | 'right';
}>((iconProps, ref) => {
  const { color: colorProp, scaleIcon = 1.2, ...props } = iconProps;
  const { size } = SwitchStyledContext.useStyledContext();

  const theme = useTheme();
  const resolvedColor: unknown = getVariable(
    colorProp !== undefined && colorProp !== '' ? colorProp : theme.color10?.get('web'),
  );
  const color = isString(resolvedColor) ? resolvedColor : undefined;
  // SAFETY: the switch context carries a size token, and size tokens share the `$n` scale of the font-size tokens.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SizeTokens and FontSizeTokens are distinct generated unions over the same scale
  const iconSize = getIconSize(size as FontSizeTokens, scaleIcon);

  const getThemedIcon = useGetThemedIcon({ size: iconSize, color });
  return (
    <SwitchIconFrame
      ref={ref}
      {...props}>
      {getThemedIcon(props.children)}
    </SwitchIconFrame>
  );
});

const SwitchComp = createSwitch({
  Frame: SwitchFrameStyled,
  Thumb: SwitchThumbStyled,
});

const StyledSwitch = withStaticProperties(SwitchComp, {
  Icon: SwitchIcon,
});

// ─── Thumb drag (Tamagui Switch is click-only) ─────────────────────────────────
//
// createSwitch toggles on press only — `Switch.draggable-tmp` in @tamagui/switch
// is unfinished. We own thumb `x` + press+drag so the knob can be dragged on/off
// while click/toggle and pointy radius stay intact.

interface SwitchDragSession {
  pointerId: number;
  startX: number;
  originChecked: boolean;
  moved: boolean;
}

const noCleanup = (): void => undefined;

/** Pointer-drag state for the thumb: live offset, the snapped value awaiting the controlled prop, and click suppression. */
const useSwitchDrag = ({
  checked,
  dragDistance,
  onCheckedChange,
}: {
  checked: boolean;
  dragDistance: number;
  onCheckedChange?: (checked: boolean) => void;
}) => {
  const [dragX, setDragX] = useState<number | null>(null);
  // Hold snapped thumb until the controlled `checked` prop catches up (avoids flash).
  const [snapChecked, setSnapChecked] = useState<boolean | null>(null);
  const sessionRef = useRef<SwitchDragSession | null>(null);
  const suppressClickToggleRef = useRef(false);
  const checkedRef = useRef(checked);
  const dragDistanceRef = useRef(dragDistance);
  const onCheckedChangeRef = useRef(onCheckedChange);

  useLayoutEffect(() => {
    checkedRef.current = checked;
    dragDistanceRef.current = dragDistance;
    onCheckedChangeRef.current = onCheckedChange;
  });

  // The controlled prop caught up with the snapped value: release the hold.
  if (snapChecked !== null && checked === snapChecked) {
    setSnapChecked(null);
  }

  useEffect(() => {
    if (!isWeb) {
      return noCleanup;
    }

    const onMove = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) {
        return;
      }
      const dist = dragDistanceRef.current;
      const originX = session.originChecked ? dist : 0;
      const nextX = Math.max(0, Math.min(dist, originX + (e.clientX - session.startX)));
      if (Math.abs(e.clientX - session.startX) >= SWITCH_DRAG_INTENT_PX) {
        session.moved = true;
      }
      // Only track dragX after drag intent: setting it earlier snaps the thumb
      // to the origin endpoint and kills the transition, teleporting any
      // in-flight toggle animation (interruptibility).
      if (session.moved) {
        setDragX(nextX);
      }
    };

    const endDrag = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) {
        return;
      }
      const dist = dragDistanceRef.current;
      const originX = session.originChecked ? dist : 0;
      const nextX = Math.max(0, Math.min(dist, originX + (e.clientX - session.startX)));
      sessionRef.current = null;

      if (!session.moved) {
        setDragX(null);
        return;
      }

      // Intentional drag: snap by midpoint and block the click toggle that follows.
      suppressClickToggleRef.current = true;
      const nextChecked = nextX >= dist / 2;
      setDragX(null);
      if (nextChecked !== checkedRef.current) {
        setSnapChecked(nextChecked);
        onCheckedChangeRef.current?.(nextChecked);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
    };
  }, []);

  const startDrag = (pointerId: number, startX: number) => {
    sessionRef.current = {
      pointerId,
      startX,
      originChecked: checkedRef.current,
      moved: false,
    };
    setSnapChecked(null);
    // Do NOT setDragX here — dragX starts only once drag intent is
    // confirmed in onMove, so a plain click (or mid-flight retarget)
    // never freezes/teleports the thumb.
  };

  /** True once after an intentional drag: the click toggle that follows it must be ignored. */
  const consumeClickSuppression = (): boolean => {
    if (!suppressClickToggleRef.current) {
      return false;
    }
    suppressClickToggleRef.current = false;
    return true;
  };

  return { dragX, snapChecked, startDrag, consumeClickSuppression };
};

const applyKeyboardRing = (node: HTMLElement | null, on: boolean) => {
  if (!node?.style) {
    return;
  }
  if (on) {
    node.style.setProperty('outline-width', '2px', 'important');
    node.style.setProperty('outline-style', 'solid', 'important');
    node.style.setProperty('outline-color', 'var(--outlineColor, var(--c-outlineColor, CanvasText))', 'important');
    node.style.setProperty('outline-offset', '2px', 'important');
  } else {
    node.style.removeProperty('outline-width');
    node.style.removeProperty('outline-style');
    node.style.removeProperty('outline-color');
    node.style.removeProperty('outline-offset');
  }
};

/** Paints the keyboard-modality ring on the frame, or on the inner track in grown-target mode. */
const useKeyboardRing = (id: string, kbFocus: boolean, cellTrack: SwitchCellTrack | undefined) => {
  useLayoutEffect(() => {
    if (!isWeb) {
      return;
    }
    const el = document.querySelector<HTMLElement>(`[id="${id}"]`);
    if (!el) {
      return;
    }
    applyKeyboardRing(el, kbFocus && !cellTrack);
    applyKeyboardRing(el.querySelector<HTMLElement>(`.${SWITCH_KB_RING_CLASS}`), kbFocus && !!cellTrack);
  }, [kbFocus, cellTrack, id]);
};

/**
 * The handle color is luminance-COMPUTED from the actual
 * track fill, never assumed from a scheme token. The thumb's styled token
 * (`formSwitchColors.thumb`) resolves through the inverted sub-theme tamagui
 * applies to switch thumbs, landing on scheme ink — measured 2.59:1 against
 * the checked accent track in light (non-text state floor is 3:1), and
 * flipping thumb polarity across schemes for no semantic reason. Candidates
 * are the scheme's paper (color1) and ink (color12) anchors; whichever
 * carries more contrast on the fill the thumb is riding wins. Returned as a
 * concrete resolved value so no sub-theme can flip it; returns undefined
 * (keep the styled default) when any color fails to parse.
 */
const useLuminanceThumbColor = (displayChecked: boolean): string | undefined => {
  const theme = useTheme();
  const trackToken = (displayChecked ? formSwitchColors.track.on : formSwitchColors.track.off).slice(1);
  const trackRaw = themeTokenValue(theme, trackToken) ?? '';
  const paperRaw = String(theme.color1?.val ?? '');
  const inkRaw = String(theme.color12?.val ?? '');
  const track = trackRaw === '' ? null : normalizeToHex(trackRaw);
  const paper = paperRaw === '' ? null : normalizeToHex(paperRaw);
  const ink = inkRaw === '' ? null : normalizeToHex(inkRaw);
  if (track === null || paper === null || ink === null) {
    return undefined;
  }
  const trackLum = relativeLuminance(track);
  return contrastRatio(relativeLuminance(paper), trackLum) >= contrastRatio(relativeLuminance(ink), trackLum)
    ? paperRaw
    : inkRaw;
};

/** Radius override applied to the grown-target cell track's hover/press/focus bags. */
interface CellTrackRadiusStyle {
  borderRadius: number;
}

/**
 * Grown-target mode (SP-FIXED): when set, the role=switch frame is a
 * `frameHeight`-tall transparent target (44px in table cells) and the
 * visible track renders as this inner view, so the touch target grows
 * without changing the track's visual size.
 */
interface SwitchCellTrack {
  height: number;
  borderRadius: number;
  borderWidth: number;
  frameHeight: number;
  hoverStyle?: CellTrackRadiusStyle;
  pressStyle?: CellTrackRadiusStyle;
  focusStyle?: CellTrackRadiusStyle;
}

interface SwitchControlProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onBlur?: AnyHandler;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  hasError?: boolean;
  id: string;
  sizeToken: SizeTokens;
  footprint: SwitchFootprint;
  thumbRadius: number;
  transition?: string;
  frameProps: SwitchFrameProps;
  switchProps?: Omit<TamaguiSwitchProps, 'checked' | 'defaultChecked' | 'id' | 'onCheckedChange' | 'children'>;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  inputSurface?: KnobProps['inputSurface'];
  hoverStyle?: SwitchStateStyle;
  pressStyle?: SwitchStateStyle;
  focusStyle?: SwitchStateStyle;
  focusVisibleStyle?: SwitchStateStyle;
  thumbHoverStyle?: SwitchStateStyle;
  thumbPressStyle?: SwitchStateStyle;
  thumbFocusStyle?: SwitchStateStyle;
  /** Native VoiceOver/TalkBack name (label text) — htmlFor is web-only. */
  accessibilityLabel?: string;
  /** Native VoiceOver/TalkBack hint (error or helper text). */
  accessibilityHint?: string;
  /** Web accessible name — forwarded to the role="switch" node. */
  ariaLabel?: string;
  /** Web external labeling element id — forwarded to the role="switch" node. */
  ariaLabelledBy?: string;
  cellTrack?: SwitchCellTrack;
  /** BINARY declaration for the thumb and the cell track; absent under a radius override. */
  radiusResolution?: RadiusResolutionDeclaration;
}

/** The on-fill / off-fill paint of the track for a checked state. */
const trackPaint = (checked: boolean, offFill: string) =>
  checked
    ? { backgroundColor: formSwitchColors.track.on, borderColor: formSwitchColors.track.on }
    : { backgroundColor: offFill, borderColor: formControlColors.boundary };

/** The hover/press/focus bags of the frame, with the outline channel stripped (the keyboard ring owns it). */
const frameStateProps = ({
  hoverStyle,
  pressStyle,
  focusStyle,
}: {
  hoverStyle?: SwitchStateStyle;
  pressStyle?: SwitchStateStyle;
  focusStyle?: SwitchStateStyle;
}) => {
  const hoverSafe = stripOutlineFromState(hoverStyle);
  const pressSafe = stripOutlineFromState(pressStyle);
  const focusSafe = stripOutlineFromState(focusStyle);
  return {
    ...(hoverSafe && { hoverStyle: hoverSafe }),
    ...(pressSafe && { pressStyle: pressSafe }),
    ...(focusSafe && { focusStyle: { ...focusSafe } }),
  };
};

const thumbStateProps = ({
  thumbHoverStyle,
  thumbPressStyle,
  thumbFocusStyle,
}: {
  thumbHoverStyle?: SwitchStateStyle;
  thumbPressStyle?: SwitchStateStyle;
  thumbFocusStyle?: SwitchStateStyle;
}) => ({
  ...(thumbHoverStyle && { hoverStyle: thumbHoverStyle }),
  ...(thumbPressStyle && { pressStyle: thumbPressStyle }),
  ...(thumbFocusStyle && { focusStyle: thumbFocusStyle }),
});

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

/** iOS: bare styled Views are not accessibility elements — without these the switch is invisible to VoiceOver. */
const nativeAccessibilityProps = ({
  disabled,
  checked,
  label,
  hint,
}: {
  disabled?: boolean;
  checked: boolean;
  label?: string;
  hint?: string;
}) =>
  isWeb
    ? undefined
    : {
        accessible: true,
        accessibilityRole: 'switch' as const,
        accessibilityState: { disabled: disabled === true, checked },
        ...(hasText(label) ? { accessibilityLabel: label } : undefined),
        ...(hasText(hint) ? { accessibilityHint: hint } : undefined),
      };

const joinClassNames = (...names: (string | undefined)[]): string | undefined => {
  const present = names.filter(hasText);
  return present.length > 0 ? present.join(' ') : undefined;
};

/** The painted track in grown-target mode: the frame is a transparent target, this is what the eye sees. */
const CellTrackOverlay = ({
  cellTrack,
  displayChecked,
  trackOffFill,
  motion,
  kbFocus,
  radiusResolution,
}: {
  cellTrack: SwitchCellTrack;
  displayChecked: boolean;
  trackOffFill: string;
  motion: string;
  kbFocus: boolean;
  radiusResolution?: RadiusResolutionDeclaration;
}) => (
  <View
    position="absolute"
    left={0}
    right={0}
    top="50%"
    y={-cellTrack.height / 2}
    height={cellTrack.height}
    borderRadius={cellTrack.borderRadius}
    {...radiusResolution}
    borderWidth={cellTrack.borderWidth}
    {...trackPaint(displayChecked, trackOffFill)}
    transition={motion}
    pointerEvents="none"
    className={kbFocus ? SWITCH_KB_RING_CLASS : undefined}
    {...(kbFocus ? ensureFocusVisibleRing() : { outlineWidth: 0 })}
    {...(cellTrack.hoverStyle && { hoverStyle: cellTrack.hoverStyle })}
    {...(cellTrack.pressStyle && { pressStyle: cellTrack.pressStyle })}
    {...(cellTrack.focusStyle && { focusStyle: cellTrack.focusStyle })}
  />
);

/** `switchProps` minus the handlers and class the control layers over (it calls the consumer's own). */
const withoutOwnedHandlers = (switchProps: SwitchControlProps['switchProps']) => {
  const rest = { ...switchProps };
  delete rest.onPointerDown;
  delete rest.onFocus;
  delete rest.onBlur;
  delete rest.className;
  return rest;
};

/** Keyboard-ring decoration of the frame: the data flag, the ring class and the outline channel. */
const keyboardFrameProps = ({
  kbFocus,
  cellTrack,
  switchClassName,
}: {
  kbFocus: boolean;
  cellTrack: SwitchCellTrack | undefined;
  switchClassName: string | undefined;
}) => {
  const className = joinClassNames(switchClassName, kbFocus && !cellTrack ? SWITCH_KB_RING_CLASS : undefined);
  return {
    ...(kbFocus ? { 'data-kb-focus': 'true' } : undefined),
    ...(className === undefined ? undefined : { className }),
    ...(cellTrack || !kbFocus ? { outlineWidth: 0 } : ensureFocusVisibleRing()),
  };
};

/** Dedicated aria props land AFTER `switchProps` so they win over the legacy escape hatch. */
const frameAriaProps = ({
  ariaLabel,
  ariaLabelledBy,
  required,
  hasError,
  readOnly,
}: {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  required?: boolean;
  hasError?: boolean;
  readOnly?: boolean;
}) => ({
  ...(readOnly ? { pointerEvents: 'none' as const, 'aria-readonly': true } : undefined),
  ...(hasText(ariaLabel) ? { 'aria-label': ariaLabel } : undefined),
  ...(hasText(ariaLabelledBy) ? { 'aria-labelledby': ariaLabelledBy } : undefined),
  'aria-required': required ? true : undefined,
  'aria-invalid': hasError ? true : undefined,
});

/** Own thumb position so a drag can override Tamagui's initialChecked alignSelf/x math. */
const thumbPlacement = ({
  thumbX,
  thumbInset,
  thumbSize,
  cellTrack,
}: {
  thumbX: number;
  thumbInset: number;
  thumbSize: number;
  cellTrack: SwitchCellTrack | undefined;
}) => ({
  x: thumbX + thumbInset + (cellTrack ? cellTrack.borderWidth : 0),
  y: cellTrack ? (cellTrack.frameHeight - thumbSize) / 2 : thumbInset,
});

const isBlankNode = (node: ReactNode): boolean => node === undefined || node === null || node === false || node === '';

const OptionalSwitchIcon = ({ placement, icon }: { placement: 'left' | 'right'; icon: ReactNode }) =>
  isBlankNode(icon) ? null : <StyledSwitch.Icon placement={placement}>{icon}</StyledSwitch.Icon>;

type SwitchEventProps = Pick<
  ComponentProps<typeof StyledSwitch>,
  'onFocus' | 'onBlur' | 'onCheckedChange' | 'onPointerDown'
>;

/** Focus, blur, toggle and pointer handlers of the frame, layered over the consumer's `switchProps` handlers. */
const useSwitchEventProps = ({
  switchProps,
  onBlur,
  onCheckedChange,
  disabled,
  readOnly,
  setKbFocus,
  consumeClickSuppression,
  startDrag,
}: {
  switchProps: SwitchControlProps['switchProps'];
  onBlur: AnyHandler | undefined;
  onCheckedChange: ((checked: boolean) => void) | undefined;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  setKbFocus: (focused: boolean) => void;
  consumeClickSuppression: () => boolean;
  startDrag: (pointerId: number, startX: number) => void;
}): SwitchEventProps => {
  const canDrag = isWeb && !disabled && !readOnly;
  return {
    onFocus: (e) => {
      switchProps?.onFocus?.(e);
      if (wasKeyboardFocus()) {
        setKbFocus(true);
      }
    },
    onBlur: (e) => {
      setKbFocus(false);
      switchProps?.onBlur?.(e);
      onBlur?.(e);
    },
    onCheckedChange: (val) => {
      if (disabled || readOnly) {
        return;
      }
      // After a drag, Tamagui still fires press→toggle; ignore that flip.
      if (consumeClickSuppression()) {
        return;
      }
      onCheckedChange?.(val);
    },
    onPointerDown: (e) => {
      switchProps?.onPointerDown?.(e);
      if (!canDrag || (isNumber(e.button) && e.button !== 0)) {
        return;
      }
      startDrag(e.pointerId ?? 0, e.clientX);
    },
  };
};

const SwitchControl = ({
  checked,
  onCheckedChange,
  onBlur,
  disabled,
  readOnly,
  required,
  hasError,
  id,
  sizeToken,
  footprint,
  thumbRadius,
  transition,
  frameProps,
  switchProps,
  leftIcon,
  rightIcon,
  inputSurface,
  hoverStyle,
  pressStyle,
  focusStyle,
  focusVisibleStyle: _focusVisibleStyle,
  thumbHoverStyle,
  thumbPressStyle,
  thumbFocusStyle,
  accessibilityLabel,
  accessibilityHint,
  ariaLabel,
  ariaLabelledBy,
  cellTrack,
  radiusResolution,
}: SwitchControlProps) => {
  if (isWeb) {
    ensureKeyboardModalityTracking();
    ensureSwitchKbRingCss();
  }
  const { disabledState, knobProps } = useResolvedKnobs();
  const trackOffFill = knobProps.outlined ? 'transparent' : formSwitchColors.track.off;
  const { thumbInset, thumbSize, travel: dragDistance } = footprint;
  const motion = resolveSwitchMotion(transition);
  const { dragX, snapChecked, startDrag, consumeClickSuppression } = useSwitchDrag({
    checked,
    dragDistance,
    onCheckedChange,
  });
  const displayChecked = snapChecked ?? checked;
  const thumbHandleColor = useLuminanceThumbColor(displayChecked);
  const [kbFocus, setKbFocus] = useState(false);
  useKeyboardRing(id, kbFocus, cellTrack);
  const eventProps = useSwitchEventProps({
    switchProps,
    onBlur,
    onCheckedChange,
    disabled,
    readOnly,
    setKbFocus,
    consumeClickSuppression,
    startDrag,
  });
  const restSwitchProps = withoutOwnedHandlers(switchProps);
  const restingX = displayChecked ? dragDistance : 0;

  return (
    <StyledSwitch
      {...inputSurface}
      transition={motion}
      size={sizeToken}
      {...frameStateProps({ hoverStyle, pressStyle, focusStyle })}
      focusVisibleStyle={{ outlineWidth: 0 }}
      // createSwitch applies `activeStyle` last when checked — that is the
      // ON=fill channel, not CSS :active.
      activeStyle={{
        backgroundColor: formSwitchColors.track.on,
        borderColor: formSwitchColors.track.on,
      }}
      // Disabled-visible: the track is text-free control
      // chrome — under `keepLabel` it opacity-dims via the resolved recipe
      // while the sibling label/helper stay readable; `dimWhole` leaves the
      // single dim to the FieldLayout assembly.
      {...(disabled ? disabledState.chromeKnobProps : undefined)}
      {...frameProps}
      {...restSwitchProps}
      disabled={disabled}
      id={id}
      checked={checked}
      {...(cellTrack ? undefined : trackPaint(displayChecked, trackOffFill))}
      {...keyboardFrameProps({ kbFocus, cellTrack, switchClassName: switchProps?.className })}
      {...nativeAccessibilityProps({
        disabled,
        checked,
        label: accessibilityLabel,
        hint: accessibilityHint,
      })}
      {...frameAriaProps({ ariaLabel, ariaLabelledBy, required, hasError, readOnly })}
      {...eventProps}>
      {cellTrack ? (
        <CellTrackOverlay
          cellTrack={cellTrack}
          displayChecked={displayChecked}
          trackOffFill={trackOffFill}
          motion={motion}
          kbFocus={kbFocus}
          radiusResolution={radiusResolution}
        />
      ) : null}
      <OptionalSwitchIcon
        placement="left"
        icon={leftIcon}
      />
      <OptionalSwitchIcon
        placement="right"
        icon={rightIcon}
      />
      <StyledSwitch.Thumb
        borderRadius={thumbRadius}
        {...radiusResolution}
        width={thumbSize}
        height={thumbSize}
        {...thumbPlacement({ thumbX: dragX ?? restingX, thumbInset, thumbSize, cellTrack })}
        alignSelf="flex-start"
        {...(hasText(thumbHandleColor) ? { backgroundColor: thumbHandleColor } : undefined)}
        transition={dragX === null ? motion : 'none'}
        {...thumbStateProps({ thumbHoverStyle, thumbPressStyle, thumbFocusStyle })}
      />
    </StyledSwitch>
  );
};

// ─── Form-aware Switch ────────────────────────────────────────────────────────

export interface SwitchProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Parameters<typeof useResolvedValidators>[1];
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  checked?: boolean;
  defaultValue?: boolean;
  /**
   * Canonical change handler, consistent with the rest of the field family
   * (Input/Select/Checkbox all use `onChange`). Prefer this. `onCheckedChange`
   * is kept as an alias for callers used to the tamagui/Radix name.
   */
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
  onBlur?: AnyHandler;
  /**
   * Accessible name for the role="switch" control — use when there is no
   * visible `label` (icon-only / externally-labeled toggles). Forwarded to
   * the rendered switch node (web) and VoiceOver/TalkBack name (native).
   */
  'aria-label'?: string;
  /** Id of an external element that labels the switch (web). */
  'aria-labelledby'?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  switchProps?: Omit<TamaguiSwitchProps, 'checked' | 'defaultChecked' | 'id' | 'onCheckedChange' | 'children'>;
  /** Force hard-angled switch. Defaults to `true` when the theme knob `borderRadius` is `"none"`. */
  pointy?: boolean;
  /** When true, renders a skeleton placeholder instead of the switch */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
  /**
   * Touch-target floor (SP-FIXED): grows the pressable role=switch frame to
   * at least this many px (invisible — the visible track keeps its normal
   * size, centered inside), the same mechanism table cells use at 44px.
   * Dense toggle lists pass 44 so every toggle is individually hittable.
   */
  minTargetHeight?: number;
}

/** Pressable-frame height: cells always grow to 44, a `minTargetHeight` floors the track, touch lifts short tracks. */
const resolveTargetHeight = ({
  inTableCell,
  minTargetHeight,
  hydrationTouch,
  trackHeight,
}: {
  inTableCell: boolean;
  minTargetHeight: number | undefined;
  hydrationTouch: boolean;
  trackHeight: number;
}): number | undefined => {
  if (inTableCell) {
    return SWITCH_CELL_TARGET_HEIGHT;
  }
  if (minTargetHeight !== undefined) {
    return Math.max(minTargetHeight, trackHeight);
  }
  return hydrationTouch && trackHeight < TOUCH_HEIGHT_FLOOR ? TOUCH_HEIGHT_FLOOR : undefined;
};

/** An error prop is set when it is a non-empty message or `true`. */
const isErrorValue = (value: string | boolean | undefined): boolean =>
  value !== undefined && value !== false && value !== '';

/** Keeps a state bag's radius only as a px number: the grown-target cell track paints its own corners. */
const cellTrackRadiusStyle = (state?: SwitchStateStyle): CellTrackRadiusStyle | undefined => {
  const radius = state?.borderRadius;
  return isNumber(radius) ? { borderRadius: radius } : undefined;
};

/** Just the radius of a state bag, for the thumb. */
const radiusOnly = (state: SwitchStateStyle | undefined): SwitchStateStyle | undefined =>
  state?.borderRadius == null ? undefined : { borderRadius: state.borderRadius };

/**
 * Hover/press/focus bags for the track and thumb. Without a radius override the
 * track and thumb ride the BINARY row; with one, the consumer's radius wins and
 * the knob radius is stripped from the track bags.
 */
const resolveSwitchStateStyles = ({
  control,
  hasRadiusOverride,
  trackHeight,
  thumbHeight,
}: {
  control: ReturnType<typeof useFormField>['control'];
  hasRadiusOverride: boolean;
  trackHeight: number;
  thumbHeight: number;
}) => {
  const hoverRaw = stripOutlineFromState(control.hoverKnobProps);
  const pressRaw = stripOutlineFromState(control.pressKnobProps);
  const focusRaw = stripOutlineFromState(control.focusKnobProps);
  const forTrack = (raw: SwitchStateStyle | undefined) =>
    hasRadiusOverride ? stripRadiusFromStateProps(raw) : withBinaryStateRadius(raw, trackHeight);
  const forThumb = (raw: SwitchStateStyle | undefined) =>
    withBinaryStateRadius(hasRadiusOverride ? undefined : radiusOnly(raw), thumbHeight);
  return {
    trackHover: forTrack(hoverRaw),
    trackPress: forTrack(pressRaw),
    trackFocus: forTrack(focusRaw),
    thumbHover: forThumb(hoverRaw),
    thumbPress: forThumb(pressRaw),
    thumbFocus: forThumb(focusRaw),
  };
};

/** Pressable frame geometry; in grown-target mode the frame is a transparent `targetHeight` slab. */
const buildFrameProps = ({
  borderRadius,
  trackHeight,
  trackWidth,
  targetHeight,
  switchChecked,
  outlined,
  radiusResolution,
}: {
  borderRadius: SwitchRadiusProp | number;
  trackHeight: number;
  trackWidth: number;
  targetHeight: number | undefined;
  switchChecked: boolean;
  outlined: boolean;
  radiusResolution?: RadiusResolutionDeclaration;
}) => {
  const grownTarget = targetHeight !== undefined;
  const base = {
    borderRadius,
    height: trackHeight,
    minHeight: trackHeight,
    width: trackWidth,
    ...pressSlopProps(trackHeight, !grownTarget, trackWidth >= TOUCH_HEIGHT_FLOOR ? 'vertical' : 'both'),
  };
  // Grown-target mode (SP-FIXED): grow the pressable frame (44px in cells,
  // `minTargetHeight` floor standalone) and strip its chrome; the visible
  // track renders inside SwitchControl at its normal size, so visual
  // density is unchanged. Thumb and track stay one BINARY member
  // — both resolve through resolveRadiusClass.
  if (grownTarget) {
    return {
      ...base,
      height: targetHeight,
      minHeight: targetHeight,
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      // createSwitch spreads activeStyle last when checked — keep the
      // (invisible) grown frame transparent in the checked state too.
      activeStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
    };
  }
  return {
    ...base,
    ...radiusResolution,
    ...trackPaint(switchChecked, outlined ? 'transparent' : formSwitchColors.track.off),
  };
};

type SwitchFrameProps = ReturnType<typeof buildFrameProps>;

/** Checked tracks keep the accent FILL through hover/press/focus — see the notes on `stateBorderColor`. */
const trackStateProps = (
  styles: ReturnType<typeof resolveSwitchStateStyles>,
  switchChecked: boolean,
): Pick<SwitchControlProps, 'hoverStyle' | 'pressStyle' | 'focusStyle'> => {
  // Checked tracks keep the accent FILL through hover/press/focus — the
  // control knobs' neutral state-layer ($backgroundHover/$backgroundPress)
  // must never paint over the active accent track (on=fill).
  const stateBorderColor = switchChecked ? formSwitchColors.track.on : formControlColors.boundary;
  const checkedTrackFill = switchChecked
    ? {
        backgroundColor: formSwitchColors.track.on,
        borderColor: formSwitchColors.track.on,
      }
    : undefined;
  const { trackHover, trackPress, trackFocus } = styles;
  return {
    ...(trackHover && { hoverStyle: { ...trackHover, borderColor: stateBorderColor, ...checkedTrackFill } }),
    ...(trackPress && { pressStyle: { ...trackPress, borderColor: stateBorderColor, ...checkedTrackFill } }),
    ...(trackFocus && {
      focusStyle: {
        outlineWidth: 0,
        ...trackFocus,
        borderColor: stateBorderColor,
        ...checkedTrackFill,
      },
    }),
  };
};

const SwitchLabel = ({
  id,
  size,
  label,
  required,
  color,
  stateColor,
  knobProps,
  text,
  labelProps,
}: {
  id: string;
  size?: SizeTokens;
  label: ReactNode;
  required?: boolean;
  color: string;
  stateColor: string;
  knobProps: ReturnType<typeof useFormField>['knobProps'];
  text: ReturnType<typeof useFormField>['text'];
  labelProps?: SwitchProps['labelProps'];
}) => (
  <Label
    htmlFor={id}
    // SAFETY: a size token doubles as the label's font-size token; both are `$n` steps of one scale.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SizeTokens and FontSizeTokens are distinct generated unions over the same scale
    size={(size ?? '$true') as FontSizeTokens}
    {...knobProps.textWeight}
    color={color}
    hoverStyle={{ color: stateColor, ...text.hoverKnobProps }}
    pressStyle={{ color: stateColor, ...text.pressKnobProps }}
    focusStyle={{ color: stateColor, ...text.focusKnobProps }}
    focusVisibleStyle={{
      color: stateColor,
      ...text.focusVisibleKnobProps,
    }}
    paddingInlineEnd="$1"
    {...labelProps}>
    {label}
    {required && ' *'}
  </Label>
);

type FormFieldView = ReturnType<typeof useFormField>;

interface SwitchTrackProps {
  switchChecked: boolean;
  onToggle: (val: boolean) => void;
  onBlur?: AnyHandler;
  hasError: boolean;
  errorMessage?: string;
  id: string;
  sizeToken: SizeTokens;
  footprint: SwitchFootprint;
  targetHeight?: number;
  knobProps: FormFieldView['knobProps'];
  control: FormFieldView['control'];
  elevationWrapperProps: ReturnType<typeof getElevationWrapperProps>;
  switchProps?: SwitchProps['switchProps'];
  pointy?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  label?: ReactNode;
  helperText?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/** The painted switch: radius, frame, state styles and the optional elevation surface around it. */
const SwitchTrack = ({
  switchChecked,
  onToggle,
  onBlur,
  hasError,
  errorMessage,
  id,
  sizeToken,
  footprint,
  targetHeight,
  knobProps,
  control,
  elevationWrapperProps,
  switchProps,
  pointy,
  disabled,
  readOnly,
  required,
  label,
  helperText,
  ariaLabel,
  ariaLabelledBy,
  leftIcon,
  rightIcon,
}: SwitchTrackProps) => {
  const { trackHeight, trackWidth } = footprint;
  const grownTarget = targetHeight !== undefined;
  const overrideRadius = switchProps?.borderRadius;
  const hasRadiusOverride = overrideRadius != null;
  const radiusStop = resolveSwitchRadiusStop(knobProps.borderRadius.borderRadius, pointy);
  const resolveRadius = (heightPx: number) =>
    hasRadiusOverride
      ? (resolveRadiusValue(overrideRadius) ?? 1000)
      : resolveRadiusClass('BINARY', radiusStop, { heightPx });
  const trackRadius = resolveRadius(trackHeight);
  const thumbRadius = resolveRadius(footprint.thumbSize);
  const radiusResolution = hasRadiusOverride ? undefined : radiusResolutionProps('BINARY');
  const styles = resolveSwitchStateStyles({
    control,
    hasRadiusOverride,
    trackHeight,
    thumbHeight: footprint.thumbSize,
  });
  const frameProps = buildFrameProps({
    borderRadius: overrideRadius ?? trackRadius,
    trackHeight,
    trackWidth,
    targetHeight,
    switchChecked,
    outlined: knobProps.outlined,
    radiusResolution,
  });
  const cellTrack = grownTarget
    ? {
        height: trackHeight,
        borderRadius: trackRadius,
        borderWidth: knobProps.borderRadius.borderWidth ?? 1,
        frameHeight: targetHeight,
        hoverStyle: cellTrackRadiusStyle(styles.trackHover),
        pressStyle: cellTrackRadiusStyle(styles.trackPress),
        focusStyle: cellTrackRadiusStyle(styles.trackFocus),
      }
    : undefined;
  const requiredMark = required ? ' *' : '';
  const accessibilityLabel = isString(label) ? `${label}${requiredMark}` : ariaLabel;

  const switchElement = (
    <SwitchControl
      checked={switchChecked}
      onCheckedChange={onToggle}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      hasError={hasError}
      id={id}
      sizeToken={sizeToken}
      footprint={footprint}
      thumbRadius={thumbRadius}
      transition={resolveSwitchMotion(isString(knobProps.transition) ? knobProps.transition : undefined)}
      frameProps={frameProps}
      switchProps={switchProps}
      leftIcon={leftIcon}
      rightIcon={rightIcon}
      inputSurface={grownTarget ? undefined : knobProps.inputSurface}
      cellTrack={cellTrack}
      radiusResolution={radiusResolution}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={errorMessage ?? helperText}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
      {...thumbStateProps({
        thumbHoverStyle: styles.thumbHover,
        thumbPressStyle: styles.thumbPress,
        thumbFocusStyle: styles.thumbFocus,
      })}
      {...trackStateProps(styles, switchChecked)}
    />
  );

  if (hasElevationProp(elevationWrapperProps) && !grownTarget) {
    return (
      <View
        {...elevationWrapperProps}
        borderRadius={trackRadius}
        {...radiusResolution}>
        {switchElement}
      </View>
    );
  }

  return switchElement;
};

/** Field chrome plus the switch/label row. FieldLayout owns the dimWhole assembly dim (keepLabel pins the sibling label/helper readable), so it needs the disabled state. */
const SwitchRow = ({
  id,
  error,
  helperText,
  size,
  knobProps,
  disabled,
  sizeToken,
  rowMinHeight,
  track,
  labelNode,
}: {
  id: string;
  error?: string | boolean;
  helperText?: string;
  size?: SizeTokens;
  knobProps: FormFieldView['knobProps'];
  disabled?: boolean;
  sizeToken: SizeTokens;
  rowMinHeight?: number;
  track: ReactNode;
  labelNode: ReactNode;
}) => (
  <FieldLayout
    id={id}
    error={error}
    helperText={helperText}
    size={size}
    knobProps={knobProps}
    disabled={disabled}>
    <XStack
      {...knobProps.gap}
      alignItems="center"
      height={sizeToken}
      {...(rowMinHeight !== undefined && { minHeight: rowMinHeight })}>
      {track}
      {labelNode}
    </XStack>
  </FieldLayout>
);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- emptiness predicate over any field value, by design (same contract as useResolvedValidators)
const isOffValue = (value: unknown): boolean => value === false || value == null || value === '' || value === 0;

export const Switch = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  checked,
  defaultValue,
  onChange,
  onCheckedChange,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  leftIcon,
  rightIcon,
  switchProps,
  pointy,
  skeleton,
  compact,
  minTargetHeight,
}: SwitchProps) => {
  const hydrationTouch = useTouchSurface();
  // Canonical `onChange` and the alias `onCheckedChange` both fire; standalone
  // (formless) callers get real toggling from either name.
  const handleValueChange = (val: boolean) => {
    onChange?.(val);
    onCheckedChange?.(val);
  };
  const { resolvedForm, knobProps, control, text, elevation, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const { mode: saveMode, onAutoCommit } = useFormSaveMode();
  const resolvedValidators = useResolvedValidators(required, validators, label, name, isOffValue);
  const elevationWrapperProps = getElevationWrapperProps(knobProps, elevation);
  const inTableCell = useIsInTableCell();

  const [internalChecked, setInternalChecked] = useState(defaultValue ?? false);

  // An uncontrolled switch follows a changed `defaultValue`. Adjusted during
  // render so the stale value never paints.
  const controlled = checked !== undefined;
  const [syncedDefault, setSyncedDefault] = useState({ defaultValue, controlled });
  if (syncedDefault.defaultValue !== defaultValue || syncedDefault.controlled !== controlled) {
    setSyncedDefault({ defaultValue, controlled });
    if (!controlled && defaultValue !== undefined) {
      setInternalChecked(defaultValue);
    }
  }

  // Coordinated geometry: ONE size token drives the control (track,
  // thumb) AND the row slot, so an explicit `size` prop can never make the
  // control outgrow its own row. The row is the recipe height; the
  // track is the platform switch's fraction of it.
  // SAFETY: knobProps.sizeToken is always a Tamagui size token; the cast only narrows its string type.
  const sizeToken = (size ?? knobProps.sizeToken) as SizeTokens;
  const footprint = switchFootprint(String(sizeToken), knobProps.borderRadius.borderWidth ?? 1);
  // Grown-target mode (SP-FIXED): table cells always grow the pressable
  // frame to 44px; standalone consumers opt in via `minTargetHeight`; touch
  // surfaces get the 44px floor on the PRESSABLE frame while the
  // painted track keeps the desktop recipe height (same split as Select:
  // floor on the target, never on painted chrome). The row slot floors at
  // the frame height so grown targets never overlap sibling rows.
  const targetHeight = resolveTargetHeight({
    inTableCell,
    minTargetHeight,
    hydrationTouch,
    trackHeight: footprint.trackHeight,
  });
  const rowMinHeight = !inTableCell && targetHeight !== undefined ? targetHeight : undefined;
  const hasLabel = Boolean(label);

  const renderTrack = (
    switchChecked: boolean,
    handleChange: ((val: boolean) => void) | undefined,
    handleBlur: AnyHandler | undefined,
    errorProp: string | boolean | undefined,
  ) => (
    <SwitchTrack
      switchChecked={switchChecked}
      onToggle={(val) => {
        if (disabled || readOnly) {
          return;
        }
        handleChange?.(val);
        handleValueChange(val);
      }}
      onBlur={handleBlur}
      hasError={isErrorValue(errorProp)}
      errorMessage={isString(errorProp) && errorProp !== '' ? errorProp : undefined}
      id={id}
      sizeToken={sizeToken}
      footprint={footprint}
      targetHeight={targetHeight}
      knobProps={knobProps}
      control={control}
      elevationWrapperProps={elevationWrapperProps}
      switchProps={switchProps}
      pointy={pointy}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      label={label}
      helperText={helperText}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
      leftIcon={leftIcon}
      rightIcon={rightIcon}
    />
  );

  const renderLabel = (color: string, stateColor: string) =>
    hasLabel ? (
      <SwitchLabel
        id={id}
        size={size}
        label={label}
        required={required}
        color={color}
        stateColor={stateColor}
        knobProps={knobProps}
        text={text}
        labelProps={labelProps}
      />
    ) : null;

  // Render skeleton placeholder
  if (skeleton) {
    // Mirror the real anatomy: same track
    // size as the real switch, BINARY radius matching the real control, and a
    // deterministic px label width — never % inside this auto-width row
    // (%-width collapses and overflows the next sibling).
    const skeletonStop = resolveSwitchRadiusStop(knobProps.borderRadius.borderRadius, pointy);
    return (
      <FieldLayout
        id={id}
        size={size}
        knobProps={knobProps}
        compactSpacing>
        <XStack
          {...knobProps.gap}
          alignItems="center"
          height={sizeToken}>
          <Skeleton
            variant="rounded"
            width={footprint.trackWidth}
            height={footprint.trackHeight}
            borderRadius={resolveRadiusClass('BINARY', skeletonStop, { heightPx: footprint.trackHeight })}
          />
          {hasLabel ? (
            <Skeleton
              variant="text"
              width={96}
              // Label bone tracks the recipe type channel (skeleton mirrors anatomy).
              height={sizeRecipeForToken(String(sizeToken)).fontSize}
            />
          ) : null}
        </XStack>
      </FieldLayout>
    );
  }

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <SwitchRow
        id={id}
        error={error}
        helperText={helperText}
        size={size}
        knobProps={knobProps}
        disabled={disabled}
        sizeToken={sizeToken}
        rowMinHeight={rowMinHeight}
        track={renderTrack(
          checked ?? internalChecked,
          controlled
            ? undefined
            : (val) => {
                setInternalChecked(val);
              },
          onBlur,
          error,
        )}
        labelNode={renderLabel(
          isErrorValue(error) ? formCommonColors.error : knobProps.textAccentColor,
          knobProps.textAccentColor,
        )}
      />
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const formLabelColor = isErrorValue(resolvedError) ? formCommonColors.error : knobProps.textAccentColor;
        return (
          <SwitchRow
            id={id}
            error={resolvedError}
            helperText={helperText}
            size={size}
            knobProps={knobProps}
            disabled={disabled}
            sizeToken={sizeToken}
            rowMinHeight={rowMinHeight}
            track={renderTrack(
              // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- form values are untyped at runtime; a missing value must read as off
              checked ?? Boolean(field.state.value),
              (val) => {
                // SAFETY: the field is bound to this switch's boolean value, so handleChange accepts the boolean it is given.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field API's value type is erased to `never` for a form of unknown shape
                field.handleChange(val as never);
                if (saveMode === 'declarative') {
                  commitImmediateField(resolvedForm, name, val);
                  onAutoCommit?.(name, val);
                }
              },
              mergeFieldHandler(field, 'handleBlur', onBlur),
              resolvedError,
            )}
            labelNode={renderLabel(formLabelColor, formLabelColor)}
          />
        );
      }}
    </Field>
  );
};
