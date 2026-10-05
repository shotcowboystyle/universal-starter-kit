/**
 * Toast — themed feedback toasts on top of the @tamagui/toast machinery
 * (the theme provider already mounts a ToastProvider; this module brings the
 * house anatomy, knob wiring, stacking store and viewport).
 *
 * Usage:
 *   1. Mount <ToastViewport /> once (app shell or story). A second mounted
 *      viewport no-ops (DEV warn) and takes over when the first unmounts.
 *   2. Fire from anywhere: useToast().show({ title, description, intent }).
 *
 * Anatomy: elevated overlay surface (knob elevatedSurface — overlay grammar)
 * hue-tinted by the intent sub-theme via <Intent> (one emphasis system, same
 * as Alert/Button): step-1 surface, step-9 accent edge, step-11 icon/action,
 * step-12 title. Semantic hues are tint-independent; accent rides the tint.
 * Expiry policy lives in ./store (per-intent defaults, error ceiling, sticky
 * opt-out); pause-on-hover/focus, swipe to dismiss, Escape and F8 come from
 * @tamagui/toast. Enter/exit honor the animation knob.
 *
 * Layering: toasts are transient feedback, not modal chrome. On web the
 * whole viewport is contained in a stacking context at `zIndex.loading`
 * (1000) so modal overlays (sheet 100000 / dropdown 200000, portaled to the
 * root host) always paint — and hit-test — above it. On native the
 * @tamagui/toast wrapper + viewport are `pointerEvents="box-none"` all the
 * way down, so ONLY the toast card itself is ever interactive; taps beside
 * a toast reach whatever is underneath.
 */

import { CheckCircleIcon, InfoIcon, WarningCircleIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { zIndex } from '@repo/forms';
import {
  Intent,
  type KnobProps,
  MIN_PRESS_TARGET,
  ensureCompositeFocusRing,
  pressTargetHitSlop,
  pressTargetStyle,
  useAccentOnSurface,
  useResolvedKnobs,
  warnBannedErrorWords,
} from '@repo/theme';
import {
  Toast as TamaguiToast,
  ToastProvider as TamaguiToastProvider,
  ToastViewport as TamaguiToastViewport,
  type SwipeDirection,
} from '@tamagui/toast';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SizableText, View, XStack, YStack, isWeb, styled, useTheme, type ViewProps } from 'tamagui';

import { useTranslation } from '../shared/i18n';

import {
  claimToastViewport,
  dismissAllToasts,
  dismissToast,
  getToasts,
  getToastViewportOwner,
  releaseToastViewport,
  showToast,
  subscribeToasts,
  subscribeToastViewport,
  TOAST_ACTION_MIN_MS,
  TOAST_DEFAULT_MS,
  TOAST_ERROR_MS,
  TOAST_WARNING_MS,
  type ToastActionOptions,
  type ToastEntry,
  type ToastIntent,
  type ToastShowOptions,
} from './store';

export type { ToastActionOptions, ToastEntry, ToastIntent, ToastShowOptions };
export {
  dismissAllToasts,
  dismissToast,
  showToast,
  TOAST_ACTION_MIN_MS,
  TOAST_DEFAULT_MS,
  TOAST_ERROR_MS,
  TOAST_WARNING_MS,
};

// ── Intent visuals ────────────────────────────────────────────

const intentIcons: Record<ToastIntent, typeof InfoIcon> = {
  accent: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon,
  error: WarningCircleIcon,
};

// ── useToast ──────────────────────────────────────────────────

export interface UseToastResult {
  /** Show a toast; returns its id */
  show: (options: ToastShowOptions) => string;
  /** Dismiss one toast by id */
  dismiss: (id: string) => void;
  /** Dismiss every visible toast */
  dismissAll: () => void;
  /** Current toast entries (open + exiting) */
  toasts: ToastEntry[];
}

/**
 * Imperative toast hook. Works anywhere — no provider needed beyond a
 * mounted <ToastViewport />.
 */
export function useToast(): UseToastResult {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  return useMemo(() => ({ show: showToast, dismiss: dismissToast, dismissAll: dismissAllToasts, toasts }), [toasts]);
}

