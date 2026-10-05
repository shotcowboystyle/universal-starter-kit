import { useTouchSurface } from '@repo/theme';
import {
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
  type BorderRadius,
  type RadiusResolutionDeclaration,
} from '@repo/theme';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ColorTokens, FontSizeTokens, LabelProps, SizeTokens } from 'tamagui';
import {
  type SwitchProps as TamaguiSwitchProps,
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

import { commitImmediateField } from '../../ContextualSaveBar/commitImmediateField';
import { Field, FieldLayout } from '../../fieldLayout';
import { useFormSaveMode } from '../../Form';
import { formCommonColors, formControlColors, formSwitchColors } from '../../shared/colorRamps';
import { pressSlopProps } from '../../shared/pressSlopProps';
import { useIsInTableCell } from '../../shared/tableCellContext';
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

import { switchFootprint, type SwitchFootprint } from './footprint';

/** Pointer travel (px) before a gesture counts as thumb-drag instead of click. */
const SWITCH_DRAG_INTENT_PX = 10;

/** Minimum pressable height for the switch inside table cells (SP-FIXED). */
const SWITCH_CELL_TARGET_HEIGHT = 44;

/** `animation=none` resolves to undefined — do not fall back to `quick`. */
const resolveSwitchMotion = (token: string | undefined) => (token && token !== 'none' ? token : 'none');

const SWITCH_KB_RING_CSS_ID = 'mp-switch-kb-ring-css';
const SWITCH_KB_RING_CLASS = 'mp-switch-kb-ring';

/** Tamagui compiles focusStyle outlineWidth:0 to `:focus { outline-width:0 !important }`. */
function ensureSwitchKbRingCss() {
  if (typeof document === 'undefined') {
    return;
  }
  const css = `:root:root:root:root:root:root:root:root .${SWITCH_KB_RING_CLASS}.${SWITCH_KB_RING_CLASS},:root:root:root:root:root:root:root:root .${SWITCH_KB_RING_CLASS}.${SWITCH_KB_RING_CLASS}:focus,:root:root:root:root:root:root:root:root .${SWITCH_KB_RING_CLASS}.${SWITCH_KB_RING_CLASS}:focus-visible{outline-width:2px!important;outline-style:solid!important;outline-color:var(--outlineColor,var(--c-outlineColor,CanvasText))!important;outline-offset:2px!important}`;
  let tag = document.getElementById(SWITCH_KB_RING_CSS_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = SWITCH_KB_RING_CSS_ID;
    document.head.appendChild(tag);
  }
  if (tag.textContent !== css) {
    tag.textContent = css;
  }
}

/** Hover/press/focus knobs must not smuggle a second outline channel. */
const stripOutlineFromState = (props?: Record<string, any>) => {
  if (!props) {
    return props;
  }
  const { outlineWidth, outlineStyle, outlineColor, outlineOffset, ...rest } = props;
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

const resolveRadiusValue = (radius: unknown) => {
  if (typeof radius === 'number') {
    return radius;
  }
  if (typeof radius !== 'string') {
    return undefined;
  }

  const radiusToken = (getTokens().radius as any)?.[radius];
  const resolved = getVariableValue(radiusToken || radius);
  if (typeof resolved === 'number' && Number.isFinite(resolved)) {
    return resolved;
  }

  const parsed = Number.parseFloat(String(resolved));
  return Number.isFinite(parsed) ? parsed : undefined;
};

function radiusStopFromToken(token: string): BorderRadius | undefined {
  for (const stop of Object.keys(borderRadiusMap) as BorderRadius[]) {
    if (borderRadiusMap[stop] === token) {
      return stop;
    }
  }
  return undefined;
}

/** `pointy` forces the none stop; otherwise invert the resolved radius token. */
function resolveSwitchRadiusStop(pointy: boolean | undefined, radiusToken: string): BorderRadius {
  if (pointy === true) {
    return 'none';
  }
  const stop = radiusStopFromToken(radiusToken);
  if (!stop) {
    throw new Error(`Switch: "${radiusToken}" is not a borderRadiusMap token; cannot resolve BINARY`);
  }
  return stop;
}

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
function withBinaryStateRadius(
  stateProps: Record<string, any> | undefined,
  heightPx: number,
): Record<string, any> | undefined {
  if (!stateProps) {
    return undefined;
  }
  const next = clampRadiusInStateProps(stateProps, { radiusClass: 'BINARY', heightPx });
  return next && Object.keys(next).length > 0 ? next : undefined;
}

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

const SwitchIconFrame = styled(View, {
  position: 'absolute',
  context: SwitchStyledContext,
  height: '100%',
  justifyContent: 'center',
  alignItems: 'center',
  variants: {
    placement: {
      right: (_, { props, tokens }) => {
        const amount =
          (tokens.space as Record<string, { val: number }>)[(props as { size: string }).size]?.val * 0.35 || 4;
        return { right: amount };
      },
      left: (_, { props, tokens }) => {
        const amount =
          (tokens.space as Record<string, { val: number }>)[(props as { size: string }).size]?.val * 0.35 || 4;
        return { left: amount };
      },
    },
    size: { '...size': {} as any },
  } as const,
  defaultVariants: { placement: 'right' },
});

const getIconSize = (size: FontSizeTokens, scale: number) => {
  return (typeof size === 'number' ? size * 0.5 : getFontSize(size as FontSizeTokens)) * scale;
};

const SwitchIcon = SwitchIconFrame.styleable<{
  scaleIcon?: number;
  color?: ColorTokens | string;
  placement?: 'left' | 'right';
}>((iconProps, ref) => {
  const { children, color: colorProp, scaleIcon = 1.2, ...props } = iconProps;
  const { size } = SwitchStyledContext.useStyledContext();

  const theme = useTheme();
  const color = getVariable(colorProp || theme[colorProp as any]?.get('web') || theme.color10?.get('web'));
  const iconSize = getIconSize(size as FontSizeTokens, scaleIcon);

  const getThemedIcon = useGetThemedIcon({ size: iconSize, color: color });
  return (
    <SwitchIconFrame ref={ref} {...props}>
      {getThemedIcon(children)}
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
function useLuminanceThumbColor(displayChecked: boolean): string | undefined {
  const theme = useTheme();
  const trackToken = (displayChecked ? formSwitchColors.track.on : formSwitchColors.track.off).slice(1);
  const trackRaw = String((theme as any)[trackToken]?.val ?? '');
  const paperRaw = String(theme.color1?.val ?? '');
  const inkRaw = String(theme.color12?.val ?? '');
  const track = trackRaw ? normalizeToHex(trackRaw) : null;
  const paper = paperRaw ? normalizeToHex(paperRaw) : null;
  const ink = inkRaw ? normalizeToHex(inkRaw) : null;
  if (!track || !paper || !ink) {
    return undefined;
  }
  const trackLum = relativeLuminance(track);
  return contrastRatio(relativeLuminance(paper), trackLum) >= contrastRatio(relativeLuminance(ink), trackLum)
    ? paperRaw
    : inkRaw;
}

interface SwitchControlProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onBlur?: (...args: any[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  hasError?: boolean;
  id: string;
  sizeToken: SizeTokens;
  footprint: SwitchFootprint;
  thumbRadius: number;
  transition?: string;
  frameProps: Record<string, any>;
  switchProps?: Omit<TamaguiSwitchProps, 'checked' | 'defaultChecked' | 'id' | 'onCheckedChange' | 'children'>;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  inputSurface: Record<string, any>;
  hoverStyle?: Record<string, any>;
  pressStyle?: Record<string, any>;
  focusStyle?: Record<string, any>;
  focusVisibleStyle?: Record<string, any>;
  thumbHoverStyle?: Record<string, any>;
  thumbPressStyle?: Record<string, any>;
  thumbFocusStyle?: Record<string, any>;
  /** Native VoiceOver/TalkBack name (label text) — htmlFor is web-only. */
  accessibilityLabel?: string;
  /** Native VoiceOver/TalkBack hint (error or helper text). */
  accessibilityHint?: string;
  /** Web accessible name — forwarded to the role="switch" node. */
  ariaLabel?: string;
  /** Web external labeling element id — forwarded to the role="switch" node. */
  ariaLabelledBy?: string;
  /**
   * Grown-target mode (SP-FIXED): when set, the role=switch frame is a
   * `frameHeight`-tall transparent target (44px in table cells) and the
   * visible track renders as this inner view, so the touch target grows
   * without changing the track's visual size.
   */
  cellTrack?: {
    height: number;
    borderRadius: number;
    borderWidth: number;
    frameHeight: number;
    hoverStyle?: Record<string, any>;
    pressStyle?: Record<string, any>;
    focusStyle?: Record<string, any>;
  };
  /** BINARY declaration for the thumb and the cell track; absent under a radius override. */
  radiusResolution?: RadiusResolutionDeclaration;
}

function SwitchControl({
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
}: SwitchControlProps) {
  if (isWeb) {
    ensureKeyboardModalityTracking();
    ensureSwitchKbRingCss();
  }
  const { disabledState, knobProps } = useResolvedKnobs();
  const outlined = knobProps.outlined;
  const trackOffFill = outlined ? 'transparent' : formSwitchColors.track.off;
  const trackOffBorder = formControlColors.boundary;
  const { thumbInset, thumbSize, travel: dragDistance } = footprint;
  const motion = resolveSwitchMotion(transition);
  const [dragX, setDragX] = useState<number | null>(null);
  // Hold snapped thumb until the controlled `checked` prop catches up (avoids flash).
  const [snapChecked, setSnapChecked] = useState<boolean | null>(null);
  const sessionRef = useRef<SwitchDragSession | null>(null);
  const suppressClickToggleRef = useRef(false);
  const checkedRef = useRef(checked);
  const dragDistanceRef = useRef(dragDistance);
  const onCheckedChangeRef = useRef(onCheckedChange);
  checkedRef.current = checked;
  dragDistanceRef.current = dragDistance;
  onCheckedChangeRef.current = onCheckedChange;

  useEffect(() => {
    if (snapChecked == null) {
      return;
    }
    if (checked === snapChecked) {
      setSnapChecked(null);
    }
  }, [checked, snapChecked]);

  useEffect(() => {
    if (!isWeb) {
      return;
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

  const displayChecked = snapChecked ?? checked;
  const thumbHandleColor = useLuminanceThumbColor(displayChecked);
  const restingX = displayChecked ? dragDistance : 0;
  const thumbX = dragX != null ? dragX : restingX;
  const canDrag = isWeb && !disabled && !readOnly;
  const [kbFocus, setKbFocus] = useState(false);
  useLayoutEffect(() => {
    if (!isWeb) {
      return;
    }
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    const apply = (node: HTMLElement | null, on: boolean) => {
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
    apply(el, kbFocus && !cellTrack);
    apply(el.querySelector(`.${SWITCH_KB_RING_CLASS}`), kbFocus && !!cellTrack);
  }, [kbFocus, cellTrack, id]);
  const hoverSafe = stripOutlineFromState(hoverStyle);
  const pressSafe = stripOutlineFromState(pressStyle);
  const focusSafe = stripOutlineFromState(focusStyle);
  const {
    onPointerDown: switchPointerDown,
    onPress: switchPress,
    onFocus: switchFocus,
    onBlur: switchBlur,
    className: switchClassName,
    ...restSwitchProps
  } = (switchProps || {}) as Record<string, any>;
  const kbRingClass = kbFocus ? SWITCH_KB_RING_CLASS : undefined;
  const frameClassName = [switchClassName, !cellTrack ? kbRingClass : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <StyledSwitch
      {...inputSurface}
      transition={motion}
      size={sizeToken}
      {...(hoverSafe && { hoverStyle: hoverSafe })}
      {...(pressSafe && { pressStyle: pressSafe })}
      {...(focusSafe && { focusStyle: { ...focusSafe } })}
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
      {...(cellTrack
        ? undefined
        : displayChecked
          ? {
              backgroundColor: formSwitchColors.track.on,
              borderColor: formSwitchColors.track.on,
            }
          : {
              backgroundColor: trackOffFill,
              borderColor: trackOffBorder,
            })}
      {...(kbFocus ? { 'data-kb-focus': 'true' } : undefined)}
      {...(frameClassName ? { className: frameClassName } : undefined)}
      {...(cellTrack ? { outlineWidth: 0 } : kbFocus ? ensureFocusVisibleRing() : { outlineWidth: 0 })}
      // iOS: bare styled Views are not accessibility elements — without this
      // block the switch is invisible to VoiceOver (no name, role, or state).
      {...(!isWeb && {
        accessible: true,
        accessibilityRole: 'switch' as const,
        accessibilityState: { disabled: !!disabled, checked },
        ...(accessibilityLabel ? { accessibilityLabel } : undefined),
        ...(accessibilityHint ? { accessibilityHint } : undefined),
      })}
      {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}
      {...(readOnly ? { 'aria-readonly': true } : undefined)}
      // Top-level aria-label/aria-labelledby land AFTER restSwitchProps so
      // the dedicated props win over the legacy switchProps escape hatch.
      {...(ariaLabel ? { 'aria-label': ariaLabel } : undefined)}
      {...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : undefined)}
      aria-required={required || undefined}
      aria-invalid={hasError || undefined}
      onFocus={(e: any) => {
        switchFocus?.(e);
        if (wasKeyboardFocus()) {
          setKbFocus(true);
        }
      }}
      onBlur={(e: any) => {
        setKbFocus(false);
        switchBlur?.(e);
        onBlur?.(e);
      }}
      onCheckedChange={(val) => {
        if (disabled || readOnly) {
          return;
        }
        // After a drag, Tamagui still fires press→toggle; ignore that flip.
        if (suppressClickToggleRef.current) {
          suppressClickToggleRef.current = false;
          return;
        }
        onCheckedChange?.(val);
      }}
      onPointerDown={(e: any) => {
        switchPointerDown?.(e);
        if (!canDrag) {
          return;
        }
        if (typeof e.button === 'number' && e.button !== 0) {
          return;
        }
        sessionRef.current = {
          pointerId: e.pointerId ?? 0,
          startX: e.clientX,
          originChecked: checkedRef.current,
          moved: false,
        };
        setSnapChecked(null);
        // Do NOT setDragX here — dragX starts only once drag intent is
        // confirmed in onMove, so a plain click (or mid-flight retarget)
        // never freezes/teleports the thumb.
      }}
      {...(switchPress ? { onPress: switchPress } : undefined)}>
      {cellTrack && (
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
          borderColor={displayChecked ? formSwitchColors.track.on : trackOffBorder}
          backgroundColor={displayChecked ? formSwitchColors.track.on : trackOffFill}
          transition={motion}
          pointerEvents="none"
          className={kbFocus ? SWITCH_KB_RING_CLASS : undefined}
          {...(kbFocus ? ensureFocusVisibleRing() : { outlineWidth: 0 })}
          {...(cellTrack.hoverStyle && { hoverStyle: cellTrack.hoverStyle })}
          {...(cellTrack.pressStyle && { pressStyle: cellTrack.pressStyle })}
          {...(cellTrack.focusStyle && { focusStyle: cellTrack.focusStyle })}
        />
      )}
      {leftIcon && <StyledSwitch.Icon placement="left">{leftIcon}</StyledSwitch.Icon>}
      {rightIcon && <StyledSwitch.Icon placement="right">{rightIcon}</StyledSwitch.Icon>}
      <StyledSwitch.Thumb
        borderRadius={thumbRadius}
        {...radiusResolution}
        width={thumbSize}
        height={thumbSize}
        // Own position so drag can override Tamagui's initialChecked alignSelf/x math.
        alignSelf="flex-start"
        x={thumbX + thumbInset + (cellTrack ? cellTrack.borderWidth : 0)}
        y={cellTrack ? (cellTrack.frameHeight - thumbSize) / 2 : thumbInset}
        {...(thumbHandleColor ? { backgroundColor: thumbHandleColor } : undefined)}
        transition={dragX != null ? 'none' : motion}
        {...(thumbHoverStyle && { hoverStyle: thumbHoverStyle })}
        {...(thumbPressStyle && { pressStyle: thumbPressStyle })}
        {...(thumbFocusStyle && { focusStyle: thumbFocusStyle })}
      />
    </StyledSwitch>
  );
}

// ─── Form-aware Switch ────────────────────────────────────────────────────────

export interface SwitchProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
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
  onBlur?: (...args: any[]) => void;
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

export function Switch({
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
}: SwitchProps) {
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
  const resolvedValidators = useResolvedValidators(required, validators, label, name, (v) => !v);
  const elevationWrapperProps = getElevationWrapperProps(knobProps, elevation);
  const inTableCell = useIsInTableCell();

  const [internalChecked, setInternalChecked] = useState(defaultValue ?? false);

  useEffect(() => {
    if (checked === undefined && defaultValue !== undefined) {
      setInternalChecked(defaultValue);
    }
  }, [defaultValue, checked]);

  // Coordinated geometry: ONE size token drives the control (track,
  // thumb) AND the row slot, so an explicit `size` prop can never make the
  // control outgrow its own row. The row is the recipe height; the
  // track is the platform switch's fraction of it.
  const sizeToken = (size ?? knobProps.sizeToken) as SizeTokens;
  const borderWidth = knobProps.borderRadius.borderWidth ?? 1;
  const footprint = switchFootprint(String(sizeToken), borderWidth);
  const { trackHeight, trackWidth } = footprint;
  // Grown-target mode (SP-FIXED): table cells always grow the pressable
  // frame to 44px; standalone consumers opt in via `minTargetHeight`; touch
  // surfaces get the 44px floor on the PRESSABLE frame while the
  // painted track keeps the desktop recipe height (same split as Select:
  // floor on the target, never on painted chrome). The row slot floors at
  // the frame height so grown targets never overlap sibling rows.
  const targetHeight = inTableCell
    ? SWITCH_CELL_TARGET_HEIGHT
    : minTargetHeight !== undefined
      ? Math.max(minTargetHeight, trackHeight)
      : hydrationTouch && trackHeight < TOUCH_HEIGHT_FLOOR
        ? TOUCH_HEIGHT_FLOOR
        : undefined;
  const grownTarget = targetHeight !== undefined;
  const rowMinHeight = !inTableCell && grownTarget ? targetHeight : undefined;

  const renderSwitch = (
    switchChecked: boolean,
    handleChange?: (val: boolean) => void,
    handleBlur?: (...args: any[]) => void,
    hasError?: boolean,
    errorMessage?: string,
  ) => {
    const overrideRadius = (switchProps as any)?.borderRadius;
    const radiusStop = resolveSwitchRadiusStop(pointy, knobProps.borderRadius.borderRadius);
    const thumbPaintedHeight = footprint.thumbSize;
    const trackRadius =
      overrideRadius != null
        ? (resolveRadiusValue(overrideRadius) ?? 1000)
        : resolveRadiusClass('BINARY', radiusStop, { heightPx: trackHeight });
    const thumbRadius =
      overrideRadius != null
        ? (resolveRadiusValue(overrideRadius) ?? 1000)
        : resolveRadiusClass('BINARY', radiusStop, { heightPx: thumbPaintedHeight });

    const radiusResolution = overrideRadius == null ? radiusResolutionProps('BINARY') : undefined;
    let frameProps: Record<string, any> = {
      borderRadius: overrideRadius ?? trackRadius,
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
    const hoverRaw = stripOutlineFromState(control.hoverKnobProps);
    const pressRaw = stripOutlineFromState(control.pressKnobProps);
    const focusRaw = stripOutlineFromState(control.focusKnobProps);
    const trackHover =
      overrideRadius != null ? stripRadiusFromStateProps(hoverRaw) : withBinaryStateRadius(hoverRaw, trackHeight);
    const trackPress =
      overrideRadius != null ? stripRadiusFromStateProps(pressRaw) : withBinaryStateRadius(pressRaw, trackHeight);
    const trackFocus =
      overrideRadius != null ? stripRadiusFromStateProps(focusRaw) : withBinaryStateRadius(focusRaw, trackHeight);
    const thumbHover = withBinaryStateRadius(
      overrideRadius != null
        ? undefined
        : hoverRaw?.borderRadius != null
          ? { borderRadius: hoverRaw.borderRadius }
          : undefined,
      thumbPaintedHeight,
    );
    const thumbPress = withBinaryStateRadius(
      overrideRadius != null
        ? undefined
        : pressRaw?.borderRadius != null
          ? { borderRadius: pressRaw.borderRadius }
          : undefined,
      thumbPaintedHeight,
    );
    const thumbFocus = withBinaryStateRadius(
      overrideRadius != null
        ? undefined
        : focusRaw?.borderRadius != null
          ? { borderRadius: focusRaw.borderRadius }
          : undefined,
      thumbPaintedHeight,
    );
    const cellTrackRadiusStyle = (state?: Record<string, any>) =>
      typeof state?.borderRadius === 'number' ? { borderRadius: state.borderRadius } : undefined;
    const cellTrack = grownTarget
      ? {
          height: trackHeight,
          borderRadius: trackRadius,
          borderWidth,
          frameHeight: targetHeight,
          ...(cellTrackRadiusStyle(trackHover) && {
            hoverStyle: cellTrackRadiusStyle(trackHover),
          }),
          ...(cellTrackRadiusStyle(trackPress) && {
            pressStyle: cellTrackRadiusStyle(trackPress),
          }),
          ...(cellTrackRadiusStyle(trackFocus) && {
            focusStyle: cellTrackRadiusStyle(trackFocus),
          }),
        }
      : undefined;
    if (grownTarget) {
      frameProps = {
        ...frameProps,
        height: targetHeight,
        minHeight: targetHeight,
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderColor: 'transparent',
        // createSwitch spreads activeStyle last when checked — keep the
        // (invisible) grown frame transparent in the checked state too.
        activeStyle: { backgroundColor: 'transparent', borderColor: 'transparent' },
      };
    } else if (switchChecked) {
      frameProps = {
        ...frameProps,
        ...radiusResolution,
        backgroundColor: formSwitchColors.track.on,
        borderColor: formSwitchColors.track.on,
      };
    } else {
      frameProps = {
        ...frameProps,
        ...radiusResolution,
        backgroundColor: knobProps.outlined ? 'transparent' : formSwitchColors.track.off,
        borderColor: formControlColors.boundary,
      };
    }

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
    const switchElement = (
      <SwitchControl
        checked={switchChecked}
        onCheckedChange={(val) => {
          if (disabled || readOnly) {
            return;
          }
          handleChange?.(val);
          handleValueChange(val);
        }}
        onBlur={handleBlur}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        hasError={hasError}
        id={id}
        sizeToken={sizeToken}
        footprint={footprint}
        thumbRadius={thumbRadius}
        transition={resolveSwitchMotion(knobProps.transition as string | undefined)}
        frameProps={frameProps}
        switchProps={switchProps}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        inputSurface={grownTarget ? {} : knobProps.inputSurface}
        cellTrack={cellTrack}
        radiusResolution={radiusResolution}
        accessibilityLabel={typeof label === 'string' ? `${label}${required ? ' *' : ''}` : ariaLabel}
        accessibilityHint={errorMessage ?? helperText}
        ariaLabel={ariaLabel}
        ariaLabelledBy={ariaLabelledBy}
        {...(thumbHover && { thumbHoverStyle: thumbHover })}
        {...(thumbPress && { thumbPressStyle: thumbPress })}
        {...(thumbFocus && { thumbFocusStyle: thumbFocus })}
        {...(trackHover && {
          hoverStyle: { ...trackHover, borderColor: stateBorderColor, ...checkedTrackFill },
        })}
        {...(trackPress && {
          pressStyle: { ...trackPress, borderColor: stateBorderColor, ...checkedTrackFill },
        })}
        {...(trackFocus && {
          focusStyle: {
            outlineWidth: 0,
            ...trackFocus,
            borderColor: stateBorderColor,
            ...checkedTrackFill,
          },
        })}
      />
    );

    if (elevationWrapperProps.elevation && !grownTarget) {
      return (
        <View {...elevationWrapperProps} borderRadius={trackRadius} {...radiusResolution}>
          {switchElement}
        </View>
      );
    }

    return switchElement;
  };

  // Render skeleton placeholder
  if (skeleton) {
    // Mirror the real anatomy: same track
    // size as renderSwitch, BINARY radius matching the real control, and a
    // deterministic px label width — never % inside this auto-width row
    // (%-width collapses and overflows the next sibling).
    const skeletonStop = resolveSwitchRadiusStop(pointy, knobProps.borderRadius.borderRadius);
    return (
      <FieldLayout id={id} size={size} knobProps={knobProps} compactSpacing>
        <XStack {...knobProps.gap} alignItems="center" height={sizeToken}>
          <Skeleton
            variant="rounded"
            width={trackWidth}
            height={trackHeight}
            borderRadius={resolveRadiusClass('BINARY', skeletonStop, { heightPx: trackHeight })}
          />
          {label && (
            <Skeleton
              variant="text"
              width={96}
              // Label bone tracks the recipe type channel (skeleton mirrors anatomy).
              height={sizeRecipeForToken(String(sizeToken)).fontSize}
            />
          )}
        </XStack>
      </FieldLayout>
    );
  }

  if (!resolvedForm || !name) {
    const resolvedChecked = checked !== undefined ? checked : internalChecked;
    return (
      <FieldLayout
        id={id}
        error={error}
        helperText={helperText}
        size={size}
        knobProps={knobProps}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        <XStack
          {...knobProps.gap}
          alignItems="center"
          height={sizeToken}
          {...(rowMinHeight !== undefined && { minHeight: rowMinHeight })}>
          {renderSwitch(
            resolvedChecked,
            checked === undefined
              ? (val) => {
                  setInternalChecked(val);
                }
              : undefined,
            onBlur,
            !!error,
            typeof error === 'string' && error ? error : undefined,
          )}
          {label && (
            <Label
              htmlFor={id}
              size={(size || '$true') as FontSizeTokens}
              {...knobProps.textWeight}
              color={error ? formCommonColors.error : knobProps.textAccentColor}
              hoverStyle={{ color: knobProps.textAccentColor, ...text.hoverKnobProps }}
              pressStyle={{ color: knobProps.textAccentColor, ...text.pressKnobProps }}
              focusStyle={{ color: knobProps.textAccentColor, ...text.focusKnobProps }}
              focusVisibleStyle={{
                color: knobProps.textAccentColor,
                ...text.focusVisibleKnobProps,
              }}
              paddingInlineEnd="$1"
              {...labelProps}>
              {label}
              {required && ' *'}
            </Label>
          )}
        </XStack>
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const formLabelColor = resolvedError ? formCommonColors.error : knobProps.textAccentColor;
        return (
          <FieldLayout
            id={id}
            error={resolvedError}
            helperText={helperText}
            size={size}
            knobProps={knobProps}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            <XStack
              {...knobProps.gap}
              alignItems="center"
              height={sizeToken}
              {...(rowMinHeight !== undefined && { minHeight: rowMinHeight })}>
              {renderSwitch(
                checked !== undefined ? checked : Boolean(field.state.value),
                (val) => {
                  field.handleChange(val as any);
                  if (saveMode === 'declarative') {
                    commitImmediateField(resolvedForm, name, val);
                    onAutoCommit?.(name, val);
                  }
                },
                mergeFieldHandler(field, 'handleBlur', onBlur),
                !!resolvedError,
                typeof resolvedError === 'string' && resolvedError ? resolvedError : undefined,
              )}
              {label && (
                <Label
                  htmlFor={id}
                  size={(size || '$true') as FontSizeTokens}
                  {...knobProps.textWeight}
                  color={formLabelColor}
                  hoverStyle={{ color: formLabelColor, ...text.hoverKnobProps }}
                  pressStyle={{ color: formLabelColor, ...text.pressKnobProps }}
                  focusStyle={{ color: formLabelColor, ...text.focusKnobProps }}
                  focusVisibleStyle={{ color: formLabelColor, ...text.focusVisibleKnobProps }}
                  paddingInlineEnd="$1"
                  {...labelProps}>
                  {label}
                  {required && ' *'}
                </Label>
              )}
            </XStack>
          </FieldLayout>
        );
      }}
    </Field>
  );
}
