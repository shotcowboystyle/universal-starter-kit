import {
  ensureCompositeFocusRing,
  ensureFocusVisibleRing,
  FOCUS_RING_CLIPPED_OFFSET,
  FOCUS_RING_HALO_OFFSET,
  useTouchSurface,
  isTouchSurface,
  recipeFamilies,
  resolveControlRadius,
  resolveGlyphPaint,
  SIZE_RECIPE_RADIUS_TOKEN_TO_STOP,
  sizeRecipeBoxVariants,
  sizeRecipeForToken,
  sizeRecipeIconVariants,
  sizeRecipeTypeVariants,
  textFieldInset,
  useResolvedKnobs,
  warnOutlineNone,
  warnPositiveTabIndex,
  warnSizeRecipeEscape,
} from '@repo/theme';
import type { SizeRecipeFamilyName } from '@repo/theme';
import { getFontSized } from '@tamagui/get-font-sized';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, ComponentProps, FocusEvent, ReactElement, RefObject } from 'react';
import { Pressable as RNPressable } from 'react-native';
import type {
  ColorTokens,
  FontSizeTokens,
  SizeTokens,
  InputKeyboardType,
  InputTextContentType,
  TamaguiElement,
} from 'tamagui';
import {
  Button as TButton,
  Input as TInput,
  Label,
  Text,
  View,
  XGroup,
  createStyledContext,
  getVariable,
  isWeb,
  styled,
  useGetThemedIcon,
  useTheme,
} from 'tamagui';

import { useFieldA11y, useFieldDescribedBy } from '../FieldLayout';
import { formButtonColors, formCommonColors, formInputColors } from '../shared/color-ramps';
import { useControlGrouped } from '../shared/group-context';
import { useIsInTableCell } from '../shared/table-cell-context';
import { ThemedTextArea } from '../themed-primitives';

/**
 * Native-only accessible name/hint from the field context. Web keeps its
 * audited aria-labelledby/-describedby wiring; iOS needs the strings on the
 * control itself. Spread BEFORE consumer props so an explicit
 * accessibilityLabel / aria-label ejects.
 */
const isNumber = (value: unknown): value is number => typeof value === 'number';

const isString = (value: unknown): value is string => typeof value === 'string';

const useNativeFieldA11yProps = (): { accessibilityLabel?: string; accessibilityHint?: string } | undefined => {
  const fieldA11y = useFieldA11y();
  if (isWeb || fieldA11y == null) {
    return undefined;
  }
  const { label, description } = fieldA11y;
  return {
    ...(label != null && label !== '' ? { accessibilityLabel: label } : undefined),
    ...(description != null && description !== '' ? { accessibilityHint: description } : undefined),
  };
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface InputContextValue {
  size: FontSizeTokens;
  scaleIcon: number;
  touch: boolean;
  color?: string;
}

const defaultContextValues: InputContextValue = {
  size: '$true',
  scaleIcon: 1,
  touch: !isWeb && isTouchSurface(),
};

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const InputContext = createStyledContext<InputContextValue>(defaultContextValues);

/** Square end-cap of recipe.height — generated, never handwritten. */
const endCapVariantsFromHeights = (heightVariants: Record<string, { height: number }>) =>
  Object.fromEntries(
    Object.entries(heightVariants).map(([token, { height }]) => [
      token,
      { height, width: height, paddingHorizontal: 0 as const },
    ]),
  );

const sizeRecipeEndCapVariants = endCapVariantsFromHeights(recipeFamilies.control.heightVariants);

const sizeRecipeBoxFallback = (val: SizeTokens | undefined, extras: { props: { touch?: boolean } }) => {
  const recipe = sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return {
    height: recipe.height,
    paddingHorizontal: recipe.paddingHorizontal,
    gap: recipe.gap,
  };
};

const sizeRecipeTypeFallback = (val: SizeTokens | undefined, extras: { props: { touch?: boolean } }) => ({
  fontSize: sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  }).fontSize,
});

const sizeRecipeIconFallback = (val: SizeTokens | undefined, extras: { props: { touch?: boolean } }) => {
  const { iconSize } = sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return { width: iconSize, height: iconSize };
};

const sizeRecipeEndCapFallback = (val: SizeTokens | undefined, extras: { props: { touch?: boolean } }) => {
  const { height } = sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return { height, width: height, paddingHorizontal: 0 };
};

// ---------------------------------------------------------------------------
// Focus forwarding
// ---------------------------------------------------------------------------

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const FocusContext = createStyledContext({
  setFocused: (_val: boolean) => {
    // Default outside Input.Box: nothing to focus-track.
  },
  focused: false,
});

/** Focus the target element when the trigger element receives focus. */
export const useForwardFocus = (target: RefObject<TamaguiElement | null>) => {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (focused && target.current) {
      target.current.focus();
    }
  }, [focused, target]);
  return {
    onFocus: () => {
      setFocused(true);
    },
    onBlur: () => {
      setFocused(false);
    },
    focusable: true,
  };
};

// ---------------------------------------------------------------------------
// Default group styles
// ---------------------------------------------------------------------------

/**
 * Tamagui named transitions (`quick`, etc.) compile to `transition: all …`.
 * That tweens outline-color/width on blur — in dark theme `$outlineColor` is
 * near-white, so the ring flashes white while settling. Scope the frame
 * transition to non-outline paint props instead.
 */
const inputFrameCssTimings = {
  bouncy: 'ease-in 200ms',
  lazy: 'ease-in 600ms',
  slow: 'ease-in 500ms',
  medium: 'ease-in-out 250ms',
  quick: 'ease-in 100ms',
  tooltip: 'ease-in 400ms',
  snappy: 'ease-out 80ms',
  gentle: 'ease-in-out 450ms',
} as const;

const isNamedTransition = (name: string): name is keyof typeof inputFrameCssTimings =>
  Object.hasOwn(inputFrameCssTimings, name);

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const getInputFrameTransitionProps = (
  transition: string | undefined,
): { transition: string } | { style: { transition: string } } | undefined => {
  if (transition === undefined || transition === '') {
    return undefined;
  }
  if (!isWeb) {
    return { transition };
  }
  const timing = isNamedTransition(transition) ? inputFrameCssTimings[transition] : inputFrameCssTimings.quick;
  return {
    // Prefer explicit CSS over Tamagui's `transition: all` named prop.
    style: {
      transition: [
        `background-color ${timing}`,
        `border-color ${timing}`,
        `color ${timing}`,
        `opacity ${timing}`,
        `box-shadow ${timing}`,
        `transform ${timing}`,
      ].join(', '),
    },
  };
};