// ── Press-floor + nested scale ────────────────────────────────
//
// Dismiss X and action are nested overlay chrome: painted boxes stay
// glyph/label-scale (`nestedControl.px`, always < 44) while the press floor
// is the grown-transparent 44px channel. The grown box NEVER paints —
// hover/press ride the inner ring / pill (Chip-dismiss anatomy). The
// keyboard ring attaches to that inner painted box, never the 44px hit box
// (`mp-chip-dismiss` / `mp-chip-dismiss-ring`). One ring contract everywhere:
// the shared house recipe (2px solid $outlineColor, −2 inset)
// rides the inner painted box, not a local $color8 variant.

/** $0.5 token — Chip dismiss ring inset. */
const CLOSE_RING_INSET = 2;
// Beside an action the full horizontal outset would overlap the action's
// press target — cap below half the tightest row gap ($2 ≈ 8px). Same
// pitch-limited anatomy as Alert dismiss-beside-action.
const CLOSE_ADJACENT_OUTSET = 6;

const DESC_FONT_SIZE = {
  $1: '$1',
  $2: '$1',
  $3: '$2',
  $4: '$3',
  $5: '$4',
} as const;

function iconPxForSize(size: string): number {
  return size === 'small' ? 16 : size === 'large' ? 20 : 18;
}

function closePxForSize(size: string): number {
  return size === 'small' ? 12 : size === 'large' ? 16 : 14;
}

function toastClosePressProps(besideAction: boolean, closeVisual: number) {
  const outset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - closeVisual) / 2));
  return {
    ...pressTargetStyle(),
    ...(besideAction ? { minWidth: closeVisual + CLOSE_ADJACENT_OUTSET * 2 } : null),
    marginVertical: -outset,
    marginHorizontal: -(besideAction ? CLOSE_ADJACENT_OUTSET : outset),
    hitSlop: besideAction ? undefined : pressTargetHitSlop(closeVisual),
  };
}

function toastActionPressProps(visualH: number) {
  const outset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - visualH) / 2));
  return {
    ...pressTargetStyle(),
    marginVertical: -outset,
    hitSlop: pressTargetHitSlop(visualH),
  };
}

// Overlay elevation is one step above the control token.
// elevatedSurface.elevation is a Tamagui VARIANT — dropped on a
// bare View, and on main it is still the $1 CONTROL stop. Bind the overlay
// token explicitly onto XStack / TamaguiToast (both have the elevation
// variant) so standalone and viewport paint the SAME overlay shadow.
// W1-knob-res exposes `overlayElevation` on knobProps; prefer that when
// present so this local step-up retires itself.
const OVERLAY_ELEVATION_WEB: Record<string, string> = { $1: '$2', $2: '$3', $4: '$5' };
const OVERLAY_ELEVATION_NATIVE: Record<number, number> = { 20: 28, 28: 36, 44: 52 };

function overlayElevationOf(knobProps: KnobProps): string | number | undefined {
  const extra = knobProps as KnobProps & { overlayElevation?: string | number };
  if ('overlayElevation' in extra) {
    return extra.overlayElevation;
  }
  const control = knobProps.elevation;
  if (control == null) {
    return undefined;
  }
  if (typeof control === 'string') {
    return OVERLAY_ELEVATION_WEB[control] ?? control;
  }
  return OVERLAY_ELEVATION_NATIVE[control] ?? control;
}

/** 3px logical intent edge — must live in the style attribute after Tamagui writes. */
const TOAST_INTENT_EDGE_PX = 3;
const TOAST_FRAME_STYLE_ID = 'mp-toast-intent-edge';
const toastIntentEdgeCss =
  '.mp-toast{border-inline-start-width:3px!important;border-inline-start-style:solid!important;}';

function ensureToastIntentEdge() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(TOAST_FRAME_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = TOAST_FRAME_STYLE_ID;
  tag.textContent = toastIntentEdgeCss;
  document.head.appendChild(tag);
}

function paintToastFrame(
  node: HTMLElement | null,
  attrs: { size: string; density: string; nestedPx: number; edgeColor?: string },
) {
  if (!node) {
    return;
  }
  // Native host refs are not HTMLElements. Native already binds testID /
  // data-* via dataAttrs and the intent edge via borderStartWidth.
  if (typeof node.setAttribute !== 'function') {
    return;
  }
  node.setAttribute('data-testid', 'toast');
  node.setAttribute('data-size', attrs.size);
  node.setAttribute('data-density', attrs.density);
  node.setAttribute('data-nested-px', String(attrs.nestedPx));
  node.style.borderInlineStartWidth = `${TOAST_INTENT_EDGE_PX}px`;
  node.style.borderInlineStartStyle = 'solid';
  if (attrs.edgeColor) {
    node.style.borderInlineStartColor = attrs.edgeColor;
  }
}

