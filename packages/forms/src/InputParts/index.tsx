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
  type RecipeFamilyName,
} from '@repo/theme';
import { getFontSized } from '@tamagui/get-font-sized';
import type { SizeVariantSpreadFunction } from '@tamagui/web';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ComponentProps, Ref, RefObject } from 'react';
import { Pressable as RNPressable } from 'react-native';
import type { ColorTokens, FontSizeTokens, InputKeyboardType, InputTextContentType, TamaguiElement } from 'tamagui';
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

import { useFieldA11y, useFieldDescribedBy } from '../fieldLayout';
import { formButtonColors, formCommonColors, formInputColors } from '../shared/colorRamps';
import { useControlGrouped } from '../shared/groupContext';
import { useIsInTableCell } from '../shared/tableCellContext';

/**
 * Native-only accessible name/hint from the field context. Web keeps its
 * audited aria-labelledby/-describedby wiring; iOS needs the strings on the
 * control itself. Spread BEFORE consumer props so an explicit
 * accessibilityLabel / aria-label ejects.
 */
function useNativeFieldA11yProps() {
  const fieldA11y = useFieldA11y();
  if (isWeb || !fieldA11y) {
    return undefined;
  }
  return {
    ...(fieldA11y.label ? { accessibilityLabel: fieldA11y.label } : undefined),
    ...(fieldA11y.description ? { accessibilityHint: fieldA11y.description } : undefined),
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const defaultContextValues = {
  size: '$true' as FontSizeTokens,
  scaleIcon: 1,
  touch: !isWeb && isTouchSurface(),
  color: undefined as ColorTokens | string | undefined,
};

export const InputContext = createStyledContext<{
  size: FontSizeTokens;
  scaleIcon: number;
  touch: boolean;
  color?: ColorTokens | string;
}>(defaultContextValues);

/** Square end-cap of recipe.height — generated, never handwritten. */
function endCapVariantsFromHeights(heightVariants: Record<string, { height: number }>) {
  return Object.fromEntries(
    Object.entries(heightVariants).map(([token, { height }]) => [
      token,
      { height, width: height, paddingHorizontal: 0 as const },
    ]),
  );
}

const sizeRecipeEndCapVariants = endCapVariantsFromHeights(recipeFamilies.control.heightVariants);

function sizeRecipeBoxFallback(val: unknown, extras: { props: { touch?: boolean } }) {
  const recipe = sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return {
    height: recipe.height,
    paddingHorizontal: recipe.paddingHorizontal,
    gap: recipe.gap,
  };
}

function sizeRecipeTypeFallback(val: unknown, extras: { props: { touch?: boolean } }) {
  return {
    fontSize: sizeRecipeForToken(String(val ?? '$true'), {
      touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
    }).fontSize,
  };
}

function sizeRecipeIconFallback(val: unknown, extras: { props: { touch?: boolean } }) {
  const { iconSize } = sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return { width: iconSize, height: iconSize };
}

function sizeRecipeEndCapFallback(val: unknown, extras: { props: { touch?: boolean } }) {
  const { height } = sizeRecipeForToken(String(val ?? '$true'), {
    touch: extras.props.touch ?? (!isWeb && isTouchSurface()),
  });
  return { height, width: height, paddingHorizontal: 0 };
}

// ---------------------------------------------------------------------------
// Focus forwarding
// ---------------------------------------------------------------------------

export const FocusContext = createStyledContext({
  setFocused: (_val: boolean) => {},
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
const inputFrameCssTimings: Record<string, string> = {
  bouncy: 'ease-in 200ms',
  lazy: 'ease-in 600ms',
  slow: 'ease-in 500ms',
  medium: 'ease-in-out 250ms',
  quick: 'ease-in 100ms',
  tooltip: 'ease-in 400ms',
  snappy: 'ease-out 80ms',
  gentle: 'ease-in-out 450ms',
};

export function getInputFrameTransitionProps(transition: string | undefined) {
  if (!transition) {
    return undefined;
  }
  if (!isWeb) {
    return { transition };
  }
  const timing = inputFrameCssTimings[transition] ?? inputFrameCssTimings.quick;
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
}

/** Resting outline: transparent + 0 width so blur never lands on theme `$outlineColor`. */
const inputOutlineRest = {
  outlineWidth: 0,
  outlineColor: 'transparent',
  outlineStyle: 'solid' as any,
} as const;

const inputOutlineFocus = {
  outlineColor: '$outlineColor',
  outlineWidth: 2,
  outlineStyle: 'solid' as any,
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

export function boxRingMode(overflow: BoxOverflow, paintsRing: boolean): 'inset' | 'outset' | undefined {
  if (!paintsRing) {
    return undefined;
  }
  return overflow === 'hidden' ? 'inset' : 'outset';
}

export function boxRingOffset(mode: 'inset' | 'outset' | undefined): number {
  // Both branches are sanctioned offsets: the clipping inset when the
  // Box clips its adornments, the shape halo when it does not.
  return mode === 'outset' ? FOCUS_RING_HALO_OFFSET : FOCUS_RING_CLIPPED_OFFSET;
}

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

export function ensureInputPartsFocusRing(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(INPUT_PARTS_RING_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = INPUT_PARTS_RING_STYLE_ID;
  tag.textContent = inputPartsRingCss;
  document.head.appendChild(tag);
}

function webBoxRingAttrs(
  overflow: BoxOverflow,
  paintsRing: boolean,
  extraClass?: string,
): Record<string, unknown> | undefined {
  if (!isWeb) {
    return undefined;
  }
  const mode = boxRingMode(overflow, paintsRing);
  const className = [paintsRing ? 'mp-composite-ring' : undefined, extraClass].filter(Boolean).join(' ');
  return {
    ...(className ? { className } : undefined),
    'data-mp-input-box': 'true',
    ...(mode ? { 'data-mp-ring': mode } : undefined),
  };
}

function webAreaAttrs(extraClass?: string): Record<string, unknown> | undefined {
  if (!isWeb) {
    return undefined;
  }
  const className = ['mp-input-area', extraClass].filter(Boolean).join(' ');
  return {
    className,
    'data-mp-input-area': 'true',
  };
}

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
  ...(isWeb ? { className: 'mp-composite-ring' } : {}),

  variants: {
    touch: { true: {}, false: {} },
    unstyled: {
      false: defaultInputGroupStyles,
    },
    scaleIcon: {
      ':number': {} as any,
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
function wrapNativePressable(onPress: ((e?: any) => void) | undefined, disabled: boolean | undefined, node: ReactNode) {
  if (isWeb || !onPress) {
    return node;
  }
  return (
    <RNPressable
      onPress={onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      style={disabled ? { opacity: 0.5 } : undefined}>
      <View pointerEvents="none" collapsable={false} width="100%">
        {node}
      </View>
    </RNPressable>
  );
}

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
  recipeFamily?: RecipeFamilyName;
  /**
   * Opt-in to an explicit numeric `height` / `paddingHorizontal`. Required
   * when those props are numbers; without it DEV-warns `size-recipe-escape`
   * and the size recipe still wins.
   */
  sizeRecipeEscape?: string;
}>((groupProps, forwardedRef) => {
  const {
    children,
    onPress,
    disabled,
    suppressFocusRing,
    recipeFamily = 'control',
    sizeRecipeEscape,
    height: heightProp,
    paddingHorizontal: paddingHorizontalProp,
    ...props
  } = groupProps as typeof groupProps & {
    onPress?: (e?: any) => void;
    disabled?: boolean;
    height?: unknown;
    paddingHorizontal?: unknown;
  };
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
  const hasElevation = knobProps.elevation != null;
  const hasWebPressSlop = isWeb && (props as { 'data-mp-press-slop'?: string })['data-mp-press-slop'] != null;
  const boxOverflow: BoxOverflow = paintsRing && !(hasElevation && !isWeb) && !hasWebPressSlop ? 'hidden' : 'visible';
  const ringMode = boxRingMode(boxOverflow, paintsRing);
  if (isWeb) {
    ensureCompositeFocusRing();
    ensureInputPartsFocusRing();
  }
  const boxRingAttrs = webBoxRingAttrs(boxOverflow, paintsRing, (props as { className?: string }).className);

  // DEV guardrails (tree-shaken in production).
  warnPositiveTabIndex({
    value: (props as { tabIndex?: number | string }).tabIndex,
    component: 'Input.Box',
  });
  warnOutlineNone((props as { focusVisibleStyle?: object }).focusVisibleStyle, {
    component: 'Input.Box',
  });
  warnSizeRecipeEscape({
    height: heightProp,
    paddingHorizontal: paddingHorizontalProp,
    sizeRecipeEscape,
    component: 'Input.Box',
    id: typeof (props as { id?: string }).id === 'string' ? (props as { id?: string }).id : undefined,
  });
  const sizeToken = String((props as { size?: unknown }).size ?? knobProps.sizeToken);
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
  const radiusToken = knobProps.borderRadius.borderRadius;
  const radiusStop =
    typeof radiusToken === 'string'
      ? SIZE_RECIPE_RADIUS_TOKEN_TO_STOP[radiusToken as keyof typeof SIZE_RECIPE_RADIUS_TOKEN_TO_STOP]
      : undefined;
  const sizeTableRadius =
    radiusStop === 'medium' || radiusStop == null
      ? {
          borderRadius: resolveControlRadius(sizeRecipeForToken(sizeToken, { family: recipeFamily }), 'medium').radius,
        }
      : undefined;
  const sizeRecipeEscaped = typeof sizeRecipeEscape === 'string' && sizeRecipeEscape.trim().length > 0;
  const sizeRecipeEscapeOverride = sizeRecipeEscaped
    ? {
        ...(typeof heightProp === 'number' ? { height: heightProp } : undefined),
        ...(typeof paddingHorizontalProp === 'number' ? { paddingHorizontal: paddingHorizontalProp } : undefined),
      }
    : undefined;
  const passthroughSizeProps = {
    ...(typeof heightProp !== 'number' && heightProp != null ? { height: heightProp } : undefined),
    ...(typeof paddingHorizontalProp !== 'number' && paddingHorizontalProp != null
      ? { paddingHorizontal: paddingHorizontalProp }
      : undefined),
  };
  // Text-field inset, not the button ladder padX. Multiline Box
  // (height="auto") leaves padX to ThemedTextArea so padX === padY.
  const fieldInset = heightProp === 'auto' ? 0 : textFieldInset(familyRecipe);
  const insetPadProps =
    sizeRecipeEscaped || (typeof paddingHorizontalProp !== 'number' && paddingHorizontalProp != null)
      ? undefined
      : { paddingHorizontal: fieldInset };

  // Chromeless rendering inside table cells
  if (inTableCell) {
    return (
      <FocusContext.Provider focused={focused} setFocused={setFocused}>
        {wrapNativePressable(
          onPress,
          disabled,
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
        )}
      </FocusContext.Provider>
    );
  }

  if (grouped) {
    return wrapNativePressable(
      onPress,
      disabled,
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
    );
  }

  // Covered by an overlay panel (see prop doc): keep the focus border color
  // but draw no ring on either focus path. This is an intentional a11y
  // exception — the open panel is the focus affordance while it covers this
  // box. Hoisted (with `undefined` in the union) so the JSX spread does not
  // re-specify focusStyle/focusVisibleStyle literally (TS2783 under the
  // build tsconfig).
  const suppressedRingProps = suppressFocusRing
    ? {
        focusStyle: { borderColor: formInputColors.border.focus, ...inputOutlineRest },
        focusVisibleStyle: {
          borderColor: formInputColors.border.focus,
          ...inputOutlineRest,
        },
      }
    : undefined;

  return (
    <FocusContext.Provider focused={focused} setFocused={setFocused}>
      {wrapNativePressable(
        onPress,
        disabled,
        <InputGroupFrame
          touch={hydrationTouch}
          ref={forwardedRef}
          {...knobProps.body}
          size={knobProps.sizeToken}
          {...controlFragment}
          backgroundColor={knobProps.inputBackground}
          {...(knobProps.elevation == null ? { elevation: undefined } : knobProps.elevationChrome)}
          {...knobProps.borderRadius}
          {...sizeTableRadius}
          {...getInputFrameTransitionProps(typeof knobProps.transition === 'string' ? knobProps.transition : undefined)}
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
          {...(focused && !suppressFocusRing
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
              })}
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
      )}
    </FocusContext.Provider>
  );
});

// ---------------------------------------------------------------------------
// Input size variant helper
// ---------------------------------------------------------------------------

export const KEYBOARD_TO_INPUT_MODE = {
  'phone-pad': 'tel',
  'number-pad': 'numeric',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  numeric: 'numeric',
} as const;

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

export function mapKeyboardTypeToInputMode(keyboardType?: string): MappedInputMode | undefined {
  if (!keyboardType) {
    return undefined;
  }
  return KEYBOARD_TO_INPUT_MODE[keyboardType as keyof typeof KEYBOARD_TO_INPUT_MODE];
}

export function mapInputModeToKeyboardType(inputMode?: string): MappedKeyboardType | undefined {
  if (!inputMode) {
    return undefined;
  }
  return INPUT_MODE_TO_KEYBOARD[inputMode as keyof typeof INPUT_MODE_TO_KEYBOARD];
}

export const inputSizeVariant: SizeVariantSpreadFunction<any> = (val = '$true', extras) => {
  const recipe = sizeRecipeForToken(String(val || '$true'), {
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
  outlineStyle: 'none' as any,
  outlineColor: 'transparent',
  ...(isWeb ? { className: 'mp-input-area' } : {}),
  focusStyle: {
    outlineWidth: 0,
    outlineStyle: 'none' as any,
    outlineColor: 'transparent',
  },
  focusVisibleStyle: {
    outlineWidth: 0,
    outlineStyle: 'none' as any,
    outlineColor: 'transparent',
  },
  variants: {
    touch: { true: {}, false: {} },
    size: {
      ...(recipeFamilies.control.typeVariants ?? sizeRecipeTypeVariants),
      '...size': sizeRecipeTypeFallback,
    },
    scaleIcon: {
      ':number': {} as any,
    },
  } as const,
});

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
  } = areaProps as typeof areaProps & {
    focusStyle?: Record<string, unknown>;
    focusVisibleStyle?: Record<string, unknown>;
    className?: string;
    inputMode?: InputModeValue;
    type?: string;
    flex?: number | string;
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    height?: number | string;
    minHeight?: number | string;
    maxHeight?: number | string;
  };
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const fieldDescribedBy = useFieldDescribedBy();
  const nativeA11yProps = useNativeFieldA11yProps();
  const inTableCell = useIsInTableCell();
  if (isWeb) {
    ensureInputPartsFocusRing();
  }
  // Do not strip native keyboard hints. Map phone-pad↔tel,
  // number-pad↔numeric, decimal-pad↔decimal, email-address↔email.
  const resolvedInputMode = inputModeProp ?? mapKeyboardTypeToInputMode(keyboardType);
  const resolvedKeyboardType = keyboardType ?? mapInputModeToKeyboardType(resolvedInputMode);
  // Duration (and any Area with a numeric width / flex 0) must not sit inside
  // a flex:1 wrapper — that wrapper grows with the Box, then Section's
  // justifyContent:center floats the cluster in the leftover space. OTP still
  // pins width on Box, not Area, so it keeps the grow wrapper.
  const hugWidth = flexProp === 0 || typeof widthProp === 'number';

  return (
    // In a table cell the flex wrapper and the raw
    // input must be allowed to shrink below the <input>'s intrinsic width
    // (min-width:auto floors flex items at it); width 100% makes the input
    // adopt the flexed width instead of its size-attribute default. Explicit
    // consumer widths (OTP digit boxes) still win via the later spread.
    <View
      flex={hugWidth ? 0 : 1}
      {...(hugWidth && typeof widthProp === 'number'
        ? {
            width: widthProp,
            minWidth: minWidthProp ?? widthProp,
            maxWidth: maxWidthProp ?? widthProp,
          }
        : undefined)}
      {...(heightProp != null
        ? { height: heightProp, minHeight: minHeightProp ?? 0, maxHeight: maxHeightProp }
        : undefined)}
      {...(inTableCell ? { minWidth: 0 } : undefined)}>
      <InputFrame
        touch={hydrationTouch}
        aria-describedby={fieldDescribedBy}
        {...nativeA11yProps}
        ref={ref}
        size={size}
        {...knobProps.controlType}
        color={knobProps.textAccentColor}
        placeholderTextColor={theme.placeholderColor?.val ?? '$placeholderColor'}
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
        autoComplete={
          textContentType === 'emailAddress'
            ? 'email'
            : textContentType === 'password'
              ? 'current-password'
              : textContentType === 'telephoneNumber'
                ? 'tel'
                : textContentType === 'oneTimeCode'
                  ? 'one-time-code'
                  : undefined
        }
        {...props}
        {...(flexProp != null ? { flex: flexProp } : undefined)}
        {...(widthProp != null ? { width: widthProp, minWidth: minWidthProp, maxWidth: maxWidthProp } : undefined)}
        {...(heightProp != null
          ? { height: heightProp, minHeight: minHeightProp, maxHeight: maxHeightProp }
          : undefined)}
        {...webAreaAttrs(classNameProp)}
        {...(isWeb && typeof heightProp === 'number'
          ? {
              // Beat the UA / `$true` 44px min on <input> when a recipe height is set
              // (Duration size:$3 is 36; a 44 input overflows the box).
              style: {
                height: heightProp,
                minHeight: typeof minHeightProp === 'number' ? minHeightProp : 0,
                maxHeight: typeof maxHeightProp === 'number' ? maxHeightProp : heightProp,
              },
            }
          : undefined)}
        {...AREA_NO_OUTLINE}
        focusStyle={{ ...focusStyleProp, ...AREA_NO_OUTLINE }}
        focusVisibleStyle={{ ...focusVisibleStyleProp, ...AREA_NO_OUTLINE }}
        onFocus={(e: any) => {
          setFocused(true);
          (onFocusProp as any)?.(e);
        }}
        onBlur={(e: any) => {
          setFocused(false);
          (onBlurProp as any)?.(e);
        }}
        onChange={
          onChangeText || onChangeProp
            ? (e: any) => {
                const text = e.target?.value ?? e.nativeEvent?.text ?? '';
                onChangeText?.(text);
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
      ':number': {} as any,
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
      ':number': {} as any,
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
      ':number': {} as any,
    },
    size: {
      ...sizeRecipeEndCapVariants,
      '...size': sizeRecipeEndCapFallback,
    },
  } as const,
});

const InputButtonImpl = InputButton.styleable<{ glyphRing?: boolean }>((buttonProps, ref) => {
  const {
    children,
    color: colorProp,
    glyphRing,
    size: sizeProp,
    tabIndex: tabIndexProp,
    className,
    ...props
  } = buttonProps as typeof buttonProps & {
    color?: string;
    glyphRing?: boolean;
    size?: FontSizeTokens;
    tabIndex?: number;
    className?: string;
  };
  const { size: contextSize, color: contextColor } = InputContext.useStyledContext();
  const hydrationTouch = useTouchSurface();
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const size = (sizeProp ?? contextSize) as FontSizeTokens;
  const paint = resolveGlyphPaint(theme as never, colorProp ?? contextColor);
  const getThemedIcon = useGetThemedIcon({
    size: knobProps.controlIcon.width,
    color: paint as never,
  });
  // A string/number child is a LABEL, not an icon. `getThemedIcon` treats an
  // un-elemented child as a component TYPE and `createElement`s it, so "Scan"
  // becomes an invented `<scan>` element that paints nothing; a bare
  // string under the glyphRing View is the same category error on native.
  const textChild =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text
        {...knobProps.controlType}
        fontFamily={knobProps.body.fontFamily}
        fontWeight={knobProps.body.fontWeight}
        color={paint as never}
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
        node.tabIndex = tabIndexProp ?? -1;
      }
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref, tabIndexProp],
  );

  if (glyphRing) {
    // A real tab stop must square off the token it was HANDED, not the
    // knob's: a $2 field inside a $4 knob would otherwise ship a 44px stop
    // on a 32px frame. The picker trigger contract keeps the sub-floor case pressable via the
    // caller's hitSlop, never by inflating the cap.
    const square = sizeRecipeForToken(String(size ?? '$true'), { touch: hydrationTouch }).height;
    const disabled = (props as { disabled?: boolean }).disabled === true;
    if (isWeb) {
      ensureCompositeFocusRing();
    }
    return (
      <InputGlyphButton
        touch={hydrationTouch}
        ref={ref as never}
        role="button"
        size={size}
        height={square}
        width={square}
        paddingHorizontal={0} // size-recipe-escape: square end-cap; pad lives on Input.Box
        opacity={disabled ? 0.5 : 1}
        {...props}
        aria-disabled={disabled || undefined}
        tabIndex={tabIndexProp ?? (disabled ? -1 : 0)}
        className={isWeb ? ['mp-chip-dismiss', className].filter(Boolean).join(' ') : (className ?? undefined)}
        data-end-cap={square}>
        <View className={isWeb ? 'mp-chip-dismiss-ring' : undefined} alignItems="center" justifyContent="center">
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
      paddingHorizontal={0} // size-recipe-escape: square end-cap; pad lives on Input.Box
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

export const InputIconFrame = styled(View, {
  name: 'InputIconFrame',
  justifyContent: 'center',
  alignItems: 'center',
  context: InputContext,

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': {} as any,
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
  color?: ColorTokens | string;
  adornment?: 'leading' | 'trailing';
}>((iconProps, ref) => {
  const { children, color: colorProp, scaleIcon: scaleIconProp, ...props } = iconProps;
  const hydrationTouch = useTouchSurface();
  const { size = '$true', color: contextColor, scaleIcon = 1 } = InputContext.useStyledContext();
  const { knobProps } = useResolvedKnobs();
  const resolvedScaleIcon = scaleIconProp ?? scaleIcon;

  const theme = useTheme();
  const rawColor = colorProp ?? contextColor;
  // .val, not .get("web") — the web getter is undefined on native and
  // leaves Phosphor black in dark mode.
  const color = getVariable(resolveGlyphPaint(theme as never, rawColor ? String(rawColor) : 'borderColor'));
  const iconSize = knobProps.controlIcon.width * resolvedScaleIcon;

  const getThemedIcon = useGetThemedIcon({ size: iconSize, color: color });
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
      ':number': {} as any,
    },
    gapScale: {
      ':number': {} as any,
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
      ':number': {} as any,
    },
    size: {
      '...fontSize': getFontSized as any,
    },
  } as const,
});

export const InputLabel = InputLabelFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return <InputLabelFrame ref={ref} {...knobProps.body} color={knobProps.textAccentColor} {...props} />;
});

// ---------------------------------------------------------------------------
// Input.Info  (helper / error text)
// ---------------------------------------------------------------------------

const InputInfoFrame = styled(Text, {
  context: InputContext,
  color: formCommonColors.text,

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': {} as any,
    },
    size: {
      '...fontSize': (val, { font }) => {
        if (!font) {
          return;
        }
        const fontSize = (font.size[val] as any)?.val * 0.8;
        const lineHeight = (font.lineHeight?.[val] as any)?.val * 0.8;
        const fontWeight = (font.weight as any)?.$2;
        const letterSpacing = font.letterSpacing?.[val];
        const textTransform = font.transform?.[val];
        const fontStyle = font.style?.[val];
        return {
          fontSize,
          lineHeight,
          fontWeight,
          letterSpacing,
          textTransform,
          fontStyle,
        };
      },
    },
  } as const,
});

export const InputInfo = InputInfoFrame.styleable((props, ref) => {
  const { knobProps } = useResolvedKnobs();
  return <InputInfoFrame ref={ref} {...knobProps.body} {...props} />;
});

/**
 * Caption under the control: one reserved message slot (STABLE GROUND).
 * The validation error replaces the helper in place — never a
 * second line — so surfacing an error shifts no layout. Matches FieldLayout.
 */
export function InputFieldMeta({ helperText, displayError }: { helperText?: string; displayError?: string | boolean }) {
  const errorMessage =
    displayError && typeof displayError === 'string' && displayError.length > 0 ? displayError : undefined;
  if (errorMessage) {
    return (
      <InputInfo color={formCommonColors.error} role="alert" aria-live="polite">
        {errorMessage}
      </InputInfo>
    );
  }
  if (!helperText) {
    return null;
  }
  return <InputInfo>{helperText}</InputInfo>;
}

// ---------------------------------------------------------------------------
// Input.XGroup
// ---------------------------------------------------------------------------

const InputXGroup = styled(XGroup, {
  context: InputContext,

  variants: {
    touch: { true: {}, false: {} },
    scaleIcon: {
      ':number': {} as any,
    },
    size: {
      '...size': () => ({}),
    },
  } as const,
});

// ---------------------------------------------------------------------------
// FocusWiredTextArea – reusable ThemedTextArea that syncs focus to FocusContext
// ---------------------------------------------------------------------------

import { ThemedTextArea } from '../themedPrimitives';

type TamaguiTextAreaProps = ComponentProps<typeof ThemedTextArea>;

export function FocusWiredTextArea(props: TamaguiTextAreaProps & { innerRef?: Ref<any> }) {
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
  } = props as TamaguiTextAreaProps & {
    innerRef?: Ref<any>;
    className?: string;
    focusStyle?: Record<string, unknown>;
    focusVisibleStyle?: Record<string, unknown>;
    'aria-describedby'?: string;
  };
  const fieldDescribedBy = useFieldDescribedBy();
  const nativeA11yProps = useNativeFieldA11yProps();
  const describedBy = [fieldDescribedBy, describedByProp].filter(Boolean).join(' ') || undefined;
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
    <View flex={1} minWidth={0}>
      <ThemedTextArea
        aria-describedby={describedBy}
        aria-multiline="true"
        {...nativeA11yProps}
        ref={innerRef}
        width="100%"
        {...rest}
        {...killInnerRing}
        onFocus={(e: any) => {
          setFocused(true);
          (onFocus as any)?.(e);
        }}
        onBlur={(e: any) => {
          setFocused(false);
          (onBlur as any)?.(e);
        }}
      />
    </View>
  );
}

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

export const Input = InputCompound;