/** Resting outline: transparent + 0 width so blur never lands on theme `$outlineColor`. */
const inputOutlineRest = {
  outlineWidth: 0,
  outlineColor: 'transparent',
  outlineStyle: 'solid',
} as const;

const inputOutlineFocus = {
  outlineColor: '$outlineColor',
  outlineWidth: 2,
  outlineStyle: 'solid',
  // Inset: Input.Box clips children with overflow:hidden; an outer +2px
  // ring is severed (clipping carve-out).
  outlineOffset: -2,
} as const;

/**
 * Field anatomy (Polaris Connected / Primer TextInputWrapper / Spectrum):
 * one painted Box owns border + radius + ring; Icon/prefix/suffix live inside
 * it; Area is chromeless. Primer: `overflow:hidden` on the wrapper ⇒ inset
 * outline. Polaris: connected adornments sit inside the ring-carrying box.
 * Spectrum: inner input `outline: none`. Tamagui/RN-web drops `className` on
 * XGroup, so the ring keys off `data-mp-*` (not a class).
 */
const AREA_NO_OUTLINE = {
  outlineWidth: 0,
  outlineStyle: 'none' as const,
  outlineColor: 'transparent',
} as const;

type BoxOverflow = 'hidden' | 'visible';

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const boxRingMode = (overflow: BoxOverflow, paintsRing: boolean): 'inset' | 'outset' | undefined => {
  if (!paintsRing) {
    return undefined;
  }
  return overflow === 'hidden' ? 'inset' : 'outset';
};

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const boxRingOffset = (mode: 'inset' | 'outset' | undefined): number =>
  // Both branches are sanctioned offsets: the clipping inset when the
  // Box clips its adornments, the shape halo when it does not.
  mode === 'outset' ? FOCUS_RING_HALO_OFFSET : FOCUS_RING_CLIPPED_OFFSET;

export const inputPartsRingCss = `/* LC-71: ring on Box (adornments inside); Area never outlines.
   Inset iff the Box clips (overflow:hidden). Do not :has(:focus-visible) on
   every descendant — SearchInput clear ✕ is a second focusable. */
[data-mp-input-box][data-mp-ring="inset"]:has(input:focus),
[data-mp-input-box][data-mp-ring="inset"]:has(textarea:focus),
[data-mp-input-box][data-mp-ring="inset"]:has([data-mp-input-area]:focus),
[data-mp-input-box][data-mp-ring="inset"]:focus-visible {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText)) !important;
  outline-offset: -2px !important;
}
[data-mp-input-box][data-mp-ring="outset"]:has(input:focus),
[data-mp-input-box][data-mp-ring="outset"]:has(textarea:focus),
[data-mp-input-box][data-mp-ring="outset"]:has([data-mp-input-area]:focus),
[data-mp-input-box][data-mp-ring="outset"]:focus-visible {
  outline: 2px solid var(--outlineColor, var(--c-outlineColor, CanvasText)) !important;
  outline-offset: 2px !important;
}
[data-mp-input-area],
[data-mp-input-area]:focus,
[data-mp-input-area]:focus-visible,
[data-mp-input-box] input,
[data-mp-input-box] textarea,
[data-mp-input-box] [contenteditable] {
  outline: none !important;
  box-shadow: none !important;
}
/* LC-84: Area is chromeless. Zero UA pad on the single-line input only —
   textarea keeps ThemedTextArea's equal padX/padY inset. */
input[data-mp-input-area] {
  padding: 0 !important;
}`;