/**
 * Spoken confirm. Tamagui's ToastAnnounce portal is web-only
 * (`announceTextContent` is null off-web in ToastImpl), so native VoiceOver
 * never heard CopyField's "Copied to clipboard." Put the title on the
 * frame and announce it the same way field errors do.
 */
function spokenToastText(title: ReactNode, description?: ReactNode): string | undefined {
  const chunks: string[] = [];
  if (typeof title === 'string' && title.trim()) {
    chunks.push(title.trim());
  }
  if (typeof description === 'string' && description.trim()) {
    chunks.push(description.trim());
  }
  return chunks.length ? chunks.join('. ') : undefined;
}

function useAnnounceToast(text: string | undefined) {
  useEffect(() => {
    if (isWeb || !text) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

export function nativeToastA11y(text: string | undefined, hasControls: boolean, web = isWeb) {
  if (web) {
    return {};
  }
  // ToastImplFrame defaults to tabIndex:0, which Tamagui maps to accessible.
  // Explicit false keeps native controls from disappearing inside that group.
  if (!text || hasControls) {
    return { accessible: false as const };
  }
  return {
    accessible: true as const,
    accessibilityLabel: text,
  };
}

/** Native View controls need accessible as well as their button role and label. */
export function nativeToastControlA11y(web = isWeb) {
  return web ? {} : { accessible: true as const };
}

// Grown transparent press target. Stays UNPAINTED — the keyboard ring lives on the
// inner pill via `.mp-chip-dismiss:focus-visible .mp-chip-dismiss-ring`.
const ToastActionTarget = styled(View, {
  name: 'ToastActionButton',
  render: 'button',
  role: 'button',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  alignSelf: 'center',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  // No REST dim. The label is $color11 — the lowest AA-safe step of the hue —
  // sitting straight on the toast fill, so it carries no headroom for a
  // multiplier: 0.9 composited every light intent under 4.5. Hover
  // and press read off the pill's own fill instead.
  outlineWidth: 0,
  pressStyle: { opacity: 0.95 },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },
});

const ToastActionPill = styled(View, {
  name: 'ToastActionPill',
  paddingHorizontal: '$2',
  alignItems: 'center',
  justifyContent: 'center',
  hoverStyle: { backgroundColor: '$color4' },
  pressStyle: { backgroundColor: '$color5' },
});

const ToastCloseTarget = styled(View, {
  name: 'ToastCloseButton',
  render: 'button',
  role: 'button',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderWidth: 0,
  alignSelf: 'flex-start',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  opacity: 0.8,
  outlineWidth: 0,
  hoverStyle: { opacity: 1 },
  pressStyle: { opacity: 0.9 },
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { opacity: 1, outlineWidth: 0 },
});

const ToastCloseRing = styled(View, {
  name: 'ToastCloseRing',
  padding: '$0.5',
  alignItems: 'center',
  justifyContent: 'center',
  // Token-valued radius: the raw `1000` never made it into the emitted CSS
  // (square ring on an intended circle); $12 (50px) is a circle at this
  // button's ≤44px box and survives the style compiler.
  borderRadius: '$12',
  hoverStyle: { backgroundColor: '$color4' },
  pressStyle: { backgroundColor: '$color5' },
});

// ── Intent wrap ───────────────────────────────────────────────

/**
 * Semantic intents ride their hue sub-theme (tint-independent). Accent stays
 * on the BASE theme: its $color9/$color11 already ride the active tint, and
 * the "accent" sub-theme is the SOLID ramp — wrong for an overlay surface.
 */
function IntentWrap({ intent, children }: { intent: ToastIntent; children: ReactNode }) {
  if (intent === 'accent') {
    return <>{children}</>;
  }
  return <Intent name={intent}>{children}</Intent>;
}

// ── Shared inner anatomy ──────────────────────────────────────

/**
 * Knob + sub-theme derived pieces shared by the standalone Toast and the
 * viewport items. Must be called INSIDE the <Intent> wrapper so the theme
 * tokens resolve on the intent hue.
 */
function useToastVisuals(intent: ToastIntent, compact?: boolean) {
  const { knobProps } = useResolvedKnobs({ intent, component: 'Toast', compact });
  if (typeof document !== 'undefined') {
    ensureCompositeFocusRing();
    ensureToastIntentEdge();
  }
  const theme = useTheme();
  const accentOnSurface = useAccentOnSurface();
  const isAccent = intent === 'accent';
  // Semantic hues: step 11 — lowest AA-safe step of the hue on the step-1/2
  // surface (resolves to a CSS var on web, concrete value on native).
  // Accent glyphs ride $accentColor, which the build holds to 4.5:1 on the
  // page surfaces in both schemes. The action label takes
  // useAccentOnSurface: the most chromatic accent step that still clears AA
  // 4.5:1 on color1/color2.
  const iconColor = (isAccent ? theme.accentColor?.get() : theme.color11?.get()) as string | undefined;
  const accentTextColor = isAccent ? accentOnSurface : '$color11';
  const size = knobProps.size;
  const iconPx = iconPxForSize(size);
  const closePx = closePxForSize(size);
  const nestedPx = knobProps.nestedControl.px;
  const labelFontSize = String(knobProps.label.fontSize);
  const descFontSize = DESC_FONT_SIZE[labelFontSize as keyof typeof DESC_FONT_SIZE] ?? knobProps.label.fontSize;
  const closeVisual = closePx + CLOSE_RING_INSET * 2;
  const closeRadius = knobProps.pointy ? 0 : '$12';
  const { elevation: _controlElevation, ...elevatedChrome } = knobProps.elevatedSurface;
  const overlayElevation = overlayElevationOf(knobProps);
  const edgeColor = (isAccent ? theme.accentBackground?.get() : theme.color9?.get()) as string | undefined;
  // Intent accent edge (solid hue) — decorative, so no AA floor. Logical
  // start so the stripe mirrors in RTL. Tamagui writes resolved styles into
  // the same style attribute and clobbers a style set on elevatedSurface
  // (SB-M-1215); we apply this LAST on the host and re-paint after commit.
  const intentEdgeStyle: CSSProperties | undefined = isWeb
    ? {
        borderInlineStartWidth: TOAST_INTENT_EDGE_PX,
        borderInlineStartStyle: 'solid',
        borderInlineStartColor: edgeColor,
      }
    : undefined;
  return {
    knobProps,
    iconColor,
    accentTextColor,
    iconPx,
    closePx,
    nestedPx,
    closeVisual,
    closeRadius,
    descFontSize,
    overlayElevation,
    edgeColor,
    intentEdgeStyle,
    dataAttrs: {
      testID: 'toast',
      'data-testid': 'toast',
      'data-size': knobProps.size,
      'data-density': knobProps.density,
      'data-nested-px': String(nestedPx),
    },
    frameProps: {
      ...elevatedChrome,
      ...knobProps.panelPadding,
      ...knobProps.gap,
      elevation: overlayElevation,
      ...(isWeb
        ? {}
        : {
            borderStartWidth: TOAST_INTENT_EDGE_PX,
            borderStartColor: isAccent ? '$accentBackground' : '$color9',
          }),
      width: 360,
      maxWidth: '100%',
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
    },
  };
}

interface ToastBodyProps {
  title: ReactNode;
  description?: ReactNode;
  intent: ToastIntent;
  iconColor?: string;
  iconPx: number;
  descFontSize: string;
  labelFontProps: KnobProps['label'];
  bodyFontProps: { fontFamily: string; fontWeight: string };
}

function ToastBody({
  title,
  description,
  intent,
  iconColor,
  iconPx,
  descFontSize,
  labelFontProps,
  bodyFontProps,
}: ToastBodyProps) {
  const Icon = intentIcons[intent];
  if (typeof title === 'string') {
    warnBannedErrorWords(title, { component: 'Toast' });
  }
  if (typeof description === 'string') {
    warnBannedErrorWords(description, { component: 'Toast' });
  }
  return (
    <>
      <View
        flexShrink={0}
        height={iconPx + 1}
        justifyContent="center"
        paddingTop={1}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no">
        <Icon size={iconPx} weight="fill" color={iconColor} />
      </View>
      <YStack flexGrow={1} flexShrink={1} gap="$1" minWidth={0} justifyContent="center">
        <SizableText {...labelFontProps} fontWeight="600" color="$color12">
          {title}
        </SizableText>
        {description != null && description !== '' && (
          <SizableText {...bodyFontProps} fontSize={descFontSize as never} color="$color11">
            {description}
          </SizableText>
        )}
      </YStack>
    </>
  );
}

interface ToastActionLabelProps {
  label: string;
  color: string;
  labelFontProps: KnobProps['label'];
}

function ToastActionLabel({ label, color, labelFontProps }: ToastActionLabelProps) {
  // Action label is weight 400. Never 500, never 600.
  // Measure the TEXT NODE — a wrapping frame's weight is not the label's.
  const inkStyle = isWeb && typeof color === 'string' && !color.startsWith('$') ? { color } : undefined;
  return (
    <SizableText {...labelFontProps} fontWeight="400" color={color as never} style={inkStyle}>
      {label}
    </SizableText>
  );
}

// ── Toast (standalone / controlled) ──────────────────────────

export interface ToastProps extends Omit<ViewProps, 'children'> {
  /** Short headline */
  title: ReactNode;
  /** Supporting copy */
  description?: ReactNode;
  /** Semantic intent — accent (default) / success / warning / error */
  intent?: ToastIntent;
  /** Optional action button (e.g. Undo) */
  action?: ToastActionOptions;
  /** Called when the close button is pressed */
  onDismiss?: () => void;
  /** Show the close button (default: true when onDismiss is provided) */
  dismissible?: boolean;
  /**
   * Compact density override. `true` forces compact (space/padding only);
   * `false` forces comfortable. Omit to follow the density knob. Size and
   * density stay independent axes.
   */
  compact?: boolean;
}

interface ToastInnerProps extends ToastProps {
  intent: ToastIntent;
}

function ToastInner({
  title,
  description,
  intent,
  action,
  onDismiss,
  dismissible,
  compact,
  ...props
}: ToastInnerProps) {
  const { t } = useTranslation();
  const {
    knobProps,
    iconColor,
    accentTextColor,
    iconPx,
    closePx,
    nestedPx,
    closeVisual,
    closeRadius,
    descFontSize,
    frameProps,
    dataAttrs,
    intentEdgeStyle,
    edgeColor,
  } = useToastVisuals(intent, compact);
  const showClose = dismissible ?? onDismiss != null;
  const spoken = spokenToastText(title, description);
  useAnnounceToast(spoken);
  const frameRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    paintToastFrame(frameRef.current, {
      size: knobProps.size,
      density: knobProps.density,
      nestedPx,
      edgeColor,
    });
  });
  const consumerStyle =
    props.style && typeof props.style === 'object' && !Array.isArray(props.style)
      ? (props.style as CSSProperties)
      : undefined;
  return (
    <XStack
      {...(isWeb
        ? {
            role: 'status' as const,
            'aria-live': 'polite' as const,
            'aria-atomic': true,
            'aria-label': spoken,
          }
        : {})}
      {...nativeToastA11y(spoken, action != null || showClose)}
      className="mp-toast"
      transition={knobProps.transition}
      {...frameProps}
      alignItems={description ? 'flex-start' : 'center'}
      {...props}
      {...dataAttrs}
      ref={frameRef as never}
      style={{ ...consumerStyle, ...intentEdgeStyle }}>
      <ToastBody
        title={title}
        description={description}
        intent={intent}
        iconColor={iconColor}
        iconPx={iconPx}
        descFontSize={descFontSize}
        labelFontProps={knobProps.label}
        bodyFontProps={knobProps.body}
      />
      {action && (
        <ToastActionTarget
          {...nativeToastControlA11y()}
          className="mp-chip-dismiss"
          {...toastActionPressProps(nestedPx)}
          aria-label={action.altText ?? action.label}
          onPress={() => {
            action.onPress();
          }}>
          <ToastActionPill
            className="mp-chip-dismiss-ring"
            {...knobProps.borderRadiusNested}
            height={nestedPx}
            minHeight={nestedPx}>
            <ToastActionLabel label={action.label} color={accentTextColor} labelFontProps={knobProps.label} />
          </ToastActionPill>
        </ToastActionTarget>
      )}
      {showClose && (
        <ToastCloseTarget
          {...nativeToastControlA11y()}
          className="mp-chip-dismiss"
          aria-label={t('Dismiss notification')}
          alignSelf={description ? 'flex-start' : 'center'}
          {...toastClosePressProps(action != null, closeVisual)}
          onPress={() => onDismiss?.()}>
          <ToastCloseRing className="mp-chip-dismiss-ring" borderRadius={closeRadius}>
            <XIcon size={closePx} color={iconColor} />
          </ToastCloseRing>
        </ToastCloseTarget>
      )}
    </XStack>
  );
}

/**
 * Presentational toast surface. Controlled: the parent owns visibility and
 * receives `onDismiss`. For the imperative/uncontrolled flow use
 * `useToast().show(...)` with a mounted <ToastViewport />.
 */
export function Toast({ intent = 'accent', ...props }: ToastProps) {
  return (
    <IntentWrap intent={intent}>
      <ToastInner intent={intent} {...props} />
    </IntentWrap>
  );
}

// ── Viewport item (imperative flow) ──────────────────────────

interface ToastItemProps {
  entry: ToastEntry;
  isTop: boolean;
  compact?: boolean;
}

function ToastItemInner({ entry, isTop, compact }: ToastItemProps) {
  const { t } = useTranslation();
  const {
    knobProps,
    iconColor,
    accentTextColor,
    iconPx,
    closePx,
    nestedPx,
    closeVisual,
    closeRadius,
    descFontSize,
    frameProps,
    dataAttrs,
    intentEdgeStyle,
    edgeColor,
  } = useToastVisuals(entry.intent, compact);
  const enterExit = { opacity: 0, y: isTop ? -16 : 16, scale: 0.97 };
  // Store-resolved policy: 0 = sticky/persistent (never auto-expires).
  const duration = entry.duration === 0 ? Number.POSITIVE_INFINITY : entry.duration;
  const assertive = entry.intent === 'error' || entry.intent === 'warning';
  const spoken = spokenToastText(entry.title, entry.description);
  useAnnounceToast(entry.open ? spoken : undefined);
  const frameRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    paintToastFrame(frameRef.current, {
      size: knobProps.size,
      density: knobProps.density,
      nestedPx,
      edgeColor,
    });
  });
  return (
    <TamaguiToast
      open={entry.open}
      onOpenChange={(open) => {
        if (!open) {
          dismissToast(entry.id);
        }
      }}
      duration={duration}
      type={assertive ? 'foreground' : 'background'}
      {...(isWeb ? { 'aria-label': spoken } : {})}
      {...nativeToastA11y(spoken, entry.action != null || entry.dismissible)}
      className="mp-toast"
      transition={knobProps.transition}
      enterStyle={enterExit}
      exitStyle={enterExit}
      {...frameProps}
      alignItems={entry.description ? 'flex-start' : 'center'}
      {...dataAttrs}
      ref={frameRef as never}
      style={intentEdgeStyle}>
      <ToastBody
        title={entry.title}
        description={entry.description}
        intent={entry.intent}
        iconColor={iconColor}
        iconPx={iconPx}
        descFontSize={descFontSize}
        labelFontProps={knobProps.label}
        bodyFontProps={knobProps.body}
      />
      {entry.action && (
        <TamaguiToast.Action altText={entry.action.altText ?? entry.action.label} asChild>
          <ToastActionTarget
            {...nativeToastControlA11y()}
            className="mp-chip-dismiss"
            {...toastActionPressProps(nestedPx)}
            // Toast.Action defaults to aria-label "Close"; announce the action.
            aria-label={entry.action.altText ?? entry.action.label}
            onPress={() => entry.action?.onPress()}>
            <ToastActionPill
              className="mp-chip-dismiss-ring"
              {...knobProps.borderRadiusNested}
              height={nestedPx}
              minHeight={nestedPx}>
              <ToastActionLabel label={entry.action.label} color={accentTextColor} labelFontProps={knobProps.label} />
            </ToastActionPill>
          </ToastActionTarget>
        </TamaguiToast.Action>
      )}
      {entry.dismissible && (
        <TamaguiToast.Close asChild>
          <ToastCloseTarget
            {...nativeToastControlA11y()}
            className="mp-chip-dismiss"
            aria-label={t('Dismiss notification')}
            {...toastClosePressProps(entry.action != null, closeVisual)}
            alignSelf={entry.description ? 'flex-start' : 'center'}>
            <ToastCloseRing className="mp-chip-dismiss-ring" borderRadius={closeRadius}>
              <XIcon size={closePx} color={iconColor} />
            </ToastCloseRing>
          </ToastCloseTarget>
        </TamaguiToast.Close>
      )}
    </TamaguiToast>
  );
}