const INPUT_PARTS_RING_STYLE_ID = 'mp-input-parts-ring-anatomy';

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const ensureInputPartsFocusRing = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${INPUT_PARTS_RING_STYLE_ID}`)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = INPUT_PARTS_RING_STYLE_ID;
  tag.textContent = inputPartsRingCss;
  document.head.append(tag);
};

interface WebBoxRingAttrs {
  className?: string;
  'data-mp-input-box': 'true';
  'data-mp-ring'?: 'inset' | 'outset';
}

interface WebAreaAttrs {
  className: string;
  'data-mp-input-area': 'true';
}

const webBoxRingAttrs = (
  overflow: BoxOverflow,
  paintsRing: boolean,
  extraClass?: string,
): WebBoxRingAttrs | undefined => {
  if (!isWeb) {
    return undefined;
  }
  const mode = boxRingMode(overflow, paintsRing);
  const className = [paintsRing ? 'mp-composite-ring' : undefined, extraClass].filter(Boolean).join(' ');
  return {
    ...(className === '' ? undefined : { className }),
    'data-mp-input-box': 'true',
    ...(mode === undefined ? undefined : { 'data-mp-ring': mode }),
  };
};

const webAreaAttrs = (extraClass?: string): WebAreaAttrs | undefined => {
  if (!isWeb) {
    return undefined;
  }
  const className = ['mp-input-area', extraClass].filter(Boolean).join(' ');
  return {
    className,
    'data-mp-input-area': 'true',
  };
};

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const defaultInputGroupStyles = {
  size: '$true',
  fontFamily: '$body',
  borderWidth: 1,
  color: '$color',

  ...(isWeb
    ? {
        tabIndex: -1,
      }
    : {
        focusable: false,
      }),

  borderColor: formInputColors.border.base,
  backgroundColor: formInputColors.background.base,

  minWidth: 0,
  ...inputOutlineRest,

  hoverStyle: {
    borderColor: formInputColors.border.hover,
  },

  // Any-focus only shifts the border. The ring lives on
  // `focusVisibleStyle` and on `[data-mp-ring]:has(input:focus)` so
  // button-like Boxes (Select, pagination) do not ring on mouse click.
  focusStyle: {
    borderColor: formInputColors.border.focus,
  },

  focusVisibleStyle: {
    borderColor: formInputColors.border.focus,
    ...inputOutlineFocus,
  },
} as const;

// ---------------------------------------------------------------------------
// Input.Box  (XGroup wrapper with focus management)
// ---------------------------------------------------------------------------

/**
 * Input.Box — size-recipe family is `control` (same as Button).
 * Named family tables; `sizeRecipe*Variants` remain the generated aliases.
 */
const InputGroupFrame = styled(XGroup, {
  justifyContent: 'space-between',
  alignItems: 'center',
  context: InputContext,
  overflow: 'hidden',
  // className on XGroup is best-effort (often dropped). The styleable
  // spread stamps data-mp-input-box / data-mp-ring; CSS keys off those.
  ...(isWeb ? { className: 'mp-composite-ring' } : undefined),

  variants: {
    touch: { true: {}, false: {} },
    unstyled: {
      false: defaultInputGroupStyles,
    },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      ...(recipeFamilies.control.boxVariants ?? sizeRecipeBoxVariants),
      '...size': sizeRecipeBoxFallback,
    },
  } as const,
  defaultVariants: {
    unstyled: process.env.TAMAGUI_HEADLESS === '1',
  },
});

/**
 * Fabric + Tamagui XGroup often claims the responder without firing `onPress`,
 * so Select/Date/Combobox triggers look tappable but never open. On native,
 * own the gesture with a core RN Pressable and disable hit-testing on the
 * XGroup chrome (buttons that must stay tappable — clear, chip dismiss —
 * should sit outside InputParts.Box, e.g. FloatingPanel triggerEnd).
 */
type PressHandler = ComponentProps<typeof RNPressable>['onPress'];

const wrapNativePressable = (node: ReactElement, onPress?: PressHandler, disabled = false): ReactElement => {
  if (isWeb || !onPress) {
    return node;
  }
  return (
    <RNPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={disabled ? { opacity: 0.5 } : undefined}>
      <View
        pointerEvents="none"
        collapsable={false}
        width="100%">
        {node}
      </View>
    </RNPressable>
  );
};

type FrameSizeProps = Pick<ComponentProps<typeof InputGroupFrame>, 'height' | 'paddingHorizontal'>;

type RadiusKnob = ReturnType<typeof useResolvedKnobs>['knobProps']['borderRadius']['borderRadius'];

const isRadiusToken = (token: RadiusKnob): token is keyof typeof SIZE_RECIPE_RADIUS_TOKEN_TO_STOP =>
  Object.hasOwn(SIZE_RECIPE_RADIUS_TOKEN_TO_STOP, token);

/** Medium (size-table) corners; undefined when the knob picked another radius stop. */
const resolveTableRadius = (
  radiusToken: RadiusKnob,
  sizeToken: string,
  family: SizeRecipeFamilyName,
): { borderRadius: number } | undefined => {
  const radiusStop = isRadiusToken(radiusToken) ? SIZE_RECIPE_RADIUS_TOKEN_TO_STOP[radiusToken] : undefined;
  if (radiusStop !== undefined && radiusStop !== 'medium') {
    return undefined;
  }
  return {
    borderRadius: resolveControlRadius(sizeRecipeForToken(sizeToken, { family }), 'medium').radius,
  };
};

const resolveBoxOverflow = (paintsRing: boolean, hasElevation: boolean, hasWebPressSlop: boolean): BoxOverflow => {
  const elevationClipsShadow = hasElevation && !isWeb;
  return paintsRing && !elevationClipsShadow && !hasWebPressSlop ? 'hidden' : 'visible';
};

/** Splits explicit numeric height/padding (escape hatch) from pass-through values. */
const resolveSizeOverrides = (
  { height, paddingHorizontal }: FrameSizeProps,
  sizeRecipeEscape: string | undefined,
  fieldInset: number,
) => {
  const escaped = sizeRecipeEscape !== undefined && sizeRecipeEscape.trim().length > 0;
  const paddingPassesThrough = !isNumber(paddingHorizontal) && paddingHorizontal != null;
  return {
    escapeOverride: escaped
      ? {
          ...(isNumber(height) ? { height } : undefined),
          ...(isNumber(paddingHorizontal) ? { paddingHorizontal } : undefined),
        }
      : undefined,
    passthrough: {
      ...(!isNumber(height) && height != null ? { height } : undefined),
      ...(paddingPassesThrough ? { paddingHorizontal } : undefined),
    },
    insetPad: escaped || paddingPassesThrough ? undefined : { paddingHorizontal: fieldInset },
  };
};

// Covered by an overlay panel (see `suppressFocusRing` doc): keep the focus
// border color but draw no ring on either focus path. This is an intentional
// a11y exception: the open panel is the focus affordance while it covers this
// box. Hoisted so the JSX spread does not re-specify focusStyle /
// focusVisibleStyle literally (TS2783 under the build tsconfig).
const SUPPRESSED_RING_PROPS = {
  focusStyle: { borderColor: formInputColors.border.focus, ...inputOutlineRest },
  focusVisibleStyle: {
    borderColor: formInputColors.border.focus,
    ...inputOutlineRest,
  },
};

type ResolvedControl = ReturnType<typeof useResolvedKnobs>['control'];

const resolveFocusRingProps = (ringed: boolean, control: ResolvedControl, ringMode: ReturnType<typeof boxRingMode>) =>
  ringed
    ? {
        // Text-entry carve-out: inner Area focus means typing
        // is next, so the Box rings on any focus — including click.
        // CSS `[data-mp-ring]` is the sync path; this is the token-
        // resolved backup (and the native path). Button-like Boxes
        // (Select) do not set `focused` (no Area onFocus).
        borderColor: formInputColors.border.focus,
        ...ensureFocusVisibleRing({
          ...inputOutlineFocus,
          ...control.focusKnobProps,
          ...control.focusVisibleKnobProps,
          outlineOffset: boxRingOffset(ringMode),
        }),
      }
    : {
        // Explicit rest — avoid leaving theme `$outlineColor` (near-white in
        // dark) as the computed outline-color while width settles.
        // Keep outline-transparent rest (border-flicker fix); do not warn.
        ...inputOutlineRest,
      };

const InputGroupImpl = InputGroupFrame.styleable<{
  /**
   * OVERLAY_ANCHOR_GAP rule (theme/layoutTokens) — one surface owner per
   * overlay: while a floating panel intentionally covers this box (Select's
   * macOS-style listbox), the box must not paint its focus ring. The ring
   * sits outside the border box (outline + offset), so a covering panel can
   * never hide it — it ghosts around the panel's corners as a doubled edge.
   */
  suppressFocusRing?: boolean;
  /**
   * Size-recipe family. Input stays on `"control"` (same as Button default).
   * No per-input tweaks.
   */
  recipeFamily?: SizeRecipeFamilyName;
  /**
   * Opt-in to an explicit numeric `height` / `paddingHorizontal`. Required
   * when those props are numbers; without it DEV-warns `size-recipe-escape`
   * and the size recipe still wins.
   */
  sizeRecipeEscape?: string;
  onPress?: PressHandler;
  disabled?: boolean;
  'data-mp-press-slop'?: string;
}>((groupProps, forwardedRef) => {
  const {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- tamagui types styled-component `children` as any
    children,
    onPress,
    disabled,
    suppressFocusRing,
    recipeFamily = 'control',
    sizeRecipeEscape,
    height: heightProp,
    paddingHorizontal: paddingHorizontalProp,
    ...props
  } = groupProps;
  const [focused, setFocused] = useState(false);
  const hydrationTouch = useTouchSurface();
  const { knobProps, control, disabledState } = useResolvedKnobs();
  const grouped = useControlGrouped();
  const inTableCell = useIsInTableCell();
  // Native Pressable owns onPress; do not also pass it to XGroup (double-fire).
  const framePressProps = isWeb ? { onPress, disabled } : { disabled };
  // Standalone Box clips children to radius → inset ring. Grouped / in-cell
  // frames leave overflow visible and do not paint their own ring.
  // On native, an elevation token must not share a clipsToBounds layer
  // with the shadow (iOS masks the layer's own drop shadow). Web box-shadow
  // paints outside overflow:hidden, so the ring clip can stay.
  const paintsRing = !grouped && !inTableCell;
  const hasWebPressSlop = isWeb && props['data-mp-press-slop'] != null;
  const boxOverflow = resolveBoxOverflow(paintsRing, knobProps.elevation != null, hasWebPressSlop);
  const ringMode = boxRingMode(boxOverflow, paintsRing);
  if (isWeb) {
    ensureCompositeFocusRing();
    ensureInputPartsFocusRing();
  }
  const boxRingAttrs = webBoxRingAttrs(boxOverflow, paintsRing, props.className);

  // DEV guardrails (tree-shaken in production).
  warnPositiveTabIndex({
    value: props.tabIndex,
    component: 'Input.Box',
  });
  const focusVisibleStyle: object | undefined = props.focusVisibleStyle ?? undefined;
  warnOutlineNone(focusVisibleStyle, {
    component: 'Input.Box',
  });
  warnSizeRecipeEscape({
    height: heightProp,
    paddingHorizontal: paddingHorizontalProp,
    sizeRecipeEscape,
    component: 'Input.Box',
    id: isString(props.id) ? props.id : undefined,
  });
  const sizeToken = String(props.size ?? knobProps.sizeToken);
  const familyRecipe = sizeRecipeForToken(sizeToken, {
    touch: hydrationTouch,
    family: recipeFamily,
  });
  const controlFragment =
    recipeFamily === 'control' && sizeToken === knobProps.sizeToken
      ? knobProps.control
      : {
          height: familyRecipe.height,
          paddingHorizontal: familyRecipe.paddingHorizontal,
          gap: familyRecipe.gap,
        };
  const sizeTableRadius = resolveTableRadius(knobProps.borderRadius.borderRadius, sizeToken, recipeFamily);
  // Text-field inset, not the button ladder padX. Multiline Box
  // (height="auto") leaves padX to ThemedTextArea so padX === padY.
  const fieldInset = heightProp === 'auto' ? 0 : textFieldInset(familyRecipe);
  const {
    escapeOverride: sizeRecipeEscapeOverride,
    passthrough: passthroughSizeProps,
    insetPad: insetPadProps,
  } = resolveSizeOverrides(
    { height: heightProp, paddingHorizontal: paddingHorizontalProp },
    sizeRecipeEscape,
    fieldInset,
  );

  // Chromeless rendering inside table cells
  if (inTableCell) {
    return (
      <FocusContext.Provider
        focused={focused}
        setFocused={setFocused}>
        {wrapNativePressable(
          <InputGroupFrame
            touch={hydrationTouch}
            ref={forwardedRef}
            borderWidth={0}
            borderRadius={0}
            backgroundColor="transparent"
            // Expanded (not the `flex` shorthand): the shorthand's basis-0
            // beats consumer width/flex overrides in the merge, collapsing
            // fixed-size boxes (OTP digit cells) to 0pt inside row layouts.
            // Basis auto keeps explicit widths as the base; lone inputs in
            // column cells still grow to fill exactly as before.
            flexGrow={1}
            flexShrink={1}
            flexBasis="auto"
            // The chromeless frame must never lay out
            // wider than its cell — cap at the cell width and allow shrink
            // below the inner input's intrinsic width.
            maxWidth="100%"
            minWidth={0}
            elevation={undefined}
            {...props}
            {...controlFragment}
            {...passthroughSizeProps}
            {...insetPadProps}
            {...sizeRecipeEscapeOverride}
            {...framePressProps}
            {...boxRingAttrs}
            overflow={boxOverflow}>
            {children}
          </InputGroupFrame>,
          onPress,
          disabled,
        )}
      </FocusContext.Provider>
    );
  }

  if (grouped) {
    return wrapNativePressable(
      <InputGroupFrame
        touch={hydrationTouch}
        ref={forwardedRef}
        borderWidth={0}
        borderRadius={0}
        backgroundColor="transparent"
        flex={1}
        elevation={undefined}
        {...props}
        {...passthroughSizeProps}
        {...insetPadProps}
        {...sizeRecipeEscapeOverride}
        {...framePressProps}
        {...boxRingAttrs}
        overflow={boxOverflow}>
        {children}
      </InputGroupFrame>,
      onPress,
      disabled,
    );
  }

  const suppressedRingProps = suppressFocusRing ? SUPPRESSED_RING_PROPS : undefined;

  return (
    <FocusContext.Provider
      focused={focused}
      setFocused={setFocused}>
      {wrapNativePressable(
        <InputGroupFrame
          touch={hydrationTouch}
          ref={forwardedRef}
          {...knobProps.body}
          size={knobProps.sizeToken}
          {...controlFragment}
          backgroundColor={knobProps.inputBackground}
          // oxlint-disable-next-line sonarjs/no-undefined-assignment -- explicit undefined clears a prop-level elevation; null would not
          {...(knobProps.elevation == null ? { elevation: undefined } : knobProps.elevationChrome)}
          {...knobProps.borderRadius}
          {...sizeTableRadius}
          {...getInputFrameTransitionProps(isString(knobProps.transition) ? knobProps.transition : undefined)}
          hoverStyle={{
            borderColor: formInputColors.border.hover,
            ...control.hoverKnobProps,
          }}
          pressStyle={{
            ...control.pressKnobProps,
          }}
          focusStyle={{
            borderColor: formInputColors.border.focus,
            ...control.focusKnobProps,
          }}
          focusVisibleStyle={ensureFocusVisibleRing({
            borderColor: formInputColors.border.focus,
            ...inputOutlineFocus,
            ...control.focusVisibleKnobProps,
            outlineOffset: boxRingOffset(ringMode),
          })}
          {...props}
          {...passthroughSizeProps}
          {...insetPadProps}
          {...sizeRecipeEscapeOverride}
          {...framePressProps}
          {...boxRingAttrs}
          {...resolveFocusRingProps(focused && !suppressFocusRing, control, ringMode)}
          {...suppressedRingProps}
          // DISABLED-VISIBLE: the input frame is text-bearing chrome —
          // keepLabel washes fill/border (value text keeps >= AA) and
          // dimWhole leaves the dim to the FieldLayout assembly. Read-only
          // never reaches this branch (a different state, never dimmed).
          {...(disabled
            ? {
                ...disabledState.surfaceKnobProps,
                hoverStyle: { ...disabledState.surfaceKnobProps },
              }
            : undefined)}
          overflow={boxOverflow}>
          {children}
        </InputGroupFrame>,
        onPress,
        disabled,
      )}
    </FocusContext.Provider>
  );
});

// ---------------------------------------------------------------------------
// Input size variant helper
// ---------------------------------------------------------------------------

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const KEYBOARD_TO_INPUT_MODE = {
  'phone-pad': 'tel',
  'number-pad': 'numeric',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  numeric: 'numeric',
} as const;

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const INPUT_MODE_TO_KEYBOARD = {
  tel: 'phone-pad',
  numeric: 'number-pad',
  decimal: 'decimal-pad',
  email: 'email-address',
} as const;

/**
 * The inputMode values the keyboard map produces. A subset of the DOM/RN inputMode union,
 * derived from the table rather than restated, so the two cannot drift.
 */
export type MappedInputMode = (typeof KEYBOARD_TO_INPUT_MODE)[keyof typeof KEYBOARD_TO_INPUT_MODE];

/** The keyboardType values the keyboard map produces. A subset of tamagui's InputKeyboardType. */
export type MappedKeyboardType = (typeof INPUT_MODE_TO_KEYBOARD)[keyof typeof INPUT_MODE_TO_KEYBOARD];

/**
 * Every inputMode the underlying Input accepts, read off the component rather
 * than restated. Wider than MappedInputMode: the table only produces
 * four of these, but a consumer may pass "text", "url" or "search" directly,
 * and typing the read as the narrow set would be a lie about what arrives.
 */
export type InputModeValue = ComponentProps<typeof TInput>['inputMode'];

const isKeyboardType = (value: string): value is keyof typeof KEYBOARD_TO_INPUT_MODE =>
  Object.hasOwn(KEYBOARD_TO_INPUT_MODE, value);

const isInputMode = (value: string): value is keyof typeof INPUT_MODE_TO_KEYBOARD =>
  Object.hasOwn(INPUT_MODE_TO_KEYBOARD, value);

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const mapKeyboardTypeToInputMode = (keyboardType?: string): MappedInputMode | undefined => {
  if (keyboardType === undefined || !isKeyboardType(keyboardType)) {
    return undefined;
  }
  return KEYBOARD_TO_INPUT_MODE[keyboardType];
};

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const mapInputModeToKeyboardType = (inputMode?: string): MappedKeyboardType | undefined => {
  if (inputMode === undefined || !isInputMode(inputMode)) {
    return undefined;
  }
  return INPUT_MODE_TO_KEYBOARD[inputMode];
};

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const inputSizeVariant = (val: SizeTokens | undefined, extras?: { props: { touch?: boolean } }) => {
  const recipe = sizeRecipeForToken(val === undefined || val === '' ? '$true' : String(val), {
    touch: extras?.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return {
    fontSize: recipe.fontSize,
    // Area is chromeless — inset lives on Input.Box / ThemedTextArea.
    paddingHorizontal: 0,
  };
};

// ---------------------------------------------------------------------------
// Input.Area  (actual text input — unstyled Tamagui Input)
// ---------------------------------------------------------------------------

const InputFrame = styled(TInput, {
  unstyled: true,
  context: InputContext,
  // The Area never paints a ring. Chrome's UA :focus-visible outline
  // on <input> is the "ring cuts the control in half" defect (magnifier sits
  // outside). Kill it at rest and on focus; the Box owns the ring.
  // Area is chromeless — pad lives on Box (or ThemedTextArea).
  padding: 0,
  paddingHorizontal: 0,
  paddingVertical: 0,
  outlineWidth: 0,
  outlineStyle: 'none',
  outlineColor: 'transparent',
  ...(isWeb ? { className: 'mp-input-area' } : undefined),
  focusStyle: {
    outlineWidth: 0,
    outlineStyle: 'none',
    outlineColor: 'transparent',
  },
  focusVisibleStyle: {
    outlineWidth: 0,
    outlineStyle: 'none',
    outlineColor: 'transparent',
  },
  variants: {
    touch: { true: {}, false: {} },
    size: {
      ...(recipeFamilies.control.typeVariants ?? sizeRecipeTypeVariants),
      '...size': sizeRecipeTypeFallback,
    },
    scaleIcon: {
      ':number': () => ({}),
    },
  } as const,
});

const isObjectLike = (value: unknown): value is object => typeof value === 'object' && value !== null;

interface AreaChangeEvent {
  target?: EventTarget | number | null;
  nativeEvent?: Event | { text?: string };
}

/** Web: `target.value`. Native: `nativeEvent.text`. */
const readChangeText = ({ target, nativeEvent }: AreaChangeEvent): string => {
  if (isObjectLike(target) && 'value' in target && isString(target.value)) {
    return target.value;
  }
  return isObjectLike(nativeEvent) && 'text' in nativeEvent && isString(nativeEvent.text) ? nativeEvent.text : '';
};

const AUTO_COMPLETE_BY_CONTENT_TYPE = {
  emailAddress: 'email',
  password: 'current-password',
  telephoneNumber: 'tel',
  oneTimeCode: 'one-time-code',
} as const;

const hasAutoComplete = (
  textContentType: InputTextContentType | undefined,
): textContentType is keyof typeof AUTO_COMPLETE_BY_CONTENT_TYPE =>
  textContentType !== undefined && Object.hasOwn(AUTO_COMPLETE_BY_CONTENT_TYPE, textContentType);

const autoCompleteFor = (textContentType: InputTextContentType | undefined) =>
  hasAutoComplete(textContentType) ? AUTO_COMPLETE_BY_CONTENT_TYPE[textContentType] : undefined;

type AreaDims = Pick<
  ComponentProps<typeof InputFrame>,
  'flex' | 'width' | 'minWidth' | 'maxWidth' | 'height' | 'minHeight' | 'maxHeight'
>;

/** Duration (and any Area with a numeric width / flex 0) must not sit inside a flex:1 wrapper. */
const areaWrapperProps = (
  { flex, width, minWidth, maxWidth, height, minHeight, maxHeight }: AreaDims,
  inTableCell: boolean,
) => {
  const hugWidth = flex === 0 || isNumber(width);
  return {
    flex: hugWidth ? 0 : 1,
    ...(hugWidth && isNumber(width)
      ? {
          width,
          minWidth: minWidth ?? width,
          maxWidth: maxWidth ?? width,
        }
      : undefined),
    ...(height == null ? undefined : { height, minHeight: minHeight ?? 0, maxHeight }),
    ...(inTableCell ? { minWidth: 0 } : undefined),
  };
};

const areaDimensionProps = ({ flex, width, minWidth, maxWidth, height, minHeight, maxHeight }: AreaDims) => ({
  ...(flex == null ? undefined : { flex }),
  ...(width == null ? undefined : { width, minWidth, maxWidth }),
  ...(height == null ? undefined : { height, minHeight, maxHeight }),
});

/** Beat the UA / `$true` 44px min on <input> when a recipe height is set (Duration size:$3 is 36; a 44 input overflows the box). */
const areaHeightStyle = ({ height, minHeight, maxHeight }: AreaDims) =>
  isWeb && isNumber(height)
    ? {
        style: {
          height,
          minHeight: isNumber(minHeight) ? minHeight : 0,
          maxHeight: isNumber(maxHeight) ? maxHeight : height,
        },
      }
    : undefined;

const InputAreaImpl = InputFrame.styleable<{
  secureTextEntry?: boolean;
  keyboardType?: InputKeyboardType;
  textContentType?: InputTextContentType;
  onChangeText?: (text: string) => void;
}>((areaProps, ref) => {
  const { setFocused } = FocusContext.useStyledContext();
  const hydrationTouch = useTouchSurface();
  const { size } = InputContext.useStyledContext();
  const {
    secureTextEntry,
    keyboardType,
    textContentType,
    onChangeText,
    onChange: onChangeProp,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    focusStyle: focusStyleProp,
    focusVisibleStyle: focusVisibleStyleProp,
    className: classNameProp,
    inputMode: inputModeProp,
    flex: flexProp,
    width: widthProp,
    minWidth: minWidthProp,
    maxWidth: maxWidthProp,
    height: heightProp,
    minHeight: minHeightProp,
    maxHeight: maxHeightProp,
    ...props
  } = areaProps;
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const fieldDescribedBy = useFieldDescribedBy();
  const nativeA11yProps = useNativeFieldA11yProps();
  const inTableCell = useIsInTableCell();
  // SAFETY: theme values are resolved color strings; the prop type lists only color tokens but RN/RN-web accept any color string
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const placeholderTextColor = (
    isString(theme.placeholderColor?.val) ? theme.placeholderColor.val : '$placeholderColor'
  ) as ColorTokens;
  if (isWeb) {
    ensureInputPartsFocusRing();
  }
  // Do not strip native keyboard hints. Map phone-pad↔tel,
  // number-pad↔numeric, decimal-pad↔decimal, email-address↔email.
  const resolvedInputMode = inputModeProp ?? mapKeyboardTypeToInputMode(keyboardType);
  const resolvedKeyboardType = keyboardType ?? mapInputModeToKeyboardType(resolvedInputMode);
  // A hugging Area (numeric width / flex 0) skips the flex:1 wrapper — that
  // wrapper grows with the Box, then Section's justifyContent:center floats
  // the cluster in the leftover space. OTP still pins width on Box, not Area,
  // so it keeps the grow wrapper.
  const dims: AreaDims = {
    flex: flexProp,
    width: widthProp,
    minWidth: minWidthProp,
    maxWidth: maxWidthProp,
    height: heightProp,
    minHeight: minHeightProp,
    maxHeight: maxHeightProp,
  };

  return (
    // In a table cell the flex wrapper and the raw
    // input must be allowed to shrink below the <input>'s intrinsic width
    // (min-width:auto floors flex items at it); width 100% makes the input
    // adopt the flexed width instead of its size-attribute default. Explicit
    // consumer widths (OTP digit boxes) still win via the later spread.
    <View {...areaWrapperProps(dims, inTableCell)}>
      <InputFrame
        touch={hydrationTouch}
        aria-describedby={fieldDescribedBy}
        {...nativeA11yProps}
        ref={ref}
        size={size}
        {...knobProps.controlType}
        color={knobProps.textAccentColor}
        placeholderTextColor={placeholderTextColor}
        {...(inTableCell ? { width: '100%' as const, minWidth: 0 } : undefined)}
        {...knobProps.body}
        type={secureTextEntry ? 'password' : props.type}
        padding={0}
        // size-recipe-escape: zero-reset — Input.Box owns the inset; the inner field paints no padding
        paddingHorizontal={0}
        paddingVertical={0}
        keyboardType={resolvedKeyboardType}
        textContentType={textContentType}
        inputMode={resolvedInputMode}
        autoComplete={autoCompleteFor(textContentType)}
        {...props}
        {...areaDimensionProps(dims)}
        {...webAreaAttrs(classNameProp)}
        {...areaHeightStyle(dims)}
        {...AREA_NO_OUTLINE}
        focusStyle={{ ...focusStyleProp, ...AREA_NO_OUTLINE }}
        focusVisibleStyle={{ ...focusVisibleStyleProp, ...AREA_NO_OUTLINE }}
        onFocus={(e: FocusEvent<HTMLDivElement>) => {
          setFocused(true);
          onFocusProp?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLDivElement>) => {
          setFocused(false);
          onBlurProp?.(e);
        }}
        onChange={
          onChangeText || onChangeProp
            ? (e: ChangeEvent<HTMLDivElement>) => {
                onChangeText?.(readChangeText(e));
                onChangeProp?.(e);
              }
            : undefined
        }
      />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Input.Section  (XGroup.Item wrapper)
// ---------------------------------------------------------------------------

const InputSection = styled(XGroup.Item, {
  justifyContent: 'center',
  alignItems: 'center',
  context: InputContext,
  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
  } as const,
});

// ---------------------------------------------------------------------------
// Input.Button
// ---------------------------------------------------------------------------

const InputButton = styled(TButton, {
  context: InputContext,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: 0,

  hoverStyle: {
    backgroundColor: formButtonColors.background.hover,
  },
  pressStyle: {
    backgroundColor: formButtonColors.background.active,
  },

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      ...sizeRecipeEndCapVariants,
      '...size': sizeRecipeEndCapFallback,
    },
  } as const,
});

/**
 * RING-ANATOMY / ONE-TAB-STOP — the `glyphRing` end cap.
 *
 * A bare Input.Button is DECORATIVE: the Box rings for it and it takes no
 * tab stop of its own (Stepper carets, Select/Combobox chevrons). Pass
 * `glyphRing` to promote it to the field's SECOND focusable — the Password
 * reveal, the CopyField copy — where it must ring its own GLYPH, not the
 * 44px hit box. A band on the box would double with the Box's composite
 * ring; a band on the glyph is the chip-dismiss recipe
 * (`.mp-chip-dismiss` + `.mp-chip-dismiss-ring`, keyboardFocusRing.ts).
 *
 * It renders a View rather than TButton because TButton swallows a consumer
 * className and pins its own tabIndex, so the ring class never reaches the
 * node that actually receives focus. SearchInput hand-rolled exactly this
 * pair for that reason (fields/SearchInput/index.tsx:348-380) and left a
 * note saying the classes "cannot ride Input.Button until glyphRing" lands.
 * This is that pair made reusable, so the square comes from the size recipe
 * instead of every call site measuring its own.
 */
const InputGlyphButton = styled(View, {
  name: 'InputGlyphButton',
  context: InputContext,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: 0,
  cursor: 'pointer',
  flexShrink: 0,
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0 },
  focusVisibleStyle: { outlineWidth: 0 },

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      ...sizeRecipeEndCapVariants,
      '...size': sizeRecipeEndCapFallback,
    },
  } as const,
});

const InputButtonImpl = InputButton.styleable<{ glyphRing?: boolean }>((buttonProps, ref) => {
  const {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- tamagui types styled-component `children` as any
    children,
    color: colorProp,
    glyphRing,
    size: sizeProp,
    tabIndex: tabIndexProp,
    className,
    ...props
  } = buttonProps;
  const { size: contextSize, color: contextColor } = InputContext.useStyledContext();
  const hydrationTouch = useTouchSurface();
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const size = sizeProp ?? contextSize;
  const paint = resolveGlyphPaint(theme, isString(colorProp) ? colorProp : contextColor);
  const getThemedIcon = useGetThemedIcon({
    size: knobProps.controlIcon.width,
    color: paint,
  });
  // A string/number child is a LABEL, not an icon. `getThemedIcon` treats an
  // un-elemented child as a component TYPE and `createElement`s it, so "Scan"
  // becomes an invented `<scan>` element that paints nothing; a bare
  // string under the glyphRing View is the same category error on native.
  const textChild =
    isString(children) || isNumber(children) ? (
      <Text
        {...knobProps.controlType}
        fontFamily={knobProps.body.fontFamily}
        fontWeight={knobProps.body.fontWeight}
        color={paint}
        numberOfLines={1}
        userSelect="none">
        {children}
      </Text>
    ) : null;
  const decorativeRef = useCallback(
    (node: TamaguiElement | null) => {
      // Tamagui 2.7.6 Button stamps tabIndex=0 after consumer props.
      // Correct the host at hydration; decorative caps share the field stop.
      if (isWeb && node && 'tabIndex' in node) {
        node.tabIndex = Number(tabIndexProp ?? -1);
      }
      if (ref != null) {
        if ('current' in ref) {
          ref.current = node;
        } else {
          ref(node);
        }
      }
    },
    [ref, tabIndexProp],
  );

  if (glyphRing) {
    // A real tab stop must square off the token it was HANDED, not the
    // knob's: a $2 field inside a $4 knob would otherwise ship a 44px stop
    // on a 32px frame. The picker trigger contract keeps the sub-floor case pressable via the
    // caller's hitSlop, never by inflating the cap.
    const square = sizeRecipeForToken(String(size), { touch: hydrationTouch }).height;
    const disabled = props.disabled === true;
    if (isWeb) {
      ensureCompositeFocusRing();
    }
    return (
      <InputGlyphButton
        touch={hydrationTouch}
        ref={ref}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View, not a DOM element: `role` maps to the native accessibilityRole too
        role="button"
        size={size}
        height={square}
        width={square}
        // size-recipe-escape: square end-cap; pad lives on Input.Box
        paddingHorizontal={0}
        opacity={disabled ? 0.5 : 1}
        {...props}
        aria-disabled={disabled || undefined}
        tabIndex={Number(tabIndexProp ?? (disabled ? -1 : 0))}
        className={isWeb ? ['mp-chip-dismiss', className].filter(Boolean).join(' ') : (className ?? undefined)}
        data-end-cap={square}>
        <View
          className={isWeb ? 'mp-chip-dismiss-ring' : undefined}
          alignItems="center"
          justifyContent="center">
          {textChild ?? children}
        </View>
      </InputGlyphButton>
    );
  }

  const square = knobProps.control.height;
  return (
    <InputButton
      touch={hydrationTouch}
      ref={decorativeRef}
      size={size}
      height={square}
      width={square}
      // size-recipe-escape: square end-cap; pad lives on Input.Box
      paddingHorizontal={0}
      color={paint}
      // The decorative cap is not a tab stop. tabIndex alone is not
      // enough — TButton re-derives focusability and stamps tabindex="0".
      focusable={false}
      tabIndex={-1}
      className={className}
      data-end-cap={square}
      {...props}>
      {textChild ?? getThemedIcon(children)}
    </InputButton>
  );
});

// ---------------------------------------------------------------------------
// Input.Icon
// ---------------------------------------------------------------------------

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const InputIconFrame = styled(View, {
  name: 'InputIconFrame',
  justifyContent: 'center',
  alignItems: 'center',
  context: InputContext,

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      ...(recipeFamilies.control.iconVariants ?? sizeRecipeIconVariants),
      '...size': sizeRecipeIconFallback,
    },
    adornment: {
      leading: {},
      trailing: {},
    },
  } as const,
});

const InputIcon = InputIconFrame.styleable<{
  scaleIcon?: number;
  color?: string;
  adornment?: 'leading' | 'trailing';
}>((iconProps, ref) => {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- tamagui types styled-component `children` as any
  const { children, color: colorProp, scaleIcon: scaleIconProp, ...props } = iconProps;
  const hydrationTouch = useTouchSurface();
  const { size, color: contextColor, scaleIcon } = InputContext.useStyledContext();
  const { knobProps } = useResolvedKnobs();
  const resolvedScaleIcon = scaleIconProp ?? scaleIcon;

  const theme = useTheme();
  const rawColor = colorProp ?? contextColor;
  // .val, not .get("web") — the web getter is undefined on native and
  // leaves Phosphor black in dark mode.
  const color = String(
    getVariable(resolveGlyphPaint(theme, rawColor === undefined || rawColor === '' ? 'borderColor' : rawColor)),
  );
  const iconSize = knobProps.controlIcon.width * resolvedScaleIcon;

  const getThemedIcon = useGetThemedIcon({ size: iconSize, color });
  return (
    <InputIconFrame
      touch={hydrationTouch}
      ref={ref}
      size={size}
      {...knobProps.controlIcon}
      width={iconSize}
      height={iconSize}
      {...props}>
      {getThemedIcon(children)}
    </InputIconFrame>
  );
});

// ---------------------------------------------------------------------------
// Input (root container — provides context, manages theme on error)
// ---------------------------------------------------------------------------

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const InputContainerFrame = styled(View, {
  name: 'InputContainerFrame',
  context: InputContext,
  flexDirection: 'column',

  variants: {
    touch: { true: {}, false: {} },
    size: {
      // Size is shared with the child parts; layout spacing belongs to space.
      '...size': () => ({}),
    },
    color: {
      '...color': () => ({}),
    },
    scaleIcon: {
      ':number': () => ({}),
    },
    gapScale: {
      ':number': () => ({}),
    },
  } as const,

  defaultVariants: {
    size: '$4',
  },
});

const InputContainerImpl = InputContainerFrame.styleable((props, forwardedRef) => {
  const hydrationTouch = useTouchSurface();
  const { knobProps } = useResolvedKnobs();
  const inTableCell = useIsInTableCell();
  return (
    <InputContainerFrame
      touch={hydrationTouch}
      ref={forwardedRef}
      size={knobProps.sizeToken}
      {...knobProps.body}
      {...knobProps.gap}
      // Inside a table cell the field root must adopt
      // the cell width — the raw web <input> carries an intrinsic width that
      // otherwise floors the whole column at ~200px and lays out past the
      // cell clip box (measured 109.8px past on the stepper columns).
      {...(inTableCell ? { maxWidth: '100%' as const, minWidth: 0 } : undefined)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Input.Label
// ---------------------------------------------------------------------------

const InputLabelFrame = styled(Label, {
  context: InputContext,
  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: getFontSized is typed against TextProps' final props; Label's resolve to the same font-size spread at runtime
      '...fontSize': getFontSized as never,
    },
  } as const,
});

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const InputLabel = InputLabelFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <InputLabelFrame
      ref={ref}
      {...knobProps.body}
      color={knobProps.textAccentColor}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Input.Info  (helper / error text)
// ---------------------------------------------------------------------------

/** Helper text runs at 80% of the font ramp entry (a Variable). */
const scaledFontValue = (entry: { val: number } | undefined): number => Number(entry?.val) * 0.8;

const InputInfoFrame = styled(Text, {
  context: InputContext,
  color: formCommonColors.text,

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      '...fontSize': (val, { font }) => {
        if (!font) {
          return {};
        }
        // SAFETY: GenericFont.weight is a `$n` -> weight table at runtime; the app's font config types it as never
        const weightTable = font.weight as { $2?: ComponentProps<typeof Text>['fontWeight'] } | undefined;
        return {
          fontSize: scaledFontValue(font.size[val]),
          lineHeight: scaledFontValue(font.lineHeight?.[val]),
          fontWeight: weightTable?.$2,
          letterSpacing: font.letterSpacing?.[val],
          textTransform: font.transform?.[val],
          fontStyle: font.style?.[val],
        };
      },
    },
  } as const,
});

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const InputInfo = InputInfoFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <InputInfoFrame
      ref={ref}
      {...knobProps.body}
      {...props}
    />
  );
});

/**
 * Caption under the control: one reserved message slot (STABLE GROUND).
 * The validation error replaces the helper in place — never a
 * second line — so surfacing an error shifts no layout. Matches FieldLayout.
 */
export const InputFieldMeta = ({
  helperText,
  displayError,
}: {
  helperText?: string;
  displayError?: string | boolean;
}) => {
  const errorMessage = isString(displayError) && displayError.length > 0 ? displayError : undefined;
  if (errorMessage !== undefined) {
    return (
      <InputInfo
        color={formCommonColors.error}
        role="alert"
        aria-live="polite">
        {errorMessage}
      </InputInfo>
    );
  }
  if (helperText === undefined || helperText === '') {
    return null;
  }
  return <InputInfo>{helperText}</InputInfo>;
};

// ---------------------------------------------------------------------------
// Input.XGroup
// ---------------------------------------------------------------------------

const InputXGroup = styled(XGroup, {
  context: InputContext,

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': () => ({}),
    },
    size: {
      '...size': () => ({}),
    },
  } as const,
});

// ---------------------------------------------------------------------------
// FocusWiredTextArea – reusable ThemedTextArea that syncs focus to FocusContext
// ---------------------------------------------------------------------------

type TamaguiTextAreaProps = ComponentProps<typeof ThemedTextArea>;

export const FocusWiredTextArea = (props: TamaguiTextAreaProps & { innerRef?: TamaguiTextAreaProps['ref'] }) => {
  const { setFocused } = FocusContext.useStyledContext();
  const {
    innerRef,
    onFocus,
    onBlur,
    className,
    focusStyle,
    focusVisibleStyle,
    'aria-describedby': describedByProp,
    ...rest
  } = props;
  const fieldDescribedBy = useFieldDescribedBy();
  const nativeA11yProps = useNativeFieldA11yProps();
  const describedBy = [fieldDescribedBy, describedByProp].filter(Boolean).join(' ');
  if (isWeb) {
    ensureInputPartsFocusRing();
  }
  // The inner <textarea> never paints a ring. Same lock as Input.Area —
  // Box carries the ring; outline:none after `{...rest}` so a consumer
  // focusStyle cannot put the ring back on the field.
  const killInnerRing = {
    ...webAreaAttrs(className),
    ...AREA_NO_OUTLINE,
    focusStyle: { ...focusStyle, ...AREA_NO_OUTLINE },
    focusVisibleStyle: { ...focusVisibleStyle, ...AREA_NO_OUTLINE },
  };
  return (
    <View
      flex={1}
      minWidth={0}>
      <ThemedTextArea
        aria-describedby={describedBy === '' ? undefined : describedBy}
        aria-multiline="true"
        {...nativeA11yProps}
        ref={innerRef}
        width="100%"
        {...rest}
        {...killInnerRing}
        onFocus={(e: FocusEvent<HTMLDivElement>) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLDivElement>) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Compound component
// ---------------------------------------------------------------------------

const InputCompound = Object.assign(InputContainerImpl, {
  Box: InputGroupImpl,
  Area: InputAreaImpl,
  TextArea: FocusWiredTextArea,
  Section: InputSection,
  Button: InputButtonImpl,
  Icon: InputIcon,
  Info: InputInfo,
  Meta: InputFieldMeta,
  Label: InputLabel,
  XGroup: Object.assign(InputXGroup, { Item: XGroup.Item }),
});

// oxlint-disable-next-line react-doctor/only-export-components -- InputParts is a shared parts module: field components import these contexts, frames and helpers alongside the components
export const Input = InputCompound;