function ToastItem(props: ToastItemProps) {
  return (
    <IntentWrap intent={props.entry.intent}>
      <ToastItemInner {...props} />
    </IntentWrap>
  );
}

// ── ToastViewport ────────────────────────────────────────────

export type ToastPlacement = 'top' | 'top-left' | 'top-right' | 'bottom' | 'bottom-left' | 'bottom-right';

export interface ToastViewportProps {
  /** Where toasts stack. Default: bottom-right on web, top on native. */
  placement?: ToastPlacement;
  /** Default auto-dismiss in ms for toasts without an explicit duration */
  duration?: number;
  /** Screen-reader label prefix for each toast */
  label?: string;
  /** Hotkey that focuses the viewport (default F8) */
  hotkey?: string[];
  /**
   * Compact density override for every stacked toast. Omit to follow the
   * density knob — size and density stay independent.
   */
  compact?: boolean;
}

const placementStyles: Record<
  ToastPlacement,
  { top?: number; bottom?: number; left?: number; right?: number; alignItems?: 'center' }
> = {
  top: { top: 16, left: 0, right: 0, alignItems: 'center' },
  'top-left': { top: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  bottom: { bottom: 16, left: 0, right: 0, alignItems: 'center' },
  'bottom-left': { bottom: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
};

function placementSwipeDirection(placement: ToastPlacement): SwipeDirection {
  if (placement.endsWith('left')) {
    return 'left';
  }
  if (placement.endsWith('right')) {
    return 'right';
  }
  return placement.startsWith('top') ? 'up' : 'down';
}

/**
 * Toast host: mounts the @tamagui/toast provider + viewport and renders the
 * store's stacked toasts. Mount once (app shell / story); a second mounted
 * viewport renders nothing (DEV warn) and takes over when the first
 * unmounts, so screen-level hosts stay safe under a shell-level one.
 * Pause-on-hover, focus management and the F8 hotkey come from the
 * underlying viewport.
 */
export function ToastViewport({
  placement = isWeb ? 'bottom-right' : 'top',
  duration = TOAST_DEFAULT_MS,
  label: labelProp,
  hotkey,
  compact,
}: ToastViewportProps) {
  const { t } = useTranslation();
  const label = labelProp ?? t('Notification');
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const { knobProps } = useResolvedKnobs();
  const isTop = placement.startsWith('top');

  // Single-viewport contract: the module-level store would render every
  // toast once per mounted viewport, so the first mounted host wins and the
  // rest no-op until it unmounts.
  const viewportId = useId();
  useEffect(() => {
    claimToastViewport(viewportId);
    return () => {
      releaseToastViewport(viewportId);
    };
  }, [viewportId]);
  const owner = useSyncExternalStore(subscribeToastViewport, getToastViewportOwner, getToastViewportOwner);
  if (owner !== viewportId) {
    return null;
  }

  const content = (
    <TamaguiToastProvider duration={duration} label={label} swipeDirection={placementSwipeDirection(placement)}>
      {toasts.map((entry) => (
        <ToastItem key={entry.id} entry={entry} isTop={isTop} compact={compact} />
      ))}
      <TamaguiToastViewport
        multipleToasts
        {...(hotkey ? { hotkey } : undefined)}
        flexDirection={isTop ? 'column-reverse' : 'column'}
        {...knobProps.gap}
        {...placementStyles[placement]}
      />
    </TamaguiToastProvider>
  );

  if (!isWeb) {
    return content;
  }

  // Web layering: the @tamagui/toast wrapper hardcodes zIndex 1e5 — the same
  // tier as sheet frames and ABOVE sheet overlays (1e5-1), so a toast card
  // could swallow scrim taps. Containing it in a zero-size stacking context
  // at the house toast tier (zIndex.loading = 1000) flattens the inner 1e5:
  // modal surfaces portaled to the root host (sheet 1e5 / dropdown 2e5)
  // paint and hit-test above every toast. position:fixed geometry inside is
  // unaffected — only paint order is contained.
  return (
    <View position="absolute" zIndex={zIndex.loading} data-testid="toast-layer">
      {content}
    </View>
  );
}
